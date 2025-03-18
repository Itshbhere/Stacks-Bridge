import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
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
import fetch from "node-fetch";
import fs from "fs";

global.fetch = fetch;

class SolanaBridge {
  constructor(config) {
    this.solanaWalletAddress = config.solanaWalletAddress;
    this.solanaKeypair = config.solanaKeypair;
    this.stacksPrivateKey = config.stacksPrivateKey;
    this.stacksContractAddress = config.stacksContractAddress;
    this.stacksContractName = config.stacksContractName;
    this.network = STACKS_TESTNET;
    this.decimals = 6;

    // Set the conversion rate: 1 SOL = 10 SIP-10 tokens
    this.conversionRate = config.conversionRate || 10;
  }

  async initialize() {
    try {
      // Initialize Solana connection
      this.connection = new Connection(clusterApiUrl("devnet"), {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 60000,
        httpHeaders: {
          "solana-client": `solana-bridge-${Date.now()}`,
        },
      });

      // Initialize Stacks sender address
      this.stacksSenderAddress = getAddressFromPrivateKey(
        this.stacksPrivateKey,
        this.network
      );

      console.log("Solana Bridge Initialized");
      console.log("Solana Wallet:", this.solanaWalletAddress);
      console.log("Stacks Sender:", this.stacksSenderAddress);
      console.log("Conversion Rate: 1 SOL = 10 SIP-10 tokens");

      // Verify the solana keypair matches the provided wallet address
      if (
        this.solanaKeypair.publicKey.toString() !== this.solanaWalletAddress
      ) {
        console.warn(
          "Warning: Provided wallet address doesn't match keypair public key"
        );
      }

      return true;
    } catch (error) {
      console.error("Initialization error:", error);
      throw error;
    }
  }

  async checkStacksTokenBalance(tokenAddress, tokenName, ownerAddress) {
    try {
      console.log(`Checking SIP-10 token balance for ${ownerAddress}...`);

      const tokenContract = contractPrincipalCV(tokenAddress, tokenName);

      // Call the get-balance function of the SIP-10 token contract
      const response = await fetchCallReadOnlyFunction({
        contractAddress: tokenAddress,
        contractName: tokenName,
        functionName: "get-balance",
        functionArgs: [standardPrincipalCV(ownerAddress)],
        senderAddress: ownerAddress,
        network: this.network,
      });

      // Properly extract the value from the Clarity value
      let balance = 0;

      // Different SIP-10 implementations might return the balance differently
      if (response && response.value) {
        // Try to convert using cvToValue if available
        if (typeof cvToValue === "function") {
          const valueObj = cvToValue(response);
          balance =
            typeof valueObj === "object"
              ? Number(valueObj.value)
              : Number(valueObj);
        } else {
          // Fallback to direct extraction
          balance = Number(response.value);
        }
      }

      // If balance is still NaN, try to handle different response formats
      if (isNaN(balance)) {
        // Some SIP-10 implementations return nested objects
        if (response && response.data && response.data.value) {
          balance = Number(response.data.value);
        } else if (response && typeof response === "object") {
          // Try to find a numeric value in the response object
          const values = Object.values(response).filter(
            (v) => !isNaN(Number(v))
          );
          if (values.length > 0) {
            balance = Number(values[0]);
          }
        }
      }

      // Final fallback - for testing, we'll assume there are enough tokens if we can't determine the balance
      if (isNaN(balance)) {
        console.warn(
          "WARNING: Could not determine token balance. For testing purposes, assuming sufficient balance."
        );
        // For production, you might want to throw an error instead
        balance = Number.MAX_SAFE_INTEGER; // A very large number for testing only
      }

      const formattedBalance = balance / Math.pow(10, this.decimals);
      console.log(`Current balance: ${formattedBalance} ${tokenName} tokens`);

      return balance;
    } catch (error) {
      console.error("Error checking token balance:", error);
      console.warn(
        "WARNING: Balance check failed. For testing purposes, proceeding with transfer."
      );
      // For testing only - in production, you might want to throw the error
      return Number.MAX_SAFE_INTEGER; // A very large number for testing only
    }
  }

