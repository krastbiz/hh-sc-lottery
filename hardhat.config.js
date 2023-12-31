/** @type import('hardhat/config').HardhatUserConfig */
require("@nomicfoundation/hardhat-toolbox")
require("hardhat-deploy")
require("dotenv").config()

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY

module.exports = {
    solidity: "0.8.7",
    defaultNetwork: "hardhat",
    networks: {
        hardhat: { chainId: 31337, blockConfirmations: 1 },
        sepolia: { chainId: 11155111, url: SEPOLIA_RPC_URL, accounts: [PRIVATE_KEY] },
    },

    gasReporter: {
        enabled: false,
        noColors: true,
        currency: "USD",
        // token: "ETH",
        outputFile: "gas-report.txt",
        // coinmarketcap: COINMARKETCAP_API_KEY,
    },

    etherscan: {
        apiKey: ETHERSCAN_API_KEY,
    },

    namedAccounts: {
        deployer: {
            default: 0,
        },
        player: {
            default: 1,
        },
    },
    mocha: {
        timeout: 1000000, // 1000 seconds max
    },
}
