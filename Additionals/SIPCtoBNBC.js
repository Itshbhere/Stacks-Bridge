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
  cvToValue,
  Cl,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import fetch from "node-fetch";
import axios from "axios";
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

class IntegratedTokenBridge {
  constructor(config) {
    // Ethereum bridge configuration
    this.ethBridgeAddress = config.ethBridgeAddress || "0x365bc3A714E2a40beB8CC8A9752beE89bC0c02d3";
    this.ethPrivateKey = config.ethPrivateKey;
    this.ethRpcUrl = config.ethRpcUrl || "https://rpc-vanguard.vanarchain.com";

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

    // Decimals configuration
    this.decimals = config.decimals || 6;

    // API configuration
    this.conversionApiBaseUrl =
      config.conversionApiBaseUrl ||
      "https://dev-api-wallet.stonezone.gg/coin/convert";
    
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

    // Retry configuration
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 20000;
  }

  async initialize() {
    try {
      console.log("Integrated Token Bridge Initialized");
      console.log("Stacks Sender:", this.stacksSenderAddress);

      // Initialize Ethereum provider
      this.provider = new ethers.JsonRpcProvider(this.ethRpcUrl);
      
      // Ensure the private key is properly formatted
      const formattedPrivateKey = this.ethPrivateKey.startsWith("0x") 
        ? this.ethPrivateKey 
        : `0x${this.ethPrivateKey}`;
      
      // Create wallet with the formatted private key
      try {
        this.wallet = new ethers.Wallet(formattedPrivateKey, this.provider);
        console.log("Ethereum Wallet:", this.wallet.address);
      } catch (error) {
        console.error("Error creating Ethereum wallet:", error.message);
        console.log("Please check that your private key is valid and properly formatted");
        throw error;
      }
      
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

  async getEthContractBalance() {
    try {
      const balance = await this.provider.getBalance(this.ethBridgeAddress);
      const ethBalance = ethers.formatEther(balance);
      console.log(`ETH Bridge Contract Balance: ${ethBalance} ETH`);
      return ethBalance;
    } catch (error) {
      console.error("Error getting ETH contract balance:", error);
      throw error;
    }
  }

  async getStacksTokenBalance(address) {
    try {
      const BridgeName = this.bridgeContractName;
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

  async convertSipToStx(sipAmount) {
    // For this example, we'll simulate an API call to convert SIP to STX
    console.log(`🔄 Converting ${sipAmount} SIP to STX...`);
    
    try {
      // You would replace this with an actual API call to convert SIP to STX
      // For now, using an arbitrary conversion rate
      const stxAmount = sipAmount * 0.5; // Example rate: 1 SIP = 0.5 STX
      console.log(`✅ Calculated conversion: ${sipAmount} SIP = ${stxAmount} STX`);
      return stxAmount;
    } catch (error) {
      console.error("Error during SIP to STX conversion:", error);
      throw error;
    }
  }

  /**
   * Converts STX to BNB using the Stone Zone API
   * @param {number} stxAmount - Amount of STX to convert
   * @returns {Promise<number>} - The amount of BNB received
   */
  async convertStxToBnb(stxAmount) {
    try {
      console.log(`🔄 Converting ${stxAmount} STX to BNB...`);

      const url = `${this.conversionApiBaseUrl}/STX/BNB/${stxAmount}`;
      const response = await axios.get(url, {
        headers: {
          Accept: "*/*",
        },
      });

      console.log("Conversion API Response:", response.data);

      // Extract the BNB amount from the response
      const bnbAmount = response.data.output || 0;
      console.log(`✅ Calculated conversion: ${stxAmount} STX = ${bnbAmount} BNB`);

      return bnbAmount;
    } catch (error) {
      console.error(
        `Error during STX to BNB conversion:`,
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async lockEther(amount, recipientAddress) {
    try {
      console.log(`Sending ${amount} ETH/BNB to ${this.ethBridgeAddress}`);
      console.log(`Recipient: ${recipientAddress}`);

      const tx = await this.wallet.sendTransaction({
        to: this.ethBridgeAddress,
        value: amount,
      });

      console.log("Transaction sent, waiting for confirmation...");
      const receipt = await tx.wait();
      console.log("Transaction confirmed!");
      console.log("Transaction hash:", receipt.hash);

      return receipt.hash;
    } catch (error) {
      console.error("Error in lockEther:", error);
      throw error;
    }
  }

  async transferSIPtoBNB(sipAmount) {
    // Convert to the raw amount with proper decimals
    const rawAmount = BigInt(sipAmount) * BigInt(Math.pow(10, this.decimals));

    console.log("=== Starting SIP to BNB Bridge Transfer ===");
    console.log(`SIP Amount to send: ${sipAmount} tokens (${rawAmount} units)`);

    try {
      // Step 1: Lock tokens in the bridge contract
      console.log("\nLocking SIP tokens in bridge contract...");
      const lockTxId = await this.lockTokensInBridge(rawAmount);
      console.log("Lock transaction ID:", lockTxId);

      // Wait for lock transaction verification
      console.log("\nWaiting for lock transaction verification...");
      await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));

      // Step 2: Convert SIP to STX
      const stxAmount = await this.convertSipToStx(sipAmount);
      console.log(`\nConverted ${sipAmount} SIP to ${stxAmount} STX`);

      // Step 3: Convert STX to BNB
      const bnbAmount = await this.convertStxToBnb(stxAmount);
      console.log(`\nConverted ${stxAmount} STX to ${bnbAmount} BNB`);

      // Step 4: Release BNB to the recipient
      console.log(`\nReleasing ${bnbAmount} BNB to recipient...`);
      const recipientAddress = process.env.ETH_RECIPIENT_ADDRESS ||
        "0x39560d86283C669F09f66fd2143194A38ac44933";
        
      const ethTxId = await this.lockEther(
        ethers.parseEther(bnbAmount.toString()),
        recipientAddress
      );
      console.log("BNB transaction signature:", ethTxId);

      return {
        lockTransactionId: lockTxId,
        ethTransactionId: ethTxId,
        status: "completed",
        sipAmount,
        stxAmount,
        bnbAmount
      };
    } catch (error) {
      console.error("Error in SIP to BNB bridge transfer:", error);
      throw error;
    }
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
    // Make sure PRIVATE_KEY is set properly in your .env file
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error("ERROR: PRIVATE_KEY not found in environment variables");
      console.log("Please create a .env file with PRIVATE_KEY=your_private_key");
      process.exit(1);
    }

    // Create bridge instance
    const bridge = new IntegratedTokenBridge({
      ethPrivateKey: privateKey,
      stacksPrivateKey:
        "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01",
      tokenContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
      tokenContractName: "ADVT",
      bridgeContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
      bridgeContractName: "StacksBridge",
      ethRpcUrl: "https://rpc-vanguard.vanarchain.com",
      ethBridgeAddress: "0x365bc3A714E2a40beB8CC8A9752beE89bC0c02d3",
      decimals: 6,
      conversionApiBaseUrl: "https://dev-api-wallet.stonezone.gg/coin/convert",
      // AMM configuration
      tokenXAddress: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM",
      tokenXContract: "token-wstx-v2",
      tokenYAddress: "SP2SF8P7AKN8NYHD57T96C51RRV9M0GKRN02BNHD2",
      tokenYContract: "token-wstone",
      factorX: 100000000,
      ammContractAddress: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM",
      ammContractName: "amm-pool-v2-01"
    });

    // Initialize bridge
    await bridge.initialize();
    
    // Check ETH contract balance
    await bridge.getEthContractBalance();

    // Get user input for amount to transfer
    const userInput = await question(
      "\nEnter the amount of SIP tokens to swap to BNB (e.g., 10000): "
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
      `\nYou are about to start a SIP to BNB swap process for ${sipAmount} SIP tokens. Confirm? (y/n): `
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
    const result = await bridge.transferSIPtoBNB(sipAmount);

    console.log("\n=== Transfer Result ===");
    console.log(`Status: ${result.status}`);
    console.log(`SIP Amount: ${result.sipAmount}`);
    console.log(`STX Amount: ${result.stxAmount}`);
    console.log(`BNB Amount: ${result.bnbAmount}`);
    console.log(`SIP Lock Transaction ID: ${result.lockTransactionId}`);
    console.log(`BNB Release Transaction ID: ${result.ethTransactionId}`);

    rl.close();
  } catch (error) {
    console.error("Error executing SIP to BNB bridge:", error);
    rl.close();
  }
}

// Run the main function
main()
  .then(() => console.log("Script completed successfully"))
  .catch((error) => console.error("Script failed with error:", error));