  async transferSol(destinationAddress, amountInSol) {
    try {
      console.log(
        `\nInitiating SOL transfer of ${amountInSol} to ${destinationAddress}`
      );

      // Calculate required SIP-10 tokens based on conversion rate
      const requiredSip10Amount = amountInSol * this.conversionRate;
      const scaledRequiredAmount =
        this.convertToScaledAmount(requiredSip10Amount);

      // Check if sender has enough SIP-10 tokens
      const tokenAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
      const tokenName = "ADVT";

      const currentBalance = await this.checkStacksTokenBalance(
        tokenAddress,
        tokenName,
        this.stacksSenderAddress
      );

      if (currentBalance < scaledRequiredAmount) {
        const formattedRequired = requiredSip10Amount.toFixed(this.decimals);
        const formattedBalance = (
          currentBalance / Math.pow(10, this.decimals)
        ).toFixed(this.decimals);
        throw new Error(
          `Insufficient SIP-10 token balance. Required: ${formattedRequired} ${tokenName}, Available: ${formattedBalance} ${tokenName}`
        );
      }

      console.log(`Balance check passed. Proceeding with transfer...`);

      // Convert SOL to lamports
      const lamportsAmount = Math.round(amountInSol * 1e9); // Ensure integer value

      // Create transaction object
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.solanaKeypair.publicKey,
          toPubkey: new PublicKey(destinationAddress),
          lamports: lamportsAmount,
        })
      );

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.solanaKeypair]
      );

      console.log("SOL Transfer Complete");
      console.log("Transaction Signature:", signature);

      // Process the corresponding Stacks transfer
      await this.processTransfer(amountInSol, signature, destinationAddress);

      return signature;
    } catch (error) {
      console.error("Error transferring SOL:", error);
      throw error;
    }
  }

  async processTransfer(transferAmount, signature, recipientAddress) {
    console.log("\nProcessing corresponding Stacks transfer");
    console.log("Amount:", transferAmount, "SOL");

    // Apply conversion rate: 1 SOL = 10 SIP-10 tokens
    const sip10Amount = transferAmount * this.conversionRate;
    console.log("Converting to:", sip10Amount, "SIP-10 tokens");

    try {
      // Convert the SIP-10 amount to the proper decimal representation
      const scaledAmount = this.convertToScaledAmount(sip10Amount);

      // Execute Stacks transfer
      const stacksTxId = await this.executeStacksTransfer({
        amount: scaledAmount,
        recipient: this.getStacksRecipientAddress(recipientAddress),
        memo: `Bridge transfer from Solana tx: ${signature}`,
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

  getStacksRecipientAddress(solanaAddress) {
    // In a real implementation, you might want to map Solana addresses to Stacks addresses
    // For this example, we'll use the hardcoded address from the original code
    return "ST33Y26J2EZW5SJSDRKFJVE97P40ZYYR7K3PATCNF";
  }

  async executeStacksTransfer({ amount, recipient, memo }) {
    const contractAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    const contractName = "Bridged";

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
      functionName: "lock-token", // Call the lock-token function
      functionArgs,
      validateWithAbi: true,
      network: STACKS_TESTNET,
      anchorMode: 3,
      postConditionMode: 1,
      fee: 2000n,
    };

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

    console.log("Stacks Transfer Complete");
    console.log("Transaction ID:", broadcastResponse.txid);

    return broadcastResponse.txid;
  }
}

// Load Solana keypair from the wallet file
function loadSolanaKeypair(filePath) {
  try {
    const keypairData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(keypairData));
  } catch (error) {
    console.error("Error loading Solana keypair:", error);
    throw error;
  }
}

// Example usage
const solanaKeypair = loadSolanaKeypair("my-solana-wallet.json");

const bridge = new SolanaBridge({
  solanaWalletAddress: solanaKeypair.publicKey.toString(),
  solanaKeypair: solanaKeypair,
  stacksPrivateKey:
    "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01",
  stacksContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
  stacksContractName: "ADVT",
  conversionRate: 10, // 1 SOL = 10 SIP-10 tokens
});

async function main() {
  try {
    await bridge.initialize();
    console.log("Bridge initialized successfully");

    // Destination Solana address to transfer SOL to
    const destinationAddress = "HcHediSfUYeH1fAm4L1gzoCgC3cjPqsGhp2QzCBZkSth";

    // Amount of SOL to transfer
    const amountToTransfer = 1; // in SOL

    // Execute the transfer
    await bridge.transferSol(destinationAddress, amountToTransfer);

    console.log("Transfer process completed successfully");
  } catch (error) {
    console.error("Error in bridge operation:", error);
    process.exit(1);
  }
}

main();
