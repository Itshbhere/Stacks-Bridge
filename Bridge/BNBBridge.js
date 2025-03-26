import { TokenBridgeContract } from "./TokenBridgeClass.js";
import { ethers } from "ethers";
import { config } from "dotenv";
config();

async function main() {
  const bridgeContract = new TokenBridgeContract(
    "0x365bc3A714E2a40beB8CC8A9752beE89bC0c02d3",
    process.env.PRIVATE_KEY,
    "https://rpc-vanguard.vanarchain.com"
  );

  try {
    // Check initial contract balance
    console.log("Initial Contract Balance:");
    await bridgeContract.getContractBalance();

    // Send 1 ETH to the contract
    console.log("\nSending 1 ETH to the contract...");
    await bridgeContract.sendEther(ethers.parseEther("1"));

    // Check updated contract balance
    console.log("\nUpdated Contract Balance:");
    await bridgeContract.getContractBalance();

    // Lock 0.5 ETH to a recipient (owner-only function)
    console.log("\nLocking 0.5 ETH to recipient...");
    await bridgeContract.lockEther(
      ethers.parseEther("0.5"),
      "0x39560d86283C669F09f66fd2143194A38ac44933"
    );

    // Check final contract balance
    console.log("\nFinal Contract Balance:");
    await bridgeContract.getContractBalance();
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
