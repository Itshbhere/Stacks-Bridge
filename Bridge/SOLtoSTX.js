import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  makeSTXTokenTransfer,
  broadcastTransaction,
  getAddressFromPrivateKey,
  contractPrincipalCV,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import fetch from "node-fetch";

global.fetch = fetch;

class SolanaBridge {
  constructor(config) {
    this.solanaWalletAddress = config.solanaWalletAddress;
    this.stacksPrivateKey = config.stacksPrivateKey;
    this.network = STACKS_TESTNET;
    this.lastProcessedSlot = 0;
    this.previousBalance = 0;
    this.transferQueue = [];
    this.isProcessingQueue = false;
    this.decimals = config.decimals || 6; // STX uses 6 decimals
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
          // Convert the amount to microSTX (6 decimals)
          const scaledAmount = this.convertToMicroSTX(Math.abs(transferAmount));

          this.queueStacksTransfer({
            amount: scaledAmount,
            recipient,
            memo: `Hello World`,
          });
        }
      }
    } catch (error) {
      console.error("Error processing Solana transfer:", error);
    }
  }

  convertToMicroSTX(amount) {
    // Convert the amount to microSTX (6 decimal places)
    return Math.round(amount * 1e6);
  }

  extractRecipientAddress(transaction) {
    const BridgeContractAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    const BridgeContractName = "Bridged";
    const FinalAddress = contractPrincipalCV(
      BridgeContractAddress,
      BridgeContractName
    );
    return FinalAddress;
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
    console.log("\nInitiating STX Transfer");
    console.log("Amount:", amount, "microSTX");
    console.log("Recipient:", recipient);

    async function getAccountNonce(address) {
      try {
        const response = await fetch(
          `https://api.testnet.hiro.so/extended/v1/address/${address}/nonces`
        );
        const data = await response.json();
        return data.possible_next_nonce;
      } catch (error) {
        console.error("Error fetching nonce:", error);
        throw new Error("Failed to fetch account nonce");
      }
    }

    const nonce = await getAccountNonce(this.stacksSenderAddress);
    console.log(`Using nonce: ${nonce}`);

    const txOptions = {
      recipient,
      amount: BigInt(amount),
      senderKey: this.stacksPrivateKey,
      network: this.network,
      memo: memo,
      anchorMode: 3,
      nonce: nonce, // Will be automatically set
      fee: BigInt(2000),
    };

    console.log("Creating STX Transfer Transaction");

    const transaction = await makeSTXTokenTransfer(txOptions);

    console.log("Broadcasting STX Transfer Transaction");
    const broadcastResponse = await broadcastTransaction({
      transaction,
      network: this.network,
    });

    console.log("STX Transfer Complete");
    console.log("Transaction ID:", broadcastResponse.txid);

    return broadcastResponse.txid;
  }
}

// Example usage
const bridge = new SolanaBridge({
  solanaWalletAddress: "wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj",
  stacksPrivateKey:
    "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01",
});

bridge
  .initialize()
  .then(() => console.log("Bridge started successfully"))
  .catch((error) => {
    console.error("Failed to start bridge:", error);
    process.exit(1);
  });
