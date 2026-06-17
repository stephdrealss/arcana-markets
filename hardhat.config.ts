import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const accounts: string[] = (() => {
  let key = process.env.PRIVATE_KEY?.trim();
  if (!key) return [];
  if (key.startsWith("0x")) key = key.slice(2);
  if (key.length !== 64) return [];
  return [`0x${key}`];
})();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: { optimizer: { enabled: true, runs: 1000000 } },
      },
      {
        version: "0.8.20",
        settings: { optimizer: { enabled: true, runs: 1000000 } },
      },
    ],
  },
  networks: {
    arcTestnet: {
      url: process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || "https://rpc.testnet.arc.network",
      accounts,
      chainId: 5042002,
    },
  },
  etherscan: {
    apiKey: {
      arcTestnet: "empty",
    },
    customChains: [
      {
        network: "arcTestnet",
        chainId: 5042002,
        urls: {
          apiURL: "https://testnet.arcscan.app/api",
          browserURL: "https://testnet.arcscan.app",
        },
      },
    ],
  },
};

export default config;
