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
  contractPrincipalCV,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import fetch from "node-fetch";

global.fetch = fetch;

// Add BigInt serialization support
BigInt.prototype.toJSON = function () {
  return this.toString();
};

class TokenBridge {
  constructor(config) {
    this.solanaWalletAddress = config.solanaWalletAddress;
    this.solanaTokenMintAddress = config.solanaTokenMintAddress;
    this.stacksPrivateKey = config.stacksPrivateKey;
    this.stacksContractAddress = config.stacksContractAddress;
    this.stacksContractName = config.stacksContractName;
    this.stacksTokenContractAddress = config.stacksTokenContractAddress;
    this.stacksTokenContractName = config.stacksTokenContractName;
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
      console.log(
        "Stacks Sending Contract:",
        this.stacksContractAddress,
        ".",
        this.stacksContractName
      );
      console.log(
        "Stacks Token Contract:",
        this.stacksTokenContractAddress,
        ".",
        this.stacksTokenContractName
      );

      // Verify the token contract
      await this.verifyTokenContract();

      await this.setupSolanaMonitor();
    } catch (error) {
      console.error("Initialization error:", error);
      throw error;
    }
  }

  async verifyTokenContract() {
    try {
      // Try to call get-name on the token contract to verify it's a valid SIP-010 token
      const tokenReadOptions = {
        contractAddress: this.stacksTokenContractAddress,
        contractName: this.stacksTokenContractName,
        functionName: "get-name",
        functionArgs: [],
        network: this.network,
        senderAddress: this.stacksSenderAddress,
      };

      const result = await fetchCallReadOnlyFunction(tokenReadOptions);
      console.log("Token name verification successful:", result);
    } catch (error) {
      console.error(
        "Failed to verify token contract. Check if it implements SIP-010 correctly:",
        error
      );
      throw new Error(
        `Token contract verification failed: ${error.message || error}`
      );
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
        await this.executeLockTokenTransfer(transfer);
        // Add delay between transfers to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Stacks transfer error:", error);
        console.error("Error details:", error.message || "Unknown error");
        // On error, put the transfer back in queue
        this.transferQueue.unshift(transfer);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    this.isProcessingQueue = false;
  }

  async executeLockTokenTransfer({ amount, recipient, memo }) {
    console.log("\nInitiating Stacks Lock Token Transfer");
    console.log("Amount:", amount);
    console.log("Recipient:", recipient);

    const contractAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    const contractName = "Bridged";

    const tokenAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    const tokenName = "ADVT";

    const RecipientAddress = "ST33424G9M8BE62BWP90DA2Z2289JMD0C0SSE4TT5";
    // Create a contractPrincipalCV for the token contract
    const BridgeContract = contractPrincipalCV(contractAddress, contractName);

    const tokenContract = contractPrincipalCV(tokenAddress, tokenName);

    const functionArgs = [
      tokenContract,
      uintCV(Math.floor(amount)),
      standardPrincipalCV(RecipientAddress),
    ];

    // Safely log function args without JSON serialization issues
    console.log("Function Args:", this.describeFunctionArgs(functionArgs));
    console.log(
      "Sending Contract:",
      `${this.stacksContractAddress}.${this.stacksContractName}`
    );
    console.log(
      "Token Contract:",
      `${this.stacksTokenContractAddress}.${this.stacksTokenContractName}`
    );

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

    console.log("Executing lock-token transfer...", txOptions);

    try {
      const transaction = await makeContractCall(txOptions);

      const broadcastResponse = await broadcastTransaction({
        transaction,
        network: STACKS_TESTNET,
      });

      console.log(broadcastResponse);

      console.log("Stacks Lock Token Transfer Complete");
      console.log("Transaction ID:", broadcastResponse.txid);

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

  // Helper method to safely describe function arguments without JSON serialization issues
  describeFunctionArgs(args) {
    return args.map((arg) => {
      if (arg.type === 0) {
        // uint
        return `uintCV(${arg.value})`;
      } else if (arg.type === 5) {
        // principal
        if (arg.address.type === 0) {
          // standard principal
          return `standardPrincipalCV(${arg.address.address})`;
        } else if (arg.address.type === 1) {
          // contract principal
          return `contractPrincipalCV(${arg.address.address}, ${arg.address.contractName})`;
        }
      }
      return `<${arg.type}>`;
    });
  }
}

// Example usage
const bridge = new TokenBridge({
  solanaWalletAddress: "wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj",
  solanaTokenMintAddress: "6TpnnQFFjbyruU4q96x1mygUUynQ9uRxSAWymuAK9FYz",
  stacksPrivateKey:
    "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01",
  stacksContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
  stacksContractName: "Bridged",
  // Make sure these point to a valid SIP-010 token contract
  stacksTokenContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
  stacksTokenContractName: "ADVT",
});

bridge
  .initialize()
  .then(() => console.log("Bridge started successfully"))
  .catch((error) => {
    console.error("Failed to start bridge:", error);
    process.exit(1);
  });
