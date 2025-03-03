import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  makeContractCall,
  broadcastTransaction,
  getAddressFromPrivateKey,
  standardPrincipalCV,
  contractPrincipalCV,
  uintCV,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import fetch from "node-fetch";

global.fetch = fetch;

class SolanaBridge {
  constructor(config) {
    this.solanaWalletAddress = config.solanaWalletAddress;
    this.stacksPrivateKey = config.stacksPrivateKey;
    this.network = config.network || STACKS_TESTNET;
    this.lastProcessedSlot = 0;
    this.previousBalance = 0;
    this.transferQueue = [];
    this.isProcessingQueue = false;
    this.decimals = config.decimals || 6; // STX uses 6 decimals

    // Contract configuration
    this.stacksContractAddress =
      config.contractAddress || "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    this.stacksContractName = config.contractName || "Bridged";
    this.stacksTokenContractAddress =
      config.tokenAddress || "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    this.stacksTokenContractName = config.tokenName || "ADVT";
    this.defaultRecipientAddress =
      config.recipientAddress || "ST33Y26J2EZW5SJSDRKFJVE97P40ZYYR7K3PATCNF";

    // Bridge configuration
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 5000; // 5 seconds
    this.processingDelay = config.processingDelay || 2000; // 2 seconds

    // Keep track of retry attempts for each transaction
    this.retryAttempts = new Map();
  }

