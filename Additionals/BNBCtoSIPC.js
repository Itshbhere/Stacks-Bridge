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
  Cl,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import { ethers } from "ethers";
import fetch from "node-fetch";
import fs from "fs";
import { config } from "dotenv";
import axios from "axios";
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

    // API configuration
    this.conversionApiBaseUrl =
      config.conversionApiBaseUrl ||
      "https://dev-api-wallet.stonezone.gg/coin/convert";
    this.fromCurrency = config.fromCurrency || "BNB";
    this.toCurrency = config.toCurrency || "STX";

    // AMM configuration for STX to Stone conversion
    this.tokenXAddress =
      config.tokenXAddress || "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM";
    this.tokenXContract = config.tokenXContract || "token-wstx-v2";
    this.tokenYAddress =
      config.tokenYAddress || "SP2SF8P7AKN8NYHD57T96C51RRV9M0GKRN02BNHD2";
    this.tokenYContract = config.tokenYContract || "token-wstone";
    this.factorX = config.factorX || 100000000;
    this.ammContractAddress =
      config.ammContractAddress || "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM";
    this.ammContractName = config.ammContractName || "amm-pool-v2-01";
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
      console.log("Using dynamic conversion rate via API");

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

  /**
   * Converts BNB to STX using the Stone Zone API
   * @param {number} amount - Amount of BNB to convert
   * @returns {Promise<number>} - The amount of STX received
   */
  async convertBnbToStx(amount) {
    try {
      console.log(
        `🔄 Converting ${amount} ${this.fromCurrency} to ${this.toCurrency}...`
      );

      const url = `${this.conversionApiBaseUrl}/${this.fromCurrency}/${this.toCurrency}/${amount}`;
      const response = await axios.get(url, {
        headers: {
          Accept: "*/*",
        },
      });

      console.log("Conversion API Response:", response.data);

      // Extract the STX amount from the response
      const stxAmount = response.data.output || 0;
      console.log(`✅ Received ${stxAmount} ${this.toCurrency}`);

      return stxAmount;
    } catch (error) {
      console.error(
        `Error during ${this.fromCurrency} to ${this.toCurrency} conversion:`,
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Converts STX to Stone using the AMM pool
   * @param {number} stxAmount - Amount of STX to convert
   * @returns {Promise<number>} - The amount of Stone tokens received
   */
  async convertStxToStone(stxAmount) {
    console.log(`🔄 Converting ${stxAmount} STX to Stone...`);

    // Convert STX amount to micro STX (assuming 6 decimal places)
    const microStxAmount = Math.floor(stxAmount * 1000000);

    // Define transaction options for the contract call
    const txOptions = {
      contractAddress: this.ammContractAddress,
      contractName: this.ammContractName,
      functionName: "get-helper",
      functionArgs: [
        contractPrincipalCV(this.tokenXAddress, this.tokenXContract),
        contractPrincipalCV(this.tokenYAddress, this.tokenYContract),
        Cl.uint(this.factorX),
        Cl.uint(microStxAmount),
      ],
      network: "mainnet", // Use this.network instead if you're using testnet
      senderAddress: this.stacksSenderAddress,
    };

    try {
      // Call the smart contract to get the estimated Stone amount
      const stoneResult = await fetchCallReadOnlyFunction(txOptions);

      if (!stoneResult || !stoneResult.value) {
        throw new Error("Invalid response from the contract");
      }

      const stoneAmountRaw = BigInt(stoneResult.value.value); // Extract raw amount
      const stoneAmount = Number(stoneAmountRaw) / Number(1000000); // Convert to human-readable format
      console.log(`✅ Expected Stone amount: ${stoneAmount} Stone`);

      return stoneAmount;
    } catch (error) {
      console.error("Error during STX to Stone conversion:", error);
      throw error;
    }
  }

  async transferEth(destinationAddress, amountInEth) {
    try {
      console.log(
        `\nInitiating ETH transfer of ${amountInEth} to ${this.ethereumBridgeContractAddress}`
      );

      // Step 1: Convert ETH/BNB to STX using API
      const stxAmount = await this.convertBnbToStx(amountInEth);

      // Step 2: Convert STX to Stone using AMM
      const stoneAmount = await this.convertStxToStone(stxAmount);

      // Calculate the scaled amount for the contract
      const scaledAmount = this.convertToScaledAmount(stoneAmount);

      // Check if sender has enough SIP-10 tokens
      const BridgeAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
      const BridgeName = "ADVT";

      const currentBalance = await this.checkStacksTokenBalance(
        BridgeAddress,
        BridgeName,
        this.stacksSenderAddress
      );

      if (currentBalance < scaledAmount) {
        const formattedRequired = stoneAmount.toFixed(this.decimals);
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
      await this.processTransfer(stoneAmount, receipt.hash, destinationAddress);

      return receipt.hash;
    } catch (error) {
      console.error("Error transferring ETH:", error);
      throw error;
    }
  }

  async processTransfer(tokenAmount, signature, recipientAddress) {
    console.log("\nProcessing corresponding Stacks transfer");
    console.log("Amount:", tokenAmount, "Stone tokens");

    try {
      // Convert the SIP-10 amount to the proper decimal representation
      const scaledAmount = this.convertToScaledAmount(tokenAmount);

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
    // API and AMM configuration
    conversionApiBaseUrl: "https://dev-api-wallet.stonezone.gg/coin/convert",
    fromCurrency: "BNB", // Change to "ETH" if needed
    toCurrency: "STX",
    tokenXAddress: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM",
    tokenXContract: "token-wstx-v2",
    tokenYAddress: "SP2SF8P7AKN8NYHD57T96C51RRV9M0GKRN02BNHD2",
    tokenYContract: "token-wstone",
    factorX: 100000000,
    ammContractAddress: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM",
    ammContractName: "amm-pool-v2-01",
  });

  try {
    await bridge.initialize();
    console.log("Bridge initialized successfully");

    // Destination Stacks address to transfer tokens to
    const destinationAddress = "ST33Y26J2EZW5SJSDRKFJVE97P40ZYYR7K3PATCNF";

    // Amount of ETH/BNB to transfer
    const amountToTransfer = 0.0001; // in ETH/BNB

    // Execute the transfer
    await bridge.transferEth(destinationAddress, amountToTransfer);

    console.log("Transfer process completed successfully");
  } catch (error) {
    console.error("Error in bridge operation:", error);
    process.exit(1);
  }
}

main();
