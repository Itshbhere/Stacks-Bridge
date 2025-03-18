import {
  Connection,
  Keypair,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as fs from "fs";

// Load sender's keypair from file (this account funds the new one)
const senderKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("my-solana-wallet.json", "utf-8")))
);

console.log(`✅ Loaded sender keypair: ${senderKeypair.publicKey.toBase58()}`);

// Connect to Solana Devnet
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

console.log(`✅ Connected to Solana Devnet`);

// Generate a new Keypair for the new account
const newAccountKeypair = Keypair.generate();
console.log(
  `✅ New account public key: ${newAccountKeypair.publicKey.toBase58()}`
);

// Get the minimum balance required for rent exemption
const minBalance = await connection.getMinimumBalanceForRentExemption(0);

console.log(
  `✅ Minimum balance required for rent exemption: ${
    minBalance / LAMPORTS_PER_SOL
  } SOL`
);

// Get the latest blockhash
const { blockhash } = await connection.getLatestBlockhash();

// Create a transaction to create the new account
const transaction = new Transaction().add(
  SystemProgram.createAccount({
    fromPubkey: senderKeypair.publicKey,
    newAccountPubkey: newAccountKeypair.publicKey,
    lamports: minBalance, // Fund with rent-exempt balance
    space: 0, // No extra space needed (for non-program accounts)
    programId: SystemProgram.programId,
  })
);

console.log(`🚀 Creating new account...`, transaction);

// Set recent blockhash
transaction.recentBlockhash = blockhash;
transaction.feePayer = senderKeypair.publicKey;

// Sign the transaction with both the sender (payer) and new account (to prove ownership)
transaction.sign(senderKeypair, newAccountKeypair);

// Send and confirm transaction
const signature = await sendAndConfirmTransaction(connection, transaction, [
  senderKeypair,
  newAccountKeypair,
]);

console.log(`✅ Transaction Signature: ${signature}`);
console.log(`🎉 New account successfully created!`);
