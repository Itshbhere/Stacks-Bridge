import {
  standardPrincipalCV,
  uintCV,
  someCV,
  noneCV,
  bufferCVFromString,
  getAddressFromPrivateKey,
  makeContractCall,
  validateStacksAddress,
  broadcastTransaction,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import readline from "readline";

// Configuration
const SENDER_KEY =
  "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01"; // Replace with your private key
const CONTRACT_ADDRESS = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
const CONTRACT_NAME = "Krypto";
const network = STACKS_TESTNET;

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promise wrapper for readline
const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

// Validate recipient address
const validateRecipientAddress = (address) => {
  try {
    if (!address || !address.startsWith("ST")) {
      return {
        isValid: false,
        error: "Invalid address format. Must start with 'SP'",
      };
    }

    const isValid = validateStacksAddress(address);
    if (!isValid) {
      return { isValid: false, error: "Invalid Stacks address format" };
    }

    return { isValid: true, error: null };
  } catch (err) {
    return { isValid: false, error: "Invalid address format" };
  }
};

// Validate amount
const validateAmount = (amount) => {
  const numAmount = Number(amount);
  return numAmount > 0 && Number.isInteger(numAmount);
};

// Get token balance
async function getTokenBalance(address) {
  try {
    const functionArgs = [standardPrincipalCV(address)];

    const response = await fetchCallReadOnlyFunction({
      network,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: "get-balance",
      functionArgs,
      senderAddress: address,
    });

    return response.value.value;
  } catch (error) {
    console.error("Error getting balance:", error);
    throw error;
  }
}

// Main transfer function
async function transferTokens(recipientAddress, amount) {
  try {
    const senderAddress = getAddressFromPrivateKey(SENDER_KEY, network.version);
    console.log("\nSender's address:", senderAddress);

    // Get initial balances
    console.log("\nFetching initial balances...");
    const initialSenderBalance = await getTokenBalance(senderAddress);
    const initialRecipientBalance = await getTokenBalance(recipientAddress);

    console.log(`Sender's initial balance: ${initialSenderBalance}`);
    console.log(`Recipient's initial balance: ${initialRecipientBalance}`);

    const functionArgs = [
      uintCV(parseInt(amount)),
      standardPrincipalCV(senderAddress),
      standardPrincipalCV(recipientAddress),
      noneCV(), // No memo
    ];

    const txOptions = {
      senderKey: SENDER_KEY,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: "transfer",
      functionArgs,
      validateWithAbi: true,
      network,
      anchorMode: 3,
      postConditionMode: 1,
      fee: 2000n,
    };

    console.log("\nCreating transaction...");
    const transaction = await makeContractCall(txOptions);

    console.log("Broadcasting transaction...");
    const broadcastResponse = await broadcastTransaction({
      transaction,
      network,
    });

    if (broadcastResponse.error) {
      throw new Error(broadcastResponse.error);
    }

    console.log("\nTransaction successful!");
    console.log("Transaction ID:", broadcastResponse.txid);
    console.log(
      `View in Explorer: https://explorer.stacks.co/txid/${broadcastResponse.txid}`
    );

    // Wait for a few seconds to allow the transaction to be processed
    console.log("\nWaiting for transaction to be processed...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Get final balances
    console.log("\nVerifying transfer...");
    const finalSenderBalance = await getTokenBalance(senderAddress);
    const finalRecipientBalance = await getTokenBalance(recipientAddress);

    console.log("\nTransfer verification:");
    console.log(`Sender's final balance: ${finalSenderBalance}`);
    console.log(`Recipient's final balance: ${finalRecipientBalance}`);
    console.log(`Amount transferred: ${amount}`);

    return broadcastResponse.txid;
  } catch (error) {
    throw error;
  }
}

// Main execution
async function main() {
  try {
    console.log("=== Stacks Token Transfer Script ===\n");

    const recipientAddress = await question("Enter recipient address: ");
    const { isValid, error } = validateRecipientAddress(recipientAddress);
    if (!isValid) {
      throw new Error(error);
    }

    const amount = await question("Enter amount to transfer: ");
    if (!validateAmount(amount)) {
      throw new Error("Amount must be a positive integer");
    }

    await transferTokens(recipientAddress, amount);
  } catch (error) {
    console.error("\nError:", error.message);
  } finally {
    rl.close();
  }
}

// Run the script
main();
