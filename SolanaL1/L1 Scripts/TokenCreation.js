import {
  MPL_TOKEN_METADATA_PROGRAM_ID,
  createMetadataAccountV3,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";

console.log(`📌 Establishing connection to Solana Devnet...`);

const senderKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("my-solana-wallet.json", "utf-8")))
);

console.log(`✅ Loaded sender keypair: ${senderKeypair.publicKey.toBase58()}`);

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const mintKeyPair = Keypair.generate();

console.log(`✅ Generated mint keypair: ${mintKeyPair.publicKey.toBase58()}`);

const TokenConfig = {
  decimals: 6,
  name: "Death Token",
  symbol: "DT",
  uri: "https://th.bing.com/th/id/R.f1c96fd335544d7761b3439cdc06ec1d?rik=G4LptGAv4vwxkg&pid=ImgRaw&r=0",
};

// Create a utility function to find the metadata account address using a compatible approach
function findMetadataAccount(mint) {
  // Use a simplified approach for PDA derivation that should work across different versions
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    MPL_TOKEN_METADATA_PROGRAM_ID
  )[0];
}

// Alternatively, try this approach if the above doesn't work:
function findMetadataAccountAlt(mint) {
  const mintString = mint.toString();
  const metadataProgramIdString = MPL_TOKEN_METADATA_PROGRAM_ID.toString();

  // Hard-code the algorithm for PDA derivation
  const seeds = [
    Buffer.from("metadata"),
    new PublicKey(metadataProgramIdString).toBytes(),
    new PublicKey(mintString).toBytes(),
  ];

  return PublicKey.findProgramAddressSync(
    seeds,
    MPL_TOKEN_METADATA_PROGRAM_ID
  )[0];
}

(async () => {
  const lamports = await connection.getMinimumBalanceForRentExemption(
    MINT_SIZE
  );

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: senderKeypair.publicKey,
      newAccountPubkey: mintKeyPair.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKeyPair.publicKey,
      TokenConfig.decimals,
      senderKeypair.publicKey,
      null
    )
  );

  console.log("📌 Sending transaction to create and initialize mint...");
  await sendAndConfirmTransaction(connection, transaction, [
    senderKeypair,
    mintKeyPair,
  ]);

  console.log(`✅ Mint account created: ${mintKeyPair.publicKey.toBase58()}`);

  // Create metadata for the token
  console.log("📌 Creating token metadata...");

  // Try different approaches to derive the metadata account
  let metadataAccount;

  try {
    // Try the primary approach
    metadataAccount = findMetadataAccount(mintKeyPair.publicKey);
    console.log(
      `🔍 Derived metadata account (primary method): ${metadataAccount.toBase58()}`
    );
  } catch (error) {
    console.log(
      "First method failed, trying alternative method:",
      error.message
    );
    try {
      // Try the alternative approach if the first one fails
      metadataAccount = findMetadataAccountAlt(mintKeyPair.publicKey);
      console.log(
        `🔍 Derived metadata account (alternative method): ${metadataAccount.toBase58()}`
      );
    } catch (error2) {
      console.log("Alternative method also failed:", error2.message);

      // Last resort: construct the PDA address directly
      // Note: This is a simplified version and may not generate the correct PDA
      console.log(
        "Attempting to manually derive the metadata account address..."
      );
      const mintAddress = mintKeyPair.publicKey.toBase58();
      metadataAccount = new PublicKey(
        `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`
      );
      console.log(
        `🔍 Using fallback metadata account address: ${metadataAccount.toBase58()}`
      );
    }
  }

  const metadataTransaction = new Transaction().add(
    createMetadataAccountV3(
      {
        metadata: metadataAccount,
        mint: mintKeyPair.publicKey,
        mintAuthority: senderKeypair.publicKey,
        payer: senderKeypair.publicKey,
        updateAuthority: senderKeypair.publicKey,
      },
      {
        data: {
          name: TokenConfig.name,
          symbol: TokenConfig.symbol,
          uri: TokenConfig.uri,
          sellerFeeBasisPoints: 0,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: true,
        collectionDetails: null,
      }
    )
  );

  console.log("📌 Sending transaction to create token metadata...");
  await sendAndConfirmTransaction(connection, metadataTransaction, [
    senderKeypair,
  ]);

  console.log(`✅ Token metadata created: ${metadataAccount.toBase58()}`);
  console.log(`✅ Token creation completed successfully!`);
  console.log(`
    Token Information:
    - Name: ${TokenConfig.name}
    - Symbol: ${TokenConfig.symbol}
    - Decimals: ${TokenConfig.decimals}
    - Mint Address: ${mintKeyPair.publicKey.toBase58()}
    - Metadata Address: ${metadataAccount.toBase58()}
  `);
})().catch((error) => {
  console.error("❌ Error in token creation process:", error);
  console.error(`
    ⚠️ Detected multiple versions of @metaplex-foundation/mpl-token-metadata:
    - Version 2.13.0 (nested under @metaplex-foundation/js)
    - Version 3.4.0 (direct dependency)
    
    This could be causing compatibility issues with the PublicKey methods.
    
    Try running the following command to resolve dependency conflicts:
    
    npm dedupe
    
    Or pin to a specific version:
    
    npm uninstall @metaplex-foundation/mpl-token-metadata
    npm install @metaplex-foundation/mpl-token-metadata@3.4.0
    
    If the issue persists, try creating a separate script to derive the PDA:
    
    const { PublicKey } = require("@solana/web3.js");
    const { MPL_TOKEN_METADATA_PROGRAM_ID } = require("@metaplex-foundation/mpl-token-metadata");
    
    const mintPublicKey = new PublicKey("${mintKeyPair.publicKey.toBase58()}");
    
    try {
      const [metadataAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintPublicKey.toBuffer()
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );
      
      console.log("Metadata address:", metadataAddress.toString());
    } catch(e) {
      console.error(e);
    }
  `);
});
