const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle() => ", () => {
          let raffle, raffleAddress, vrfCoordinatorV2Mock, raffleEntranceFee, signer, interval
          const chainId = network.config.chainId

          beforeEach(async () => {
              const accounts = await ethers.getSigners()
              signer = accounts[0]

              await deployments.fixture(["all"])

              const RaffleDeployment = await deployments.get("Raffle")
              raffle = await ethers.getContractAt(
                  RaffleDeployment.abi,
                  RaffleDeployment.address,
                  signer,
              )

              raffleAddress = await raffle.getAddress()

              const VRFCoordinatorV2MockDeployment = await deployments.get("VRFCoordinatorV2Mock")

              vrfCoordinatorV2Mock = await ethers.getContractAt(
                  VRFCoordinatorV2MockDeployment.abi,
                  VRFCoordinatorV2MockDeployment.address,
                  signer,
              )

              raffleEntranceFee = await raffle.getEntranceFee()

              interval = Number(await raffle.getInterval())
          })

          describe("constructor", () => {
              it("initializes the raffle correctly", async () => {
                  const raffleState = await raffle.getRaffleState()
                  const interval = await raffle.getInterval()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterRaffle", () => {
              it("reverts when you don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__NotEnoughETHEntered",
                  )
              })

              it("records players when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, signer.address)
              })

              it("emits event on enter", async () => {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter",
                  )
              })

              it("doesn't allow enter when raffle is calculating", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })

                  await network.provider.send("evm_increaseTime", [interval + 1])
                  await network.provider.send("evm_mine", [])

                  await raffle.performUpkeep("0x")

                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee }),
                  ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen")
              })
          })

          describe("checkUpkeep", () => {
              it("returns false if people haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [interval + 1])
                  await network.provider.send("evm_mine", [])

                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval + 1])
                  await network.provider.send("evm_mine", [])

                  await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")

                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval - 10])
                  await network.provider.send("evm_mine", [])

                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert.equal(upkeepNeeded, false)
              })

              it("returns true if opened, enough time has passed, has players, has balance", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval + 1])
                  await network.provider.send("evm_mine", [])

                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert.equal(upkeepNeeded, true)
              })
          })

          describe("performUpkeep", () => {
              it("it can only run if checkupkeep is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval + 1])
                  await network.provider.send("evm_mine", [])

                  await expect(raffle.performUpkeep("0x")).to.emit(raffle, "RequestedRaffleWinner")
              })

              it("reverts when checkupkeep is false", async () => {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__UpKeenNotNeeded",
                  )
              })
          })

          describe("fulfillRandomWords", () => {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval + 1])
                  await network.provider.send("evm_mine", [])
              })

              it("can only be called after performUpkeep", async () => {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffleAddress),
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffleAddress),
                  ).to.be.revertedWith("nonexistent request")
              })

              it("picks a winner, resets the lottery and sends money", async () => {
                  const additionalEntrants = 3
                  const startingAccontIndex = 1 // deployer = 0
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccontIndex;
                      i < startingAccontIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }

                  const startingTimestamp = await raffle.getLatestTimestamp()

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const endingTimestamp = await raffle.getLatestTimestamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              const winnerEndingBalance =
                                  await ethers.provider.getBalance(recentWinner)

                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimestamp > startingTimestamp)

                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  (
                                      winnerStartingBalance +
                                      raffleEntranceFee * BigInt(additionalEntrants) +
                                      raffleEntranceFee
                                  ).toString(),
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })

                      const tx = await raffle.performUpkeep("0x")
                      const txReceipt = await tx.wait(1)

                      const requestId = txReceipt.logs[1].args.requestId
                      const winnerIdx = Number(requestId)

                      const winnerStartingBalance = await ethers.provider.getBalance(
                          await accounts[winnerIdx].getAddress(),
                      )

                      await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, raffleAddress)
                  })
              })
          })
      })
