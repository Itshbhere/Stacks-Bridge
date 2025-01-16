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
  
  export class STXtoSOL {
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
  
      // Hardcoded recipient addresses (following first script's pattern)
      this.RECIPIENT_STACKS_ADDRESS = "ST33Y26J2EZW5SJSDRKFJVE97P40ZYYR7K3PATCNF";
      this.RECIPIENT_SOLANA_ADDRESS =
        "Cfez4iZDiEvATzbyBKiN1KDaPoBkyn82yuTpCgtG4";
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
  
    async transferSTX(amountInSTX) {
      try {
        const senderAddress = getAddressFromPrivateKey(
          this.STACKS_SENDER_KEY,
          this.network
        );
  
        // Convert STX to microSTX
        const microSTXAmount = BigInt(amountInSTX) * BigInt(1000000);
  
        // Check sender balance
        const senderBalance = await this.getStacksBalance(senderAddress);
        if (senderBalance < microSTXAmount) {
          throw new Error("Insufficient STX balance for transfer");
        }
  
        // Get account nonce
        const nonceResponse = await fetch(
          `https://api.testnet.hiro.so/extended/v1/address/${senderAddress}/nonces`
        );
        const nonceData = await nonceResponse.json();
        const nonce = nonceData.possible_next_nonce;
  
        // Create STX transfer transaction
        const txOptions = {
          recipient: this.RECIPIENT_STACKS_ADDRESS,
          amount: microSTXAmount,
          senderKey: this.STACKS_SENDER_KEY,
          network: this.network,
          memo: "STX Transfer",
          anchorMode: AnchorMode.Any,
          nonce: nonce,
          fee: BigInt(2000),
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
  
    async executeTransfers(stxAmount, solAmount) {
      console.log("=== Starting Dual Transfer ===\n");
      console.log(`STX Amount: ${stxAmount}`);
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
  
        // Step 1: Execute STX transfer
        console.log("\nInitiating STX transfer...");
        const stacksTxId = await this.transferSTX(stxAmount);
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
  }