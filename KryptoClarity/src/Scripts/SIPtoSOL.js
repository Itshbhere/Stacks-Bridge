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
import { Buffer } from "buffer";

export class DualTokenTransfer {
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

    // Hardcoded recipient addresses
    this.RECIPIENT_STACKS_ADDRESS = "ST33Y26J2EZW5SJSDRKFJVE97P40ZYYR7K3PATCNF";
    this.RECIPIENT_SOLANA_ADDRESS =
      "Cfez4iZDiEvATzbyBKiN1KDaPoBkyn82yuTpCZtpgtG4";
  }

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

  async transferSOL(fromWallet, amount) {
    try {
      const recipientPubKey = new PublicKey(this.RECIPIENT_SOLANA_ADDRESS);
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

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Error transferring SOL:", error);
      throw error;
    }
  }

  async transferStacksTokens(amount) {
    try {
      const senderAddress = getAddressFromPrivateKey(
        this.STACKS_SENDER_KEY,
        this.network
      );

      const initialSenderBalance = await this.getStacksBalance(senderAddress);

      if (initialSenderBalance < BigInt(amount)) {
        throw new Error("Insufficient Stacks balance for transfer");
      }

      const functionArgs = [
        uintCV(parseInt(amount)),
        standardPrincipalCV(senderAddress),
        standardPrincipalCV(this.RECIPIENT_STACKS_ADDRESS),
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

  async executeTransfers(sip10Amount, solAmount) {
    console.log("=== Starting Dual Transfer ===\n");
    console.log(`SIP-10 Amount: ${sip10Amount}`);
    console.log(`SOL Amount: ${solAmount}`);
    console.log(`Stacks Recipient: ${this.RECIPIENT_STACKS_ADDRESS}`);
    console.log(`Solana Recipient: ${this.RECIPIENT_SOLANA_ADDRESS}\n`);

    try {
      // First check Solana balance
      console.log("\nChecking Solana balance...");
      const solanaBalance = await this.checkSolanaBalance(
        this.solPayer.publicKey
      );

      // Calculate required balance including a buffer for transaction fees
      const requiredBalance = solAmount + 0.001; // Adding 0.001 SOL for transaction fees

      if (solanaBalance < requiredBalance) {
        throw new Error(
          `Insufficient Solana balance. Required: ${requiredBalance} SOL, Available: ${solanaBalance} SOL`
        );
      }

      console.log(
        `Solana balance sufficient: ${solanaBalance} SOL available for transfer of ${solAmount} SOL`
      );

      // Step 1: Execute Stacks transfer
      console.log("\nInitiating Stacks token transfer...");
      const stacksTxId = await this.transferStacksTokens(
        sip10Amount.toString()
      );
      console.log("Stacks transaction ID:", stacksTxId);

      // Wait for Stacks transaction verification
      console.log("\nWaiting for Stacks transaction verification...");
      await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));

      // Step 2: Execute Solana transfer after Stacks verification
      console.log("\nInitiating SOL transfer...");
      const solanaTxId = await this.transferSOL(this.solPayer, solAmount);
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
}
