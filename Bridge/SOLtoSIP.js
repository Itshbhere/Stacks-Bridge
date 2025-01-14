import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
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
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import fetch from "node-fetch";

global.fetch = fetch;

class SolanaBridge {
  constructor(config) {
    this.solanaWalletAddress = config.solanaWalletAddress;
    this.stacksPrivateKey = config.stacksPrivateKey;
    this.stacksContractAddress = config.stacksContractAddress;
    this.stacksContractName = config.stacksContractName;
    this.network = STACKS_TESTNET;
    this.lastProcessedSlot = 0;
    this.previousBalance = 0;
    this.transferQueue = [];
    this.isProcessingQueue = false;
    this.decimals = config.decimals || 8;
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

      await this.setupSolanaMonitor();
    } catch (error) {
      console.error("Initialization error:", error);
      throw error;
    }
  }

  async setupSolanaMonitor() {
    const accountPubKey = new PublicKey(this.solanaWalletAddress);

    // Get initial SOL balance
    this.previousBalance = await this.connection.getBalance(accountPubKey);

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
  }

  async handleSolTransfer(accountInfo, context) {
    if (context.slot <= this.lastProcessedSlot) return;
    this.lastProcessedSlot = context.slot;

    const currentBalance = accountInfo.lamports;
    const transferAmount = (currentBalance - this.previousBalance) / 1e9; // Convert lamports to SOL

    this.previousBalance = currentBalance;

    if (transferAmount !== 0) {
      await this.processTransfer(transferAmount, context);
    }
  }

  async processTransfer(transferAmount, context) {
    console.log("\nSOL Transfer Detected!");
    console.log("Slot:", context.slot);
    console.log("Amount:", Math.abs(transferAmount), "SOL");
    console.log("Type:", transferAmount > 0 ? "RECEIVED" : "SENT");

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
          const recipient = this.extractRecipientAddress(transaction);
          // Convert the amount to the proper decimal representation
          const scaledAmount = this.convertToScaledAmount(
            Math.abs(transferAmount)
          );

          this.queueStacksTransfer({
            amount: scaledAmount,
            recipient,
            memo: `Bridge transfer from Solana tx: ${signatures[0].signature}`,
          });
        }
      }
    } catch (error) {
      console.error("Error processing Solana transfer:", error);
    }
  }

  convertToScaledAmount(amount) {
    // Convert the amount to the specified decimal precision
    // For example, if decimals = 8, then 0.1 SOL becomes 10000000
    return Math.round(amount * Math.pow(10, this.decimals));
  }

  extractRecipientAddress(transaction) {
    // In a real implementation, you would extract the recipient address from the transaction
    // This is a placeholder implementation
    return "ST33Y26J2EZW5SJSDRKFJVE97P40ZYYR7K3PATCNF";
  }

  async queueStacksTransfer(transfer) {
    this.transferQueue.push(transfer);
    if (!this.isProcessingQueue) {
      await this.processTransferQueue();
    }
  }

  async processTransferQueue() {
    if (this.isProcessingQueue || this.transferQueue.length === 0) return;

    this.isProcessingQueue = true;
    while (this.transferQueue.length > 0) {
      const transfer = this.transferQueue.shift();
      try {
        await this.executeStacksTransfer(transfer);
        // Add delay between transfers to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Stacks transfer error:", error);
        // On error, put the transfer back in queue
        this.transferQueue.unshift(transfer);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    this.isProcessingQueue = false;
  }

  async executeStacksTransfer({ amount, recipient, memo }) {
    console.log("\nInitiating Stacks Transfer");
    console.log("Amount:", amount);
    console.log("Recipient:", recipient);

    const functionArgs = [
      uintCV(amount), // Remove Math.floor() since we're now passing the properly scaled amount
      standardPrincipalCV(this.stacksSenderAddress),
      standardPrincipalCV(recipient),
      memo ? someCV(bufferCVFromString(memo)) : noneCV(),
    ];

    // console.log("Function Args:", functionArgs);

    const txOptions = {
      senderKey: this.stacksPrivateKey,
      contractAddress: this.stacksContractAddress,
      contractName: this.stacksContractName,
      functionName: "transfer",
      functionArgs,
      validateWithAbi: true,
      network: this.network,
      anchorMode: 3,
      postConditionMode: 1,
      fee: 2000n,
    };

    // console.log("Transaction Options:", txOptions);

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

// Example usage
const bridge = new SolanaBridge({
  solanaWalletAddress: "wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj",
  stacksPrivateKey:
    "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01",
  stacksContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
  stacksContractName: "Krypto",
});

bridge
  .initialize()
  .then(() => console.log("Bridge started successfully"))
  .catch((error) => {
    console.error("Failed to start bridge:", error);
    process.exit(1);
  });
