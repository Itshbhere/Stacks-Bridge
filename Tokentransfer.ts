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
  minimumBalance: number = 100; // Minimum balance threshold

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

      const balance = Number(tokenAccount.amount) / Math.pow(10, 9);
      console.log(`Token balance for ${walletAddress.toString()}: ${balance}`);
      return balance;
    } catch (error) {
      console.error("Error checking balance:", error);
      throw error;
    }
  }

  async ensureMinimumBalance(
    walletAddress: PublicKey,
    requiredAmount: number
  ): Promise<boolean> {
    try {
      const currentBalance = await this.checkBalance(walletAddress);

      if (currentBalance < requiredAmount) {
        console.log(
          `Balance insufficient. Current: ${currentBalance}, Required: ${requiredAmount}`
        );
        const mintAmount = Math.max(1000, requiredAmount * 2); // Mint either 1000 or double the required amount
        await this.mintTokens(mintAmount, walletAddress);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error ensuring minimum balance:", error);
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

      console.log(`Minting ${amount} tokens...`);
      const mintTxId = await mintTo(
        this.connection,
        this.payer,
        this.mint,
        tokenAccount.address,
        this.payer,
        amount * Math.pow(10, 9)
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
    toWalletAddress: string,
    amount: number
  ) {
    try {
      // Check and ensure minimum balance before transfer
      await this.ensureMinimumBalance(fromWallet.publicKey, amount);

      const recipientPubKey = new PublicKey(toWalletAddress);

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
        amount * Math.pow(10, 9)
      );

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

      const [sourceInfo, destInfo] = await Promise.all([
        getAccount(this.connection, sourceAccount.address),
        getAccount(this.connection, destinationAccount.address),
      ]);

      const transferEvent = {
        type: "TokenTransfer",
        signature,
        timestamp: new Date().toISOString(),
        from: sourceAccount.address.toString(),
        to: destinationAccount.address.toString(),
        fromBalance: Number(sourceInfo.amount) / Math.pow(10, 9),
        toBalance: Number(destInfo.amount) / Math.pow(10, 9),
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
  try {
    const secretKeyString = fs.readFileSync("./my-solana-wallet.json", "utf8");
    const payerKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(secretKeyString))
    );

    const tokenInfo = JSON.parse(fs.readFileSync("./token-info.json", "utf8"));
    const tokenOps = new TokenOperations(payerKeypair, tokenInfo.mintAddress);

    const recipientAddress =
      process.argv[2] || "wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj";
    const transferAmount = 50; // Amount to transfer

    console.log("\nChecking sender's initial balance...");
    await tokenOps.checkBalance(payerKeypair.publicKey);

    console.log("\nTransferring tokens...");
    await tokenOps.transferTokens(
      payerKeypair,
      recipientAddress,
      transferAmount
    );

    console.log("\nChecking final balances...");
    await tokenOps.checkBalance(payerKeypair.publicKey);
    await tokenOps.checkBalance(new PublicKey(recipientAddress));
  } catch (error) {
    console.error("Error in main:", error);
  }
}

if (process.argv.length < 3) {
  console.log("Please provide a recipient address:");
  console.log(
    "Usage: node --loader ts-node/esm token-operations.ts <recipient-address>"
  );
} else {
  main().catch(console.error);
}
