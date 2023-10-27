const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle() => ", () => {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, signer, interval
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
      })
