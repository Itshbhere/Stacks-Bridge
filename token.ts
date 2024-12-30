import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  createMint,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import * as fs from "fs";

async function createToken() {
  // Connect to testnet
  const connection = new Connection(
    "https://api.testnet.solana.com",
    "confirmed"
  );

  // Load your wallet keypair (payer)
  // Replace path with your keypair JSON file
  const secretKeyString = fs.readFileSync("./my-solana-wallet.json", "utf8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const payer = Keypair.fromSecretKey(secretKey);

  // Create a new keypair for the mint
  const mintKeypair = Keypair.generate();

  console.log("Creating token:", mintKeypair.publicKey.toString());

  try {
    // Get the minimum lamports needed for rent exemption
    const lamports = await getMinimumBalanceForRentExemptMint(connection);

    // Create and initialize the token mint
    const mint = await createMint(
      connection,
      payer, // Payer of the transaction
      payer.publicKey, // Mint authority
      payer.publicKey, // Freeze authority (you can use null to disable)
      9 // Decimals (e.g., 9 decimals like SOL)
    );

    console.log("Token created successfully!");
    console.log("Token Mint Address:", mint.toString());

    // Save mint address to file
    const tokenInfo = {
      mintAddress: mint.toString(),
      decimals: 9,
      mintAuthority: payer.publicKey.toString(),
    };

    fs.writeFileSync("token-info.json", JSON.stringify(tokenInfo, null, 2));
    console.log("Token information saved to token-info.json");

    return mint;
  } catch (error) {
    console.error("Error creating token:", error);
    throw error;
  }
}

// Function to check token info
async function getTokenInfo(mintAddress: string) {
  const connection = new Connection(
    "https://api.testnet.solana.com",
    "confirmed"
  );
  const mint = new PublicKey(mintAddress);

  try {
    const mintInfo = await connection.getParsedAccountInfo(mint);
    console.log("Token Info:", mintInfo.value?.data);
  } catch (error) {
    console.error("Error fetching token info:", error);
  }
}

// Run the token creation
createToken()
  .then(async (mintAddress) => {
    console.log("Waiting for confirmation...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await getTokenInfo(mintAddress.toString());
  })
  .catch(console.error);
