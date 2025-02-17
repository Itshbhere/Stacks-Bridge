import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
  getAccount,
} from "@solana/spl-token";
import {
  standardPrincipalCV,
  uintCV,
  contractPrincipalCV,
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
  constructor(
    solPayerKeypair,
    solMintAddress,
    stacksSenderKey,
    tokenContractAddress
  ) {
    // Initialize Solana configuration
    this.connection = new Connection(
      "https://api.devnet.solana.com",
      "confirmed"
    );
    this.solPayer = solPayerKeypair;
    this.solMint = new PublicKey(solMintAddress);
    this.minimumBalance = 100;

    // Initialize Stacks configuration
    this.STACKS_SENDER_KEY = stacksSenderKey;
    this.CONTRACT_ADDRESS = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    this.CONTRACT_NAME = "Krypto";
    this.TOKEN_CONTRACT_ADDRESS = tokenContractAddress; // Address of the SIP token contract
    this.network = STACKS_TESTNET;
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 20000;
  }

  // Solana Methods remain the same
  async checkSolanaBalance(walletAddress) {
    try {
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.solPayer,
        this.solMint,
        walletAddress
      );
      const balance = Number(tokenAccount.amount) / Math.pow(10, 9);
      console.log(
        `Solana token balance for ${walletAddress.toString()}: ${balance}`
      );
      return balance;
    } catch (error) {
      console.error("Error checking Solana balance:", error);
      throw error;
    }
  }

  async transferSolanaTokens(fromWallet, toWalletAddress, amount) {
    try {
      const recipientPubKey = new PublicKey(toWalletAddress);

      const sourceAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.solPayer,
        this.solMint,
        fromWallet.publicKey
      );

      const destinationAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.solPayer,
        this.solMint,
        recipientPubKey
      );

      console.log(`Initiating Solana transfer of ${amount} tokens...`);
      const transferTxId = await transfer(
        this.connection,
        this.solPayer,
        sourceAccount.address,
        destinationAccount.address,
        fromWallet,
        amount * Math.pow(10, 9)
      );

      return transferTxId;
    } catch (error) {
      console.error("Error transferring Solana tokens:", error);
      throw error;
    }
  }

  // Modified Stacks Methods
  async getStacksBalance(address) {
    try {
      console.log(`Fetching Stacks balance for address: ${address}`);
      const [contractAddr, contractName] =
        this.TOKEN_CONTRACT_ADDRESS.split(".");

      const result = await fetchCallReadOnlyFunction({
        contractAddress: contractAddr,
        contractName: contractName,
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

  async transferStacksTokensToContract(amount) {
    try {
      const senderAddress = getAddressFromPrivateKey(
        this.STACKS_SENDER_KEY,
        this.network
      );

      const initialSenderBalance = await this.getStacksBalance(senderAddress);

      if (initialSenderBalance < BigInt(amount)) {
        throw new Error("Insufficient Stacks token balance for transfer");
      }

      // Create contract principal for the token contract
      const [tokenContractAddr, tokenContractName] =
        this.TOKEN_CONTRACT_ADDRESS.split(".");
      const tokenContractPrincipal = contractPrincipalCV(
        tokenContractAddr,
        tokenContractName
      );

      const functionArgs = [tokenContractPrincipal, uintCV(parseInt(amount))];

      const txOptions = {
        senderKey: this.STACKS_SENDER_KEY,
        contractAddress: this.CONTRACT_ADDRESS,
        contractName: this.CONTRACT_NAME,
        functionName: "receive-token",
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

  async executeTransfers(recipientSolanaAddress, amount) {
    console.log("=== Starting Dual Token Transfer ===\n");

    try {
      // Validate Solana address
      try {
        new PublicKey(recipientSolanaAddress);
      } catch {
        throw new Error("Invalid Solana address format");
      }

      // Step 1: Execute Stacks token transfer to contract
      console.log("\nInitiating Stacks token transfer to contract...");
      const stacksTxId = await this.transferStacksTokensToContract(
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
      console.log("\nInitiating Solana token transfer...");
      const solanaTxId = await this.transferSolanaTokens(
        this.solPayer,
        recipientSolanaAddress,
        amount
      );
      console.log("Solana transaction ID:", solanaTxId);

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
      const tokenInfo = JSON.parse(
        fs.readFileSync("./token-info.json", "utf8")
      );
      const stacksKey =
        "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01";

      // You'll need to replace this with your actual token contract address
      const tokenContractAddress =
        "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA.Krypto";

      const dualTransfer = new DualTokenTransfer(
        solanaKeypair,
        tokenInfo.mintAddress,
        stacksKey,
        tokenContractAddress
      );

      const solanaAddress = await question("Enter Solana recipient address: ");
      const amount = await question("Enter amount to transfer: ");

      if (!Number.isInteger(Number(amount)) || Number(amount) <= 0) {
        throw new Error("Amount must be a positive integer");
      }

      const result = await dualTransfer.executeTransfers(
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