  async initialize() {
    try {
      // Initialize Solana connection
      this.connection = new Connection(clusterApiUrl("devnet"), {
        commitment: "confirmed",
        wsEndpoint: clusterApiUrl("devnet").replace("https", "wss"),
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
      console.log(
        "Bridge Contract:",
        `${this.stacksContractAddress}.${this.stacksContractName}`
      );
      console.log(
        "Token Contract:",
        `${this.stacksTokenContractAddress}.${this.stacksTokenContractName}`
      );

      await this.setupSolanaMonitor();
    } catch (error) {
      console.error("Initialization error:", error);
      throw error;
    }
  }

  async setupSolanaMonitor() {
    try {
      const accountPubKey = new PublicKey(this.solanaWalletAddress);

      // Get initial SOL balance
      this.previousBalance = await this.connection.getBalance(accountPubKey);
      console.log("Initial SOL balance:", this.previousBalance / 1e9, "SOL");

      // Set up monitor for the SOL account
      const subscriptionId = this.connection.onAccountChange(
        accountPubKey,
        async (accountInfo, context) => {
          try {
            await this.handleSolTransfer(accountInfo, context);
          } catch (error) {
            console.error("Error in account monitor:", error);
          }
        },
        "confirmed"
      );

      console.log("Monitoring SOL account for changes");
      return subscriptionId;
    } catch (error) {
      console.error("Error setting up Solana monitor:", error);
      throw error;
    }
  }

  async handleSolTransfer(accountInfo, context) {
    if (context.slot <= this.lastProcessedSlot) {
      console.log(`Skipping already processed slot ${context.slot}`);
      return;
    }

    this.lastProcessedSlot = context.slot;
    const currentBalance = accountInfo.lamports;
    const transferAmount = (currentBalance - this.previousBalance) / 1e9; // Convert lamports to SOL

    this.previousBalance = currentBalance;

    if (transferAmount > 0) {
      // Only process incoming transfers
      await this.processTransfer(transferAmount, context);
    } else if (transferAmount < 0) {
      console.log(
        `\nOutgoing transfer detected: ${Math.abs(
          transferAmount
        )} SOL (not processing)`
      );
    }
  }

  async processTransfer(transferAmount, context) {
    console.log("\nSOL Transfer Detected!");
    console.log("Slot:", context.slot);
    console.log("Amount:", transferAmount, "SOL");

    try {
      const accountPubKey = new PublicKey(this.solanaWalletAddress);
      const signatures = await this.connection.getSignaturesForAddress(
        accountPubKey,
        { limit: 1 }
      );

      if (signatures.length > 0) {
        const transaction = await this.connection.getParsedTransaction(
          signatures[0].signature,
          {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          }
        );

        if (transaction) {
          const sender = this.extractSenderAddress(transaction);
          // Convert the amount to microSTX (6 decimals)
          const scaledAmount = this.convertToMicroSTX(transferAmount);

          console.log("Sender:", sender || "Unknown");
          console.log("Transaction Signature:", signatures[0].signature);

          this.queueStacksTransfer({
            amount: scaledAmount,
            recipient: this.defaultRecipientAddress,
            sender: sender,
            memo: `Bridge transfer from Solana tx: ${signatures[0].signature.substring(
              0,
              8
            )}`,
            solanaSignature: signatures[0].signature,
          });
        } else {
          console.warn("Could not fetch parsed transaction details");
        }
      } else {
        console.warn("No recent signatures found for this account");
      }
    } catch (error) {
      console.error("Error processing Solana transfer:", error);
    }
  }

  convertToMicroSTX(amount) {
    // Convert the amount to microSTX (6 decimal places)
    return Math.round(amount * 1e6);
  }

  extractSenderAddress(transaction) {
    try {
      if (transaction?.transaction?.message?.accountKeys) {
        // The first account is usually the fee payer/sender
        return transaction.transaction.message.accountKeys[0].pubkey.toString();
      }
    } catch (error) {
      console.error("Error extracting sender address:", error);
    }
    return null;
  }

  async queueStacksTransfer(transfer) {
    // Generate a unique ID for this transfer
    const transferId = `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    transfer.id = transferId;
    this.retryAttempts.set(transferId, 0);

    console.log(`Queuing Stacks transfer with ID: ${transferId}`);
    this.transferQueue.push(transfer);

    if (!this.isProcessingQueue) {
      await this.processTransferQueue();
    }
  }

  async processTransferQueue() {
    if (this.isProcessingQueue || this.transferQueue.length === 0) return;

    this.isProcessingQueue = true;
    console.log(
      `Processing queue with ${this.transferQueue.length} pending transfers`
    );

    while (this.transferQueue.length > 0) {
      const transfer = this.transferQueue.shift();
      try {
        const attempts = this.retryAttempts.get(transfer.id) || 0;

        if (attempts >= this.maxRetries) {
          console.error(
            `Transfer ${transfer.id} failed after ${attempts} attempts, dropping from queue`
          );
          this.retryAttempts.delete(transfer.id);
          continue;
        }

        console.log(
          `Attempting transfer ${transfer.id} (attempt ${attempts + 1}/${
            this.maxRetries
          })`
        );
        this.retryAttempts.set(transfer.id, attempts + 1);

        await this.executeStacksTransfer(transfer);

        // If we get here, transfer was successful
        console.log(`Transfer ${transfer.id} completed successfully`);
        this.retryAttempts.delete(transfer.id);

        // Add delay between transfers to avoid rate limiting
        await new Promise((resolve) =>
          setTimeout(resolve, this.processingDelay)
        );
      } catch (error) {
        console.error(`Stacks transfer error for ${transfer.id}:`, error);

        // On error, put the transfer back in queue if we haven't exceeded max retries
        const attempts = this.retryAttempts.get(transfer.id) || 0;
        if (attempts < this.maxRetries) {
          console.log(`Requeuing transfer ${transfer.id} for retry later`);
          this.transferQueue.push(transfer);
        } else {
          console.error(
            `Transfer ${transfer.id} failed after ${attempts} attempts, dropping from queue`
          );
          this.retryAttempts.delete(transfer.id);
        }

        // Wait before processing more to avoid hammering the API
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      }
    }
    this.isProcessingQueue = false;
    console.log("Queue processing complete");
  }

  async executeStacksTransfer({ amount, recipient, sender, memo, id }) {
    console.log("\nInitiating Stacks Lock Token Transfer");
    console.log("Transfer ID:", id);
    console.log("Amount:", amount, "microunits");
    console.log("Recipient:", recipient);
    console.log("Memo:", memo);

    // Create a contractPrincipalCV for the token contract
    const bridgeContract = contractPrincipalCV(
      this.stacksContractAddress,
      this.stacksContractName
    );
    const tokenContract = contractPrincipalCV(
      this.stacksTokenContractAddress,
      this.stacksTokenContractName
    );

    const functionArgs = [
      uintCV(Math.floor(amount)),
      standardPrincipalCV(recipient),
    ];

    // Safely log function args
    console.log("Function Args:", this.describeFunctionArgs(functionArgs));
    console.log(
      "Bridge Contract:",
      `${this.stacksContractAddress}.${this.stacksContractName}`
    );
    console.log(
      "Token Contract:",
      `${this.stacksTokenContractAddress}.${this.stacksTokenContractName}`
    );

    const txOptions = {
      senderKey: this.stacksPrivateKey,
      contractAddress: this.stacksContractAddress,
      contractName: this.stacksContractName,
      functionName: "lock-stx", // Call the lock-token function
      functionArgs,
      validateWithAbi: true,
      network: this.network,
      anchorMode: 3, // AnchorMode.Any
      postConditionMode: 1, // Allow
      fee: 2000n,
    };

    console.log("Executing lock-token transfer...");

    try {
      const transaction = await makeContractCall(txOptions);

      const broadcastResponse = await broadcastTransaction({
        transaction,
        network: this.network,
      });

      console.log("Stacks Lock Token Transfer Complete");
      console.log("Transaction ID:", broadcastResponse.txid);
      console.log("Response:", JSON.stringify(broadcastResponse, null, 2));

      return broadcastResponse.txid;
    } catch (error) {
      console.error("Error executing lock-token transfer:", error);
      if (error.message && error.message.includes("BadTraitImplementation")) {
        console.error(
          "The token contract does not correctly implement the SIP-010 trait."
        );
        console.error(
          "Please verify that the token contract address and name are correct and that it implements all SIP-010 functions."
        );
      }
      throw error;
    }
  }

  // Helper method to describe function arguments for logging
  describeFunctionArgs(args) {
    return args.map((arg) => {
      if (arg && typeof arg === "object" && arg.type) {
        if (arg.type === "principal") {
          return `Principal: ${arg.address}${
            arg.contractName ? `.${arg.contractName}` : ""
          }`;
        } else if (arg.type === "uint") {
          return `UInt: ${arg.value}`;
        } else {
          return `${arg.type}: ${JSON.stringify(arg.value)}`;
        }
      }
      return String(arg);
    });
  }

  // Method to stop monitoring and clean up resources
  async shutdown() {
    try {
      // Clean up any subscriptions
      if (this.subscriptionId) {
        await this.connection.removeAccountChangeListener(this.subscriptionId);
        console.log("Removed account change listener");
      }

      console.log("Bridge shutdown complete");
    } catch (error) {
      console.error("Error during shutdown:", error);
    }
  }
}

// Example usage
const bridge = new SolanaBridge({
  solanaWalletAddress: "wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj",
  stacksPrivateKey:
    "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01",
  contractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
  contractName: "Bridged",
  tokenAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
  tokenName: "ADVT",
  recipientAddress: "ST33Y26J2EZW5SJSDRKFJVE97P40ZYYR7K3PATCNF",
  maxRetries: 3,
});

bridge
  .initialize()
  .then(() => console.log("Bridge started successfully"))
  .catch((error) => {
    console.error("Failed to start bridge:", error);
    process.exit(1);
  });

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down bridge...");
  await bridge.shutdown();
  process.exit(0);
});
