import { Keypair } from "@solana/web3.js";
import { DualTokenTransfer } from "./SIPtoSOL.js"; // Assuming you saved the updated class in this file
import {
  getAddressFromPrivateKey,
  contractPrincipalCV,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import * as fs from "fs";

async function main() {
  try {
    // Load Solana keypair - you can replace this with your preferred method
    // This example assumes you have a Solana keypair in a JSON file
    const keypairData = JSON.parse(fs.readFileSync("./Keypair.json", "utf-8"));
    const solanaKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

    // Your Stacks private key
    const stacksPrivateKey =
      "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01"; // Replace with your actual private key

    // Create instance of DualTokenTransfer
    const dualTransfer = new DualTokenTransfer(solanaKeypair, stacksPrivateKey);

    // Check balances before swap
    const solBalance = await dualTransfer.checkSolanaBalance(
      solanaKeypair.publicKey
    );
    console.log(`Current SOL balance: ${solBalance} SOL`);

    const stacksAddress = getAddressFromPrivateKey(
      stacksPrivateKey,
      STACKS_TESTNET
    );
    const tokenBalance = await dualTransfer.getStacksBalance(stacksAddress);
    console.log(`Current KRYPT token balance: ${tokenBalance.toString()}`);

    // Execute the swap - specify amounts to swap
    const tokenAmountToSwap = 1000000000000000000n; // 1 KRYPT token with 18 decimals
    const solAmountToRelease = 0.1; // Amount of SOL to release

    // Perform the swap with approval and transfer
    const result = await dualTransfer.executeSwap(
      tokenAmountToSwap,
      solAmountToRelease
    );

    console.log("\n=== Swap Result ===");
    console.log(`Status: ${result.status}`);
    console.log(`Approval Transaction ID: ${result.approvalTransactionId}`);
    console.log(`Transfer Transaction ID: ${result.transferTransactionId}`);
    console.log(`Solana Transaction ID: ${result.solanaTransactionId}`);

    // Check balances after swap
    console.log("\n=== Final Balances ===");
    const finalSolBalance = await dualTransfer.checkSolanaBalance(
      solanaKeypair.publicKey
    );
    console.log(`Final SOL balance: ${finalSolBalance} SOL`);

    const BRIDGE_CONTRACT_ADDRESS = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    const BRIDGE_CONTRACT_NAME = "Bridg";
    const FinalAddress = contractPrincipalCV(
      BRIDGE_CONTRACT_ADDRESS,
      BRIDGE_CONTRACT_NAME
    );

    const finalTokenBalance = await dualTransfer.getStacksBalance(FinalAddress);
    console.log(`Final KRYPT token balance: ${finalTokenBalance.toString()}`);
  } catch (error) {
    console.error("Error executing token swap:", error);
  }
}

// Run the main function
main()
  .then(() => console.log("Script completed successfully"))
  .catch((error) => console.error("Script failed with error:", error));
