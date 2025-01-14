import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  standardPrincipalCV,
  uintCV,
  noneCV,
  getAddressFromPrivateKey,
  makeContractCall,
  validateStacksAddress,
  broadcastTransaction,
  fetchCallReadOnlyFunction,
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
    this.CONTRACT_ADDRESS = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    this.CONTRACT_NAME = "Krypto";
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
      console.log(`Fetching Stacks balance for address: ${address}`);
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.CONTRACT_ADDRESS,
        contractName: this.CONTRACT_NAME,
        functionName: "get-balance",
        functionArgs: [standardPrincipalCV(address)],
        network: this.network,
        senderAddress: address,
      });

      if (!result) {
        throw new Error("No response received from Stacks balance check");
      }
      console.log("Balance check response:", result.value.value);
      return BigInt(result.value.value);
    } catch (error) {
      console.error("Error getting Stacks balance:", error);
      return BigInt(0);
    }
  }

  async transferStacksTokens(recipientAddress, amount) {
    try {
      const senderAddress = getAddressFromPrivateKey(
        this.STACKS_SENDER_KEY,
        this.network
      );

      const initialSenderBalance = await this.getStacksBalance(senderAddress);
      const initialRecipientBalance = await this.getStacksBalance(
        recipientAddress
      );

      if (initialSenderBalance < BigInt(amount)) {
        throw new Error("Insufficient Stacks balance for transfer");
      }

      const functionArgs = [
        uintCV(parseInt(amount)),
        standardPrincipalCV(senderAddress),
        standardPrincipalCV(recipientAddress),
        noneCV(),
      ];

      const txOptions = {
        senderKey: this.STACKS_SENDER_KEY,
        contractAddress: this.CONTRACT_ADDRESS,
        contractName: this.CONTRACT_NAME,
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

  async executeTransfers(
    recipientStacksAddress,
    recipientSolanaAddress,
    amount
  ) {
    console.log("=== Starting Dual Transfer ===\n");

    try {
      // Validate Stacks address
      if (
        !recipientStacksAddress.startsWith("ST") ||
        !validateStacksAddress(recipientStacksAddress)
      ) {
        throw new Error("Invalid Stacks address format");
      }

      // Validate Solana address
      try {
        new PublicKey(recipientSolanaAddress);
      } catch {
        throw new Error("Invalid Solana address format");
      }

      // Step 1: Execute Stacks transfer
      console.log("\nInitiating Stacks token transfer...");
      const stacksTxId = await this.transferStacksTokens(
        recipientStacksAddress,
        amount.toString()
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
      const amount = await question("Enter amount to transfer: ");

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
