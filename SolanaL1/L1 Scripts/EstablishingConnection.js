import { lamports } from "@metaplex-foundation/js";
import {
  Connection,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair,
} from "@solana/web3.js";
import "dotenv/config";
import * as fs from "fs";

// Load sender's keypair from file
const senderKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("my-solana-wallet.json", "utf-8")))
);

console.log(`✅ Loaded sender keypair: ${senderKeypair.publicKey.toBase58()}`);

// Define the recipient public key
const toPubkey = new PublicKey("9WYxcKAEfp33Ucp6PSG9AbDPv145uTGJQm2YKY9b5WsP"); // Ensure this is a valid base58 public key

console.log(`📌 Recipient Public Key: ${toPubkey.toBase58()}`);

// Connect to Solana Devnet
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

console.log(`✅ Successfully connected to Solana Devnet`);

const Balance = await connection.getBalance(senderKeypair.publicKey);
console.log(`📌 Sender's balance: ${Balance / LAMPORTS_PER_SOL}`);
