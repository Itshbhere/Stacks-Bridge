import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { TokenBridgeContract } from "./TokenBridgeClass.js";
import { ethers } from "ethers";
import { config } from "dotenv";
import {
  standardPrincipalCV,
  uintCV,
  noneCV,
  contractPrincipalCV,
  getAddressFromPrivateKey,
  makeContractCall,
  broadcastTransaction,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import * as fs from "fs";
import fetch from "node-fetch";
import * as readline from "readline";

if (typeof global !== "undefined" && !global.fetch) {
  global.fetch = fetch;
}
config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify the question function
function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

class SIPtoETHBridge {
  constructor(config) {
    // Ethereum bridge configuration
    this.ethBridgeContract = new TokenBridgeContract(
      config.ethBridgeAddress || "0x365bc3A714E2a40beB8CC8A9752beE89bC0c02d3",
      config.ethPrivateKey,
      config.ethRpcUrl || "https://rpc-vanguard.vanarchain.com"
    );

    // Stacks configuration
    this.stacksPrivateKey = config.stacksPrivateKey;
    this.network = STACKS_TESTNET;
    this.stacksSenderAddress = getAddressFromPrivateKey(
      this.stacksPrivateKey,
      this.network
    );

    // Token contract information
    this.tokenContractAddress =
      config.tokenContractAddress ||
      "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    this.tokenContractName = config.tokenContractName || "ADVT";

    // Bridge contract information
    this.bridgeContractAddress =
      config.bridgeContractAddress ||
      "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    this.bridgeContractName = config.bridgeContractName || "StacksBridge";

    // Conversion rate (configurable)
    this.conversionRate = config.conversionRate || 0.0001; // 10000 SIP to 1 ETH
    this.decimals = config.decimals || 6;

    // Retry configuration
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 20000;
  }

  async initialize() {
    try {
      console.log("SIP to ETH Bridge Initialized");
      console.log("Stacks Sender:", this.stacksSenderAddress);

      // Check initial contract balance
      console.log("\nInitial ETH Bridge Contract Balance:");
      await this.ethBridgeContract.getContractBalance();

      // Check SIP token balance
      const tokenBalance = await this.getStacksTokenBalance(
        this.stacksSenderAddress
      );

      // Convert to human-readable format with proper decimals
      const readableBalance =
        Number(tokenBalance) / Math.pow(10, this.decimals);
      console.log(
        `SIP token balance: ${tokenBalance.toString()} units (${readableBalance.toFixed(
          this.decimals
        )} tokens)`
      );

      return true;
    } catch (error) {
      console.error("Initialization error:", error);
      throw error;
    }
  }

  async getStacksTokenBalance(address) {
    try {
      const BridgeName = "StacksBridge";
      const FinalAddress = contractPrincipalCV(address, BridgeName);
      console.log(
        `Fetching token balance for address: ${address}.${BridgeName}`
      );
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.tokenContractAddress,
        contractName: this.tokenContractName,
        functionName: "get-balance",
        functionArgs: [FinalAddress],
        network: this.network,
        senderAddress: address,
      });

      if (!result) {
        throw new Error("No response received from token balance check");
      }

      return BigInt(result.value.value);
    } catch (error) {
      console.error("Error getting token balance:", error);
      return BigInt(0);
    }
  }

  async transferSIPtoETH(sipAmount) {
    // Convert to the raw amount with proper decimals
    const rawAmount = BigInt(sipAmount) * BigInt(Math.pow(10, this.decimals));

    console.log("=== Starting SIP to ETH Bridge Transfer ===");
    console.log(`SIP Amount to send: ${sipAmount} tokens (${rawAmount} units)`);

    try {
      // Step 1: Lock tokens in the bridge contract
      console.log("\nLocking SIP tokens in bridge contract...");
      const lockTxId = await this.lockTokensInBridge(rawAmount);
      console.log("Lock transaction ID:", lockTxId);

      // Wait for lock transaction verification
      console.log("\nWaiting for lock transaction verification...");
      await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));

      // Step 2: Calculate the corresponding ETH amount
      const ethAmount = this.calculateETHAmount(BigInt(rawAmount));
      console.log(`\nCalculated ETH amount to release: ${ethAmount} ETH`);

      // Step 3: Lock ETH in the Ethereum bridge contract
      console.log("\nLocking ETH in bridge contract...");
      const ethTxId = await this.ethBridgeContract.lockEther(
        ethers.parseEther(ethAmount.toString()),
        process.env.ETH_RECIPIENT_ADDRESS ||
          "0x39560d86283C669F09f66fd2143194A38ac44933"
      );
      console.log("Ethereum transaction signature:", ethTxId);

      return {
        lockTransactionId: lockTxId,
        ethTransactionId: ethTxId,
        status: "completed",
      };
    } catch (error) {
      console.error("Error in SIP to ETH bridge transfer:", error);
      throw error;
    }
  }

  calculateETHAmount(sipAmount) {
    // Convert SIP amount to ETH based on conversion rate
    // Account for decimals in the conversion
    return (
      (Number(sipAmount) * this.conversionRate) / Math.pow(10, this.decimals)
    );
  }

  async lockTokensInBridge(sipAmount) {
    try {
      const PKey = this.stacksPrivateKey;
      const senderAddress = this.stacksSenderAddress;

      const tokenContractAddress = this.tokenContractAddress;
      const tokenContractName = this.tokenContractName;
      const bridgeContractAddress = this.bridgeContractAddress;
      const bridgeContractName = this.bridgeContractName;

      const initialSenderBalance = await this.getStacksTokenBalance(
        senderAddress
      );

      const readableBalance =
        Number(initialSenderBalance) / Math.pow(10, this.decimals);
      console.log(
        `Initial sender balance: ${initialSenderBalance.toString()} units (${readableBalance.toFixed(
          this.decimals
        )} tokens)`
      );

      if (initialSenderBalance < sipAmount) {
        throw new Error("Insufficient token balance for transfer");
      }

      // Create the function arguments for the token transfer
      const functionArgs = [
        uintCV(sipAmount), // amount
        standardPrincipalCV(senderAddress), // sender
        contractPrincipalCV(bridgeContractAddress, bridgeContractName), // recipient (the contract)
        noneCV(), // memo (optional)
      ];

      const txOptions = {
        senderKey: PKey,
        contractAddress: tokenContractAddress,
        contractName: tokenContractName,
        functionName: "transfer",
        functionArgs,
        validateWithAbi: true,
        network: this.network,
        anchorMode: 3,
        postConditionMode: 1,
        fee: BigInt(2000),
      };

      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction({
        transaction,
        network: this.network,
      });

      if (broadcastResponse.error) {
        throw new Error(broadcastResponse.error);
      }

      return broadcastResponse.txid;
    } catch (error) {
      throw error;
    }
  }
}

