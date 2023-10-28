const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle() => ", () => {
          let raffle, raffleAddress, raffleEntranceFee, signer

          beforeEach(async () => {
              const accounts = await ethers.getSigners()
              signer = accounts[0]

              const RaffleDeployment = await deployments.get("Raffle")
              raffle = await ethers.getContractAt(
                  RaffleDeployment.abi,
                  RaffleDeployment.address,
                  signer,
              )

              raffleAddress = await raffle.getAddress()
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", () => {
              it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async () => {
                  const startingTimestamp = await raffle.getLatestTimestamp()

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("[LOG] WinnerPicked event fired!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const endingTimestamp = await raffle.getLatestTimestamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              const winnerEndingBalance = await ethers.provider.getBalance(
                                  signer.address,
                              )

                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(recentWinner.toString(), signer.address)
                              assert.equal(raffleState.toString(), "0")

                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  (winnerStartingBalance + raffleEntranceFee).toString(),
                              )

                              assert(endingTimestamp > startingTimestamp)
                          } catch (e) {
                              console.log(e)
                              reject(e)
                          }
                          resolve()
                      })

                      console.log("[LOG] Entering Raffle...")
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)
                      console.log("[LOG] Ok, time to wait...")

                      const winnerStartingBalance = await ethers.provider.getBalance(signer.address)
                  })
              })
          })
      })
