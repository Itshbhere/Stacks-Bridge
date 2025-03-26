import { TokenBridgeContract } from "./TokenBridgeClass.js";
import { ethers } from "ethers";
import { config } from "dotenv";
config();

async function main() {
  const bridgeContract = new TokenBridgeContract(
    "0x03b29B9B1B542E90Ac1889496E69e5d3345817cb",
    process.env.PRIVATE_KEY,
    "https://rpc-vanguard.vanarchain.com"
  );

  // Deposit 1 ETH
  await bridgeContract.depositEth(ethers.parseEther("1"));

  // Lock 0.5 ETH to a recipient
  await bridgeContract.lockEther(
    ethers.parseEther("0.5"),
    "0x39560d86283C669F09f66fd2143194A38ac44933"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
