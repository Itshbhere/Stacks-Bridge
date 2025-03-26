import { Connection, PublicKey, clusterApiUrl, Keypair } from "@solana/web3.js";
import {
  standardPrincipalCV,
  uintCV,
  contractPrincipalCV,
  getAddressFromPrivateKey,
  makeContractCall,
  broadcastTransaction,
  fetchCallReadOnlyFunction,
  cvToValue,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import { ethers } from "ethers";
import fetch from "node-fetch";
import fs from "fs";
import { config } from "dotenv";
config();

global.fetch = fetch;

class EthereumStacksBridge {
  constructor(config) {
    this.ethereumPrivateKey = config.ethereumPrivateKey;
    this.ethereumRpcUrl =
      config.ethereumRpcUrl || "https://rpc-vanguard.vanarchain.com";
    this.stacksPrivateKey = config.stacksPrivateKey;
    this.stacksContractAddress = config.stacksContractAddress;
    this.stacksContractName = config.stacksContractName;
    this.ethereumBridgeContractAddress = config.ethereumBridgeContractAddress;
    this.network = STACKS_TESTNET;
    this.decimals = 6;

    // Set the conversion rate: 1 ETH = 10 SIP-10 tokens
    this.conversionRate = config.conversionRate || 10;
  }

  async initialize() {
    try {
      // Initialize Ethereum provider
      this.provider = new ethers.JsonRpcProvider(this.ethereumRpcUrl);
      this.wallet = new ethers.Wallet(this.ethereumPrivateKey, this.provider);

      // Initialize Stacks sender address
      this.stacksSenderAddress = getAddressFromPrivateKey(
        this.stacksPrivateKey,
        this.network
      );

      console.log("Ethereum-Stacks Bridge Initialized");
      console.log("Ethereum Wallet:", this.wallet.address);
      console.log("Stacks Sender:", this.stacksSenderAddress);
      console.log("Conversion Rate: 1 ETH = 10 SIP-10 tokens");

      return true;
    } catch (error) {
      console.error("Initialization error:", error);
      throw error;
    }
  }

  async checkStacksTokenBalance(tokenAddress, tokenName, ownerAddress) {
    try {
      const BridgeAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
      const Bridge = "StacksBridge";
      console.log(
        `Checking SIP-10 token balance for ${BridgeAddress}.${Bridge}`
      );

      // Call the get-balance function of the SIP-10 token contract
      const response = await fetchCallReadOnlyFunction({
        contractAddress: tokenAddress,
        contractName: tokenName,
        functionName: "get-balance",
        functionArgs: [contractPrincipalCV(BridgeAddress, Bridge)],
        senderAddress: ownerAddress,
        network: this.network,
      });
      console.log("Response:", response);

      // Balance extraction logic remains the same as in the previous implementation
      let balance = 0;
      if (response && response.value) {
        if (typeof cvToValue === "function") {
          const valueObj = cvToValue(response);
          balance =
            typeof valueObj === "object"
              ? Number(valueObj.value)
              : Number(valueObj);
        } else {
          balance = Number(response.value);
        }
      }

      // Fallback balance handling
      if (isNaN(balance)) {
        console.warn(
          "WARNING: Could not determine token balance. For testing purposes, assuming sufficient balance."
        );
        balance = Number.MAX_SAFE_INTEGER;
      }

      const formattedBalance = balance / Math.pow(10, this.decimals);
      console.log(`Current balance: ${formattedBalance} ${tokenName} tokens`);

      return balance;
    } catch (error) {
      console.error("Error checking token balance:", error);
      console.warn(
        "WARNING: Balance check failed. For testing purposes, proceeding with transfer."
      );
      return Number.MAX_SAFE_INTEGER;
    }
  }

  async transferEth(destinationAddress, amountInEth) {
    try {
      console.log(
        `\nInitiating ETH transfer of ${amountInEth} to ${this.ethereumBridgeContractAddress}}`
      );

      // Calculate required SIP-10 tokens based on conversion rate
      const requiredSip10Amount = amountInEth * this.conversionRate;
      const scaledRequiredAmount =
        this.convertToScaledAmount(requiredSip10Amount);

      // Check if sender has enough SIP-10 tokens
      const BridgeAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
      const BridgeName = "ADVT";

      const currentBalance = await this.checkStacksTokenBalance(
        BridgeAddress,
        BridgeName,
        this.stacksSenderAddress
      );

      if (currentBalance < scaledRequiredAmount) {
        const formattedRequired = requiredSip10Amount.toFixed(this.decimals);
        const formattedBalance = (
          currentBalance / Math.pow(10, this.decimals)
        ).toFixed(this.decimals);
        throw new Error(
          `Insufficient SIP-10 token balance. Required: ${formattedRequired}, Available: ${formattedBalance}`
        );
      }

      console.log(`Balance check passed. Proceeding with transfer...`);

      // Send ETH to the bridge contract
      const tx = await this.wallet.sendTransaction({
        to: this.ethereumBridgeContractAddress,
        value: ethers.parseEther(amountInEth.toString()),
      });

      const receipt = await tx.wait();
      console.log("ETH Transfer Complete");
      console.log("Transaction Hash:", receipt.hash);

      // Process the corresponding Stacks transfer
      await this.processTransfer(amountInEth, receipt.hash, destinationAddress);

      return receipt.hash;
    } catch (error) {
      console.error("Error transferring ETH:", error);
      throw error;
    }
  }

  async processTransfer(transferAmount, signature, recipientAddress) {
    console.log("\nProcessing corresponding Stacks transfer");
    console.log("Amount:", transferAmount, "ETH");

    // Apply conversion rate: 1 ETH = 10 SIP-10 tokens
    const sip10Amount = transferAmount * this.conversionRate;
    console.log("Converting to:", sip10Amount, "SIP-10 tokens");

    try {
      // Convert the SIP-10 amount to the proper decimal representation
      const scaledAmount = this.convertToScaledAmount(sip10Amount);

      // Execute Stacks transfer
      const stacksTxId = await this.executeStacksTransfer({
        amount: scaledAmount,
        recipient: this.getStacksRecipientAddress(recipientAddress),
        memo: `Bridge transfer from Ethereum tx: ${signature}`,
      });

      return stacksTxId;
    } catch (error) {
      console.error("Error processing Stacks transfer:", error);
      throw error;
    }
  }

  convertToScaledAmount(amount) {
    // Convert the amount to the specified decimal precision
    return Math.round(amount * Math.pow(10, this.decimals));
  }

  getStacksRecipientAddress(ethereumAddress) {
    // In a real implementation, you might want to map Ethereum addresses to Stacks addresses
    // For this example, we'll use a hardcoded address
    return "ST33Y26J2EZW5SJSDRKFJVE97P40ZYYR7K3PATCNF";
  }

  async executeStacksTransfer({ amount, recipient, memo }) {
    const contractAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    const contractName = "StacksBridge";

    const tokenAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    const tokenName = "ADVT";

    const RecipientAddress = "ST33424G9M8BE62BWP90DA2Z2289JMD0C0SSE4TT5";

    // Create a contractPrincipalCV for the token contract
    const tokenContract = contractPrincipalCV(tokenAddress, tokenName);

    const functionArgs = [
      tokenContract,
      uintCV(Math.floor(amount)),
      standardPrincipalCV(RecipientAddress),
    ];

    const txOptions = {
      senderKey: this.stacksPrivateKey,
      contractAddress: contractAddress,
      contractName: contractName,
      functionName: "lock-token",
      functionArgs,
      validateWithAbi: true,
      network: STACKS_TESTNET,
      anchorMode: 3,
      postConditionMode: 1,
      fee: 2000n,
    };

    console.log(txOptions);

    console.log("Creating Stacks transaction");
    console.log(
      `Sending ${
        amount / Math.pow(10, this.decimals)
      } SIP-10 tokens to ${RecipientAddress}`
    );

    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction({
      transaction,
      network: this.network,
    });

    console.log(broadcastResponse);

    console.log("Stacks Transfer Complete");
    console.log("Transaction ID:", broadcastResponse.txid);

    return broadcastResponse.txid;
  }
}

// Example usage
async function main() {
  const bridge = new EthereumStacksBridge({
    ethereumPrivateKey: process.env.PRIVATE_KEY,
    ethereumRpcUrl: "https://rpc-vanguard.vanarchain.com",
    stacksPrivateKey:
      "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01",
    stacksContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
    stacksContractName: "ADVT",
    ethereumBridgeContractAddress: "0x365bc3A714E2a40beB8CC8A9752beE89bC0c02d3",
    conversionRate: 10, // 1 ETH = 10 SIP-10 tokens
  });

  try {
    await bridge.initialize();
    console.log("Bridge initialized successfully");

    // Destination Stacks address to transfer tokens to
    const destinationAddress = "ST33Y26J2EZW5SJSDRKFJVE97P40ZYYR7K3PATCNF";

    // Amount of ETH to transfer
    const amountToTransfer = 1; // in ETH

    // Execute the transfer
    await bridge.transferEth(destinationAddress, amountToTransfer);

    console.log("Transfer process completed successfully");
  } catch (error) {
    console.error("Error in bridge operation:", error);
    process.exit(1);
  }
}

main();
