import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
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

class TokenBridge {
  constructor(config) {
    this.solanaWalletAddress = config.solanaWalletAddress;
    this.solanaTokenMintAddress = config.solanaTokenMintAddress;
    this.stacksPrivateKey = config.stacksPrivateKey;
    this.stacksContractAddress = config.stacksContractAddress;
    this.stacksContractName = config.stacksContractName;
    this.network = STACKS_TESTNET;
    this.lastProcessedSlot = 0;
    this.previousBalances = new Map();
    this.transferQueue = [];
    this.isProcessingQueue = false;
  }

  async initialize() {
    try {
      // Initialize Solana connection
      this.connection = new Connection(clusterApiUrl("devnet"), {
        commitment: "confirmed",
        wsEndpoint: clusterApiUrl("devnet").replace("https", "wss"),
        confirmTransactionInitialTimeout: 60000,
        httpHeaders: {
          "solana-client": `token-bridge-${Date.now()}`,
        },
      });

      // Initialize Stacks sender address
      this.stacksSenderAddress = getAddressFromPrivateKey(
        this.stacksPrivateKey,
        this.network
      );

      console.log("Token Bridge Initialized");
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
    const mintPubKey = new PublicKey(this.solanaTokenMintAddress);

    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      accountPubKey,
      { mint: mintPubKey }
    );

    // Initialize previous balances
    for (const tokenAccount of tokenAccounts.value) {
      this.previousBalances.set(
        tokenAccount.pubkey.toString(),
        tokenAccount.account.data.parsed.info.tokenAmount.uiAmount
      );
    }

    // Set up monitors for each token account
    const subscriptionPromises = tokenAccounts.value.map((tokenAccount) =>
      this.monitorTokenAccount(tokenAccount)
    );

    await Promise.all(subscriptionPromises);
    console.log(`Monitoring ${tokenAccounts.value.length} token accounts`);
  }

  async monitorTokenAccount(tokenAccount) {
    return this.connection.onAccountChange(
      tokenAccount.pubkey,
      async (accountInfo, context) => {
        try {
          await this.handleTokenTransfer(tokenAccount, accountInfo, context);
        } catch (error) {
          console.error("Error in account monitor:", error);
        }
      },
      "confirmed"
    );
  }

  async handleTokenTransfer(tokenAccount, accountInfo, context) {
    // Avoid processing the same slot twice
    if (context.slot <= this.lastProcessedSlot) return;
    this.lastProcessedSlot = context.slot;

    const tokenAccountInfo = await this.connection.getParsedAccountInfo(
      tokenAccount.pubkey
    );

    const parsedData = tokenAccountInfo.value?.data.parsed;
    if (parsedData?.info?.mint !== this.solanaTokenMintAddress) return;

    const currentBalance = parsedData.info.tokenAmount.uiAmount;
    const previousBalance = this.previousBalances.get(
      tokenAccount.pubkey.toString()
    );
    const transferAmount = currentBalance - previousBalance;

    // Update stored balance
    this.previousBalances.set(tokenAccount.pubkey.toString(), currentBalance);

    if (transferAmount !== 0) {
      await this.processTransfer(tokenAccount, transferAmount, context);
    }
  }

  async processTransfer(tokenAccount, transferAmount, context) {
    console.log("\nSolana Token Transfer Detected!");
    console.log("Slot:", context.slot);
    console.log("Amount:", Math.abs(transferAmount));
    console.log("Type:", transferAmount > 0 ? "RECEIVED" : "SENT");

    try {
      const signatures = await this.connection.getSignaturesForAddress(
        tokenAccount.pubkey,
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

        // Extract recipient address from transaction logs
        const logs = transaction?.meta?.logMessages || [];
        const transferLog = logs.find((log) => log.includes("Transfer"));
        if (transferLog) {
          // Queue the Stacks transfer
          this.queueStacksTransfer({
            amount: Math.abs(transferAmount),
            recipient: this.extractRecipientAddress(transferLog),
            memo: `Bridge transfer from Solana tx: ${signatures[0].signature}`,
          });
        }
      }
    } catch (error) {
      console.error("Error processing Solana transfer:", error);
    }
  }

  extractRecipientAddress(transferLog) {
    return "ST33Y26J2EZW5SJSDRKFJVE97P40ZYYR7K3PATCNF"; // Example address
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
      uintCV(Math.floor(amount)),
      standardPrincipalCV(this.stacksSenderAddress),
      standardPrincipalCV(recipient),
      memo ? someCV(bufferCVFromString(memo)) : noneCV(),
    ];

    console.log("Function Args:", functionArgs);

    console.log("Sender Key:", this.stacksPrivateKey);
    console.log("Contract Address:", this.stacksContractAddress);
    console.log("Contract Name:", this.stacksContractName);
    const network = STACKS_TESTNET;

    const txOptions = {
      senderKey: this.stacksPrivateKey,
      contractAddress: this.stacksContractAddress,
      contractName: this.stacksContractName,
      functionName: "transfer",
      functionArgs,
      validateWithAbi: true,
      network,
      anchorMode: 3,
      postConditionMode: 1,
      fee: 2000n,
    };

    console.log("Transaction Options:", txOptions);

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
const bridge = new TokenBridge({
  solanaWalletAddress: "wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj",
  solanaTokenMintAddress: "6TpnnQFFjbyruU4q96x1mygUUynQ9uRxSAWymuAK9FYz",
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