// Example usage
async function main() {
  try {
    // Create bridge instance
    const bridge = new SIPtoETHBridge({
      ethPrivateKey: process.env.PRIVATE_KEY,
      stacksPrivateKey:
        "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01",
      tokenContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
      tokenContractName: "ADVT",
      bridgeContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
      bridgeContractName: "StacksBridge",
      ethRpcUrl: "https://rpc-vanguard.vanarchain.com",
      conversionRate: 0.0001,
      decimals: 6,
    });

    // Initialize bridge
    await bridge.initialize();

    // Get user input for amount to transfer
    const userInput = await question(
      "\nEnter the amount of SIP tokens to swap (e.g., 10000): "
    );

    // Validate user input
    const sipAmount = parseFloat(userInput);

    if (isNaN(sipAmount) || sipAmount <= 0) {
      console.error("Invalid amount. Please enter a positive number.");
      rl.close();
      return;
    }

    // Confirm the transaction
    const confirmation = await question(
      `\nYou are about to swap ${sipAmount} SIP tokens. Confirm? (y/n): `
    );

    if (
      confirmation.toLowerCase() !== "y" &&
      confirmation.toLowerCase() !== "yes"
    ) {
      console.log("Transaction cancelled by user.");
      rl.close();
      return;
    }

    // Execute transfer with user-provided amount
    const result = await bridge.transferSIPtoETH(sipAmount);

    console.log("\n=== Transfer Result ===");
    console.log(`Status: ${result.status}`);
    console.log(`Lock Transaction ID: ${result.lockTransactionId}`);
    console.log(`Ethereum Transaction ID: ${result.ethTransactionId}`);

    rl.close();
  } catch (error) {
    console.error("Error executing SIP to ETH bridge:", error);
    rl.close();
  }
}

// Run the main function
main()
  .then(() => console.log("Script completed successfully"))
  .catch((error) => console.error("Script failed with error:", error));
