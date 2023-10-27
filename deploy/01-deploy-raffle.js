const { network, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

const VRF_SUB_FUND_AMOUNT = ethers.parseEther("2")

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    let vRFCoordinatorV2, vrfCoordinatorV2Address, subscriptioId
    if (developmentChains.includes(network.name)) {
        const vRFCoordinatorV2MockAddress = (await deployments.get("VRFCoordinatorV2Mock")).address

        vRFCoordinatorV2 = await ethers.getContractAt(
            "VRFCoordinatorV2Mock",
            vRFCoordinatorV2MockAddress,
        )
        vrfCoordinatorV2Address = vRFCoordinatorV2MockAddress
        const transactionResponse = await vRFCoordinatorV2.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)

        subscriptioId = transactionReceipt.logs[0].args.subId
        // Fund the subscription
        await vRFCoordinatorV2.fundSubscription(subscriptioId, VRF_SUB_FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptioId = networkConfig[chainId]["subscriptionId"]
    }

    const entranceFee = networkConfig[chainId]["entranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]

    const args = [
        vrfCoordinatorV2Address,
        entranceFee,
        gasLane,
        subscriptioId,
        callbackGasLimit,
        interval,
    ]

    const raffle = await deploy("Raffle", {
        from: deployer,
        args,
        log: true,
        waitConfirmations: networkConfig?.[chainId].blockConfirmations || 1,
    })

    if (developmentChains.includes(network.name)) {
        await vRFCoordinatorV2.addConsumer(subscriptioId, raffle.address)
    }

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("[LOG] Verifying...")
        verify(raffle.address)
        log("----------------------------------------")
    }
}

module.exports.tags = ["all", "raffle"]
