import { TokenBridgeContract } from "../Additionals/TokenBridgeClass.js";
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
import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";
import fetch from "node-fetch";
import * as readline from "readline";
import axios from "axios";

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
    this.decimals = config.decimals || 6;

    // API configuration for STX to BNB conversion
    this.conversionApiBaseUrl =
      config.conversionApiBaseUrl ||
      "https://dev-api-wallet.stonezone.gg/coin/convert";
    this.fromCurrency = "STX"; // We're converting from STX to BNB
    this.toCurrency = "BNB";

    // AMM configuration for SIP to STX conversion
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

    // Minimum BNB amount for transaction
    this.minBnbAmount = config.minBnbAmount || 0.0001;

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

  async waitForTxConfirmation(txid, networkUrl) {
    const url = `${networkUrl}/extended/v1/tx/${txid}`;
    while (true) {
      const res = await fetch(url);
      const data = await res.json();
      if (data.tx_status === "success") {
        console.log("Transaction confirmed!");
        break;
      } else if (
        data.tx_status === "abort_by_response" ||
        data.tx_status === "abort_by_post_condition" ||
        data.tx_status === "rejected"
      ) {
        console.error("Transaction failed:", data.tx_status, data);
        break;
      } else {
        console.log("Still pending... waiting...");
        await new Promise((resolve) => setTimeout(resolve, 10000)); // wait 10 seconds
      }
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

  /**
   * Convert SIP tokens to STX using AMM pool
   * @param {number} sipAmount - Amount of SIP tokens to convert
   * @returns {Promise<number>} - Amount of STX tokens received
   */
  async convertSipToStx(sipAmount) {
    console.log(`🔄 Converting ${sipAmount} SIP tokens to STX...`);

    try {
      // For this implementation, we'll simulate the conversion
      // In a real implementation, you would call the AMM contract
      // This is a placeholder for demonstration purposes
      //   const stxAmount = sipAmount * 0.25; // Example conversion rate

      // In a complete implementation, you would use a contract call like:
      // /*
      const txOptions = {
        contractAddress: this.ammContractAddress,
        contractName: this.ammContractName,
        functionName: "get-x-given-y",
        functionArgs: [
          contractPrincipalCV(
            this.tokenContractAddress,
            this.tokenContractName
          ),
          contractPrincipalCV(this.tokenXAddress, this.tokenXContract),
          Cl.uint(this.factorX),
          Cl.uint(sipAmount * Math.pow(10, this.decimals)),
        ],
        network: STACKS_MAINNET,
        senderAddress: this.stacksSenderAddress,
      };

      const stxResult = await fetchCallReadOnlyFunction(txOptions);
      const stxAmountRaw = BigInt(stxResult.value.value);
      const stxAmount = Number(stxAmountRaw) / Math.pow(10, 6); // STX decimals
      console.log(`✅ Expected STX amount: ${stxAmount} STX`);

      return stxAmount;
    } catch (error) {
      console.error("Error during SIP to STX conversion:", error);
      throw error;
    }
  }

  /**
   * Convert STX to BNB using the Stone Zone API
   * @param {number} stxAmount - Amount of STX to convert
   * @returns {Promise<number>} - Amount of BNB received
   */
  async convertStxToBnb(stxAmount) {
    try {
      console.log(
        `🔄 Converting ${stxAmount} ${this.fromCurrency} to ${this.toCurrency}...`
      );

      const url = `${this.conversionApiBaseUrl}/${this.fromCurrency}/${this.toCurrency}/${stxAmount}`;
      const response = await axios.get(url, {
        headers: {
          Accept: "*/*",
        },
      });

      console.log("Conversion API Response:", response.data);

      // Extract the BNB amount from the response
      const bnbAmount = response.data.output || 0;
      console.log(`✅ Received ${bnbAmount} ${this.toCurrency}`);

      return bnbAmount;
    } catch (error) {
      console.error(
        `Error during ${this.fromCurrency} to ${this.toCurrency} conversion:`,
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Format BNB amount to have at most 18 decimal places
   * @param {number} amount - The BNB amount to format
   * @returns {string} - Formatted BNB amount
   */
  formatBnbAmount(amount) {
    return amount.toFixed(18).replace(/\.?0+$/, "");
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
      // await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
      const networkUrl = "https://api.testnet.hiro.so";
      await this.waitForTxConfirmation(lockTxId, networkUrl);
      console.log("Lock transaction verified!");

      // Step 2: Convert SIP tokens to STX using AMM
      console.log("\nCalculating equivalent STX amount using AMM...");
      const stxAmount = await this.convertSipToStx(Number(sipAmount));
      console.log(`Equivalent STX amount: ${stxAmount} STX`);

      // Step 3: Convert STX to BNB using API
      console.log("\nConverting STX to BNB using API...");
      const bnbAmount = await this.convertStxToBnb(stxAmount);
      console.log(`Equivalent BNB amount: ${bnbAmount} BNB`);

      // Step 4: Format BNB amount to avoid decimal issues
      const formattedBnbAmount = this.formatBnbAmount(bnbAmount);
      console.log(`Formatted BNB amount: ${formattedBnbAmount} BNB`);

      // Step 5: Release BNB from the Ethereum bridge contract
      console.log("\nReleasing BNB from bridge contract...");
      const ethTxId = await this.ethBridgeContract.lockEther(
        ethers.parseEther(formattedBnbAmount),
        process.env.ETH_RECIPIENT_ADDRESS ||
          "0x39560d86283C669F09f66fd2143194A38ac44933"
      );
      console.log("Ethereum transaction signature:", ethTxId);

      return {
        lockTransactionId: lockTxId,
        ethTransactionId: ethTxId,
        status: "completed",
        stxAmount,
        bnbAmount: formattedBnbAmount,
      };
    } catch (error) {
      console.error("Error in SIP to ETH bridge transfer:", error);
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
      decimals: 6,
      // API and AMM configuration
      conversionApiBaseUrl: "https://dev-api-wallet.stonezone.gg/coin/convert",
      fromCurrency: "STX",
      toCurrency: "BNB",
      tokenXAddress: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM",
      tokenXContract: "token-wstx-v2",
      tokenYAddress: "SP2SF8P7AKN8NYHD57T96C51RRV9M0GKRN02BNHD2",
      tokenYContract: "token-wstone",
      factorX: 100000000,
      ammContractAddress: "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM",
      ammContractName: "amm-pool-v2-01",
      // Minimum BNB amount to transfer
      minBnbAmount: 0.0001,
    });

    // Initialize bridge
    await bridge.initialize();

    // Get user input for amount of SIP tokens to transfer
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

    // Show conversion preview before confirmation
    console.log("\n=== Conversion Preview ===");
    const previewStxAmount = await bridge.convertSipToStx(sipAmount);
    console.log(
      `SIP to STX: ${sipAmount} SIP ≈ ${previewStxAmount.toFixed(6)} STX`
    );

    const previewBnbAmount = await bridge.convertStxToBnb(previewStxAmount);
    console.log(
      `STX to BNB: ${previewStxAmount.toFixed(6)} STX ≈ ${previewBnbAmount} BNB`
    );

    // Format BNB amount to avoid decimal issues
    const formattedBnbAmount = bridge.formatBnbAmount(previewBnbAmount);
    console.log(`Final BNB amount: ${formattedBnbAmount} BNB`);
    console.log("===========================");

    // Confirm the transaction
    const confirmation = await question(
      `\nYou are about to swap ${sipAmount} SIP tokens for approximately ${formattedBnbAmount} BNB. Confirm? (y/n): `
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
    console.log(`SIP Amount: ${sipAmount}`);
    console.log(`STX Amount: ${result.stxAmount}`);
    console.log(`BNB Amount: ${result.bnbAmount}`);
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
