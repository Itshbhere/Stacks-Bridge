import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  makeSTXTokenTransfer,
  broadcastTransaction,
  AnchorMode,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import fs from "fs";
import readline from "readline";
import fetch from "node-fetch";

global.fetch = fetch;

class DualTokenTransfer {
  constructor(solPayerKeypair, stacksSenderKey) {
    // Initialize Solana configuration
    this.connection = new Connection(
      "https://api.devnet.solana.com",
      "confirmed"
    );
    this.solPayer = solPayerKeypair;
    this.minimumBalance = 100;

    // Initialize Stacks configuration
    this.STACKS_SENDER_KEY = stacksSenderKey;
    this.network = STACKS_TESTNET;
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 20000;
  }

  // Solana Methods
  async checkSolanaBalance(walletAddress) {
    try {
      const balance = await this.connection.getBalance(walletAddress);
      const solBalance = balance / LAMPORTS_PER_SOL;
      console.log(
        `SOL balance for ${walletAddress.toString()}: ${solBalance} SOL`
      );
      return solBalance;
    } catch (error) {
      console.error("Error checking Solana balance:", error);
      throw error;
    }
  }

  async transferSOL(fromWallet, toWalletAddress, amount) {
    try {
      const recipientPubKey = new PublicKey(toWalletAddress);
      const lamports = amount * LAMPORTS_PER_SOL;

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromWallet.publicKey,
          toPubkey: recipientPubKey,
          lamports,
        })
      );

      console.log(`Initiating SOL transfer of ${amount} SOL...`);
      const signature = await this.connection.sendTransaction(transaction, [
        fromWallet,
      ]);

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Error transferring SOL:", error);
      throw error;
    }
  }

  // Stacks Methods
  async getStacksBalance(address) {
    try {
      const response = await fetch(
        `https://api.testnet.hiro.so/extended/v1/address/${address}/stx`
      );
      const data = await response.json();
      const balance = BigInt(data.balance);
      console.log(`STX balance for ${address}: ${balance} microSTX`);
      return balance;
    } catch (error) {
      console.error("Error getting Stacks balance:", error);
      throw error;
    }
  }

  async transferSTX(recipientAddress, amountInMicroSTX) {
    try {
      const senderAddress = getAddressFromPrivateKey(
        this.STACKS_SENDER_KEY,
        STACKS_TESTNET
      );

      // Check sender balance
      const senderBalance = await this.getStacksBalance(senderAddress);
      if (senderBalance < BigInt(amountInMicroSTX)) {
        throw new Error("Insufficient STX balance for transfer");
      }

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

      const nonce = await getAccountNonce(senderAddress);
      console.log(`Using nonce: ${nonce}`);

      // Create STX transfer transaction
      const txOptions = {
        recipient: recipientAddress,
        amount: BigInt(amountInMicroSTX),
        senderKey: this.STACKS_SENDER_KEY,
        network: this.network,
        memo: "STX",
        anchorMode: AnchorMode.Any,
        nonce: nonce,
        fee: BigInt(2000), // Adjust fee as needed
      };

      const transaction = await makeSTXTokenTransfer(txOptions);
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

  async executeTransfers(
    recipientStacksAddress,
    recipientSolanaAddress,
    amount
  ) {
    console.log("=== Starting Dual Transfer ===\n");

    try {
      // Validate Stacks address
      if (!recipientStacksAddress.startsWith("ST")) {
        throw new Error("Invalid Stacks address format");
      }

      // Validate Solana address
      try {
        new PublicKey(recipientSolanaAddress);
      } catch {
        throw new Error("Invalid Solana address format");
      }

      // Convert amount to microSTX (1 STX = 1,000,000 microSTX)
      const microSTXAmount = BigInt(amount) * BigInt(1000000);

      // Step 1: Execute STX transfer
      console.log("\nInitiating STX transfer...");
      const stacksTxId = await this.transferSTX(
        recipientStacksAddress,
        microSTXAmount
      );
      console.log("Stacks transaction ID:", stacksTxId);
      console.log(
        `View in Explorer: https://explorer.stacks.co/txid/${stacksTxId}?chain=testnet`
      );

      // Wait for Stacks transaction verification
      console.log("\nWaiting for Stacks transaction verification...");
      await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));

      // Step 2: Execute Solana transfer after Stacks verification
      console.log("\nInitiating SOL transfer...");
      const solanaTxId = await this.transferSOL(
        this.solPayer,
        recipientSolanaAddress,
        amount
      );
      console.log("Solana transaction signature:", solanaTxId);

      return {
        stacksTransactionId: stacksTxId,
        solanaTransactionId: solanaTxId,
        status: "completed",
      };
    } catch (error) {
      console.error("Error in dual transfer:", error);
      throw error;
    }
  }

  static async runInteractive() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (query) =>
      new Promise((resolve) => rl.question(query, resolve));

    try {
      // Read configuration files
      const secretKeyString = fs.readFileSync(
        "./my-solana-wallet.json",
        "utf8"
      );
      const solanaKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(secretKeyString))
      );
      const stacksKey =
        "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01";

      const dualTransfer = new DualTokenTransfer(solanaKeypair, stacksKey);

      const stacksAddress = await question("Enter Stacks recipient address: ");
      const solanaAddress = await question("Enter Solana recipient address: ");
      const amount = await question("Enter amount to transfer (in STX/SOL): ");

      if (!Number.isInteger(Number(amount)) || Number(amount) <= 0) {
        throw new Error("Amount must be a positive integer");
      }

      const result = await dualTransfer.executeTransfers(
        stacksAddress,
        solanaAddress,
        Number(amount)
      );

      console.log("\nTransfer Summary:");
      console.log("Stacks Transaction:", result.stacksTransactionId);
      console.log("Solana Transaction:", result.solanaTransactionId);
      console.log("Status:", result.status);
    } catch (error) {
      console.error("Error:", error.message);
    } finally {
      rl.close();
    }
  }
}

// Run the script
DualTokenTransfer.runInteractive();
