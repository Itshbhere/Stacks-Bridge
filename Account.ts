import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";

// Create a connection to the Solana devnet
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Load your wallet keypair (payer)
// Replace path with your keypair JSON file
const secretKeyString = fs.readFileSync("./my-solana-wallet.json", "utf8");
const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
const payer = Keypair.fromSecretKey(secretKey);

// Create a new keypair for the mint
const mintKeypair = Keypair.generate();

// Function to check balance and get public address
async function checkBalanceAndAddress(keypair: Keypair) {
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`Public Address: ${keypair.publicKey.toBase58()}`);
  console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
}

// Check balance and get public address for the payer
checkBalanceAndAddress(payer);

// Check balance and get public address for the mint keypair
checkBalanceAndAddress(mintKeypair);
