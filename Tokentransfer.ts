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
  Account,
} from "@solana/spl-token";
import * as fs from "fs";

class TokenOperations {
  connection: Connection;
  payer: Keypair;
  mint: PublicKey;

  constructor(payerKeypair: Keypair, mintAddress: string) {
    this.connection = new Connection(
      "https://api.devnet.solana.com",
      "confirmed"
    );
    this.payer = payerKeypair;
    this.mint = new PublicKey(mintAddress);
  }

  async checkBalance(walletAddress: PublicKey): Promise<number> {
    try {
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.payer,
        this.mint,
        walletAddress
      );

      const balance = Number(tokenAccount.amount) / Math.pow(10, 9); // Convert to actual token amount
      console.log(`Token balance for ${walletAddress.toString()}: ${balance}`);
      return balance;
    } catch (error) {
      console.error("Error checking balance:", error);
      throw error;
    }
  }

  async mintTokens(amount: number, destinationWallet: PublicKey) {
    try {
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.payer,
        this.mint,
        destinationWallet
      );

      console.log("Minting tokens...");
      const mintTxId = await mintTo(
        this.connection,
        this.payer,
        this.mint,
        tokenAccount.address,
        this.payer,
        amount * Math.pow(10, 9) // Adjusting for decimals
      );

      console.log(`Mint successful! Transaction ID: ${mintTxId}`);
      await this.checkBalance(destinationWallet);
      return mintTxId;
    } catch (error) {
      console.error("Error minting tokens:", error);
      throw error;
    }
  }

  async transferTokens(
    fromWallet: Keypair,
    toWalletAddress: string, // Accept string address
    amount: number
  ) {
    try {
      const recipientPubKey = new PublicKey(toWalletAddress);

      // Get or create associated token accounts for both wallets
      const sourceAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.payer,
        this.mint,
        fromWallet.publicKey
      );

      const destinationAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.payer,
        this.mint,
        recipientPubKey
      );

      console.log(
        `Initiating transfer of ${amount} tokens to ${toWalletAddress}...`
      );
      const transferTxId = await transfer(
        this.connection,
        this.payer,
        sourceAccount.address,
        destinationAccount.address,
        fromWallet,
        amount * Math.pow(10, 9) // Adjusting for decimals
      );

      // Monitor the transfer event
      await this.monitorTransferEvent(
        transferTxId,
        sourceAccount,
        destinationAccount
      );

      return transferTxId;
    } catch (error) {
      console.error("Error transferring tokens:", error);
      throw error;
    }
  }

  async monitorTransferEvent(
    signature: string,
    sourceAccount: Account,
    destinationAccount: Account
  ) {
    try {
      console.log("Waiting for transfer confirmation...");
      await this.connection.confirmTransaction(signature);

      // Get updated account info
      const [sourceInfo, destInfo] = await Promise.all([
        getAccount(this.connection, sourceAccount.address),
        getAccount(this.connection, destinationAccount.address),
      ]);

      // Create transfer event log
      const transferEvent = {
        type: "TokenTransfer",
        signature,
        timestamp: new Date().toISOString(),
        from: sourceAccount.address.toString(),
        to: destinationAccount.address.toString(),
        fromBalance: Number(sourceInfo.amount) / Math.pow(10, 9), // Convert to actual token amount
        toBalance: Number(destInfo.amount) / Math.pow(10, 9), // Convert to actual token amount
        status: "Confirmed",
      };

      console.log("Transfer Event:", transferEvent);
      return transferEvent;
    } catch (error) {
      console.error("Error monitoring transfer:", error);
      throw error;
    }
  }
}

async function main() {
  // Load your wallet keypair
  const secretKeyString = fs.readFileSync("./my-solana-wallet.json", "utf8");
  const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(secretKeyString))
  );

  // Load token info
  const tokenInfo = JSON.parse(fs.readFileSync("./token-info.json", "utf8"));

  // Create token operations instance
  const tokenOps = new TokenOperations(payerKeypair, tokenInfo.mintAddress);

  // Recipient address - replace with your desired recipient address
  const recipientAddress = "wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj";

  try {
    // Check initial balance
    console.log("\nChecking sender's initial balance...");
    await tokenOps.checkBalance(payerKeypair.publicKey);

    // Mint tokens if needed (uncomment if you need to mint more tokens)
    // console.log("\nMinting tokens...");
    // await tokenOps.mintTokens(100, payerKeypair.publicKey);

    // Transfer tokens
    console.log("\nTransferring tokens...");
    await tokenOps.transferTokens(payerKeypair, recipientAddress, 50);

    // Check final balances
    console.log("\nChecking final balances...");
    await tokenOps.checkBalance(payerKeypair.publicKey);
    await tokenOps.checkBalance(new PublicKey(recipientAddress));
  } catch (error) {
    console.error("Error in main:", error);
  }
}

// Run the script
if (process.argv.length < 3) {
  console.log("Please provide a recipient address:");
  console.log(
    "Usage: node --loader ts-node/esm token-operations.ts <recipient-address>"
  );
} else {
  main().catch(console.error);
}
