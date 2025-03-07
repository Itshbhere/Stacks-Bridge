import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  standardPrincipalCV,
  uintCV,
  noneCV,
  contractPrincipalCV,
  getAddressFromPrivateKey,
  makeContractCall,
  broadcastTransaction,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import * as fs from "fs";
import fetch from "node-fetch";

// Only add this if running in Node.js environment
if (typeof global !== "undefined" && !global.fetch) {
  global.fetch = fetch;
}

class SIPtoSOLBridge {
  constructor(config) {
    // Solana configuration
    this.solanaKeypair = config.solanaKeypair;
    this.connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    this.solanaRecipientAddress = config.solanaRecipientAddress;

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
    this.bridgeContractName = config.bridgeContractName || "Bridged";

    // Retry configuration
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 20000;

    // Conversion rate (configurable)
    this.conversionRate = config.conversionRate || 0.1; // 10 SIP to 1 SOL
    this.decimals = config.decimals || 4;
  }

  async initialize() {
    try {
      console.log("SIP to SOL Bridge Initialized");
      console.log("Stacks Sender:", this.stacksSenderAddress);
      console.log(
        "Solana Keypair Public Key:",
        this.solanaKeypair.publicKey.toString()
      );
      console.log("Solana Recipient:", this.solanaRecipientAddress);

      // Check initial balances
      await this.checkBalances();

      // Set up Stacks monitoring if needed
      // For simplicity, we're using a direct bridge call approach instead of monitoring

      return true;
    } catch (error) {
      console.error("Initialization error:", error);
      throw error;
    }
  }

  async checkBalances() {
    try {
      // Check Solana balance
      const solBalance = await this.connection.getBalance(
        this.solanaKeypair.publicKey
      );
      console.log(`SOL balance: ${solBalance / LAMPORTS_PER_SOL} SOL`);

      // Check SIP token balance
      const tokenBalance = await this.getStacksTokenBalance(
        this.stacksSenderAddress
      );
      console.log(`SIP token balance: ${tokenBalance.toString()}`);

      return {
        solBalance: solBalance / LAMPORTS_PER_SOL,
        tokenBalance,
      };
    } catch (error) {
      console.error("Error checking balances:", error);
      throw error;
    }
  }

  async getStacksTokenBalance(address) {
    try {
      console.log(`Fetching token balance for address: ${address}`);
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.tokenContractAddress,
        contractName: this.tokenContractName,
        functionName: "get-balance",
        functionArgs: [standardPrincipalCV(address)],
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

  async transferSIPtoSOL(sipAmount) {
    console.log("=== Starting SIP to SOL Bridge Transfer ===");
    console.log(`SIP Amount to send: ${sipAmount}`);

    try {
      // Step 1: Lock tokens in the bridge contract
      console.log("\nLocking SIP tokens in bridge contract...");
      const lockTxId = await this.lockTokensInBridge(sipAmount);
      console.log("Lock transaction ID:", lockTxId);

      // Wait for lock transaction verification
      console.log("\nWaiting for lock transaction verification...");
      await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));

      // Step 2: Calculate the corresponding SOL amount
      const solAmount = this.calculateSOLAmount(BigInt(sipAmount));
      console.log(`\nCalculated SOL amount to release: ${solAmount} SOL`);

      // Step 3: Transfer SOL to recipient
      console.log("\nReleasing SOL to recipient...");
      const solanaTxId = await this.transferSOL(
        this.solanaRecipientAddress,
        solAmount
      );
      console.log("Solana transaction signature:", solanaTxId);

      return {
        lockTransactionId: lockTxId,
        solanaTransactionId: solanaTxId,
        status: "completed",
      };
    } catch (error) {
      console.error("Error in SIP to SOL bridge transfer:", error);
      throw error;
    }
  }

  calculateSOLAmount(sipAmount) {
    // Convert SIP amount to SOL based on conversion rate
    // Adjust decimal places as needed
    return Number(sipAmount) * this.conversionRate;
  }

  async lockTokensInBridge(sipAmount) {
    try {
      const PKey =
        "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01";
      const senderAddress = getAddressFromPrivateKey(PKey, STACKS_TESTNET);

      const tokenContractAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
      const tokenContractName = "ADVT";
      const bridgeContractAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
      const bridgeContractName = "Bridged";

      const initialSenderBalance = await this.getStacksTokenBalance(
        senderAddress
      );

      console.log("Initial sender balance:", initialSenderBalance.toString());

      if (initialSenderBalance < BigInt(sipAmount)) {
        throw new Error("Insufficient token balance for transfer");
      }

      // Create the function arguments for the token transfer
      const functionArgs = [
        uintCV(BigInt(sipAmount)), // amount
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

  async transferSOL(recipientAddress, amount) {
    try {
      const recipientPubKey = new PublicKey(recipientAddress);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.solanaKeypair.publicKey,
          toPubkey: recipientPubKey,
          lamports,
        })
      );

      console.log(
        `Initiating SOL transfer of ${amount} SOL (${lamports} lamports)...`
      );
      const signature = await this.connection.sendTransaction(transaction, [
        this.solanaKeypair,
      ]);

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Error transferring SOL:", error);
      throw error;
    }
  }
}

// Example usage
async function main() {
  try {
    // Load Solana keypair
    const keypairData = JSON.parse(fs.readFileSync("./Keypair.json", "utf-8"));
    const solanaKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

    // Create bridge instance
    const bridge = new SIPtoSOLBridge({
      solanaKeypair: solanaKeypair,
      solanaRecipientAddress: "Cfez4iZDiEvATzbyBKiN1KDaPoBkyn82yuTpCZtpgtG4", // Example recipient
      stacksPrivateKey:
        "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01",
      tokenContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
      tokenContractName: "ADVT",
      bridgeContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
      bridgeContractName: "Bridged",
      conversionRate: 0.0000001, // Adjust as needed
    });

    // Initialize bridge
    await bridge.initialize();

    // Execute transfer (example amount)
    // For 10 STONE tokens with 6 decimal places
    const sipAmount = 10 * 1000000;
    const result = await bridge.transferSIPtoSOL(sipAmount);

    console.log("\n=== Transfer Result ===");
    console.log(`Status: ${result.status}`);
    console.log(`Lock Transaction ID: ${result.lockTransactionId}`);
    console.log(`Solana Transaction ID: ${result.solanaTransactionId}`);

    // Check final balances
    console.log("\n=== Final Balances ===");
    await bridge.checkBalances();
  } catch (error) {
    console.error("Error executing SIP to SOL bridge:", error);
  }
}

// Run the main function
main()
  .then(() => console.log("Script completed successfully"))
  .catch((error) => console.error("Script failed with error:", error));
