import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

async function monitorTokenTransfers(walletAddress, tokenMintAddress) {
  try {
    // Validate addresses before creating PublicKeys
    if (!PublicKey.isOnCurve(walletAddress)) {
      throw new Error("Invalid wallet address");
    }
    if (!PublicKey.isOnCurve(tokenMintAddress)) {
      throw new Error("Invalid token mint address");
    }

    // Connect to Solana devnet
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

    // Convert string addresses to PublicKeys
    const accountPubKey = new PublicKey(walletAddress);
    const mintPubKey = new PublicKey(tokenMintAddress);

    console.log("Starting to monitor token transfers...");
    console.log(`Wallet Address: ${walletAddress}`);
    console.log(`Token Mint Address: ${tokenMintAddress}`);

    // Subscribe to token account changes
    const subscriptionId = connection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      async (accountInfo, context) => {
        try {
          if (!accountInfo.accountId) return;

          const tokenAccountInfo = await connection.getParsedAccountInfo(
            accountInfo.accountId
          );

          const parsedData = tokenAccountInfo.value?.data.parsed;
          if (
            parsedData?.info?.mint === mintPubKey.toString() &&
            parsedData?.info?.owner === accountPubKey.toString()
          ) {
            console.log("\nToken Transfer Detected!");
            console.log("Slot:", context.slot);
            console.log("Account:", accountInfo.accountId.toString());
            console.log(
              "Updated Balance:",
              parsedData.info.tokenAmount.uiAmount
            );
            console.log("Timestamp:", new Date().toLocaleString());

            // Get transaction details
            const signatures = await connection.getSignaturesForAddress(
              accountInfo.accountId,
              { limit: 1 }
            );

            if (signatures.length > 0) {
              const transaction = await connection.getParsedTransaction(
                signatures[0].signature,
                { maxSupportedTransactionVersion: 0 }
              );
              console.log(
                "Transfer Details:",
                JSON.stringify(transaction?.meta?.logMessages, null, 2)
              );
            }
          }
        } catch (error) {
          console.error("Error processing token transfer:", error);
        }
      },
      "confirmed"
    );

    // Return subscription ID for cleanup
    return subscriptionId;
  } catch (error) {
    console.error("Error setting up monitor:", error);
    throw error;
  }
}

// Example usage with real Solana addresses
const WALLET_ADDRESS = "wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj"; // Example devnet address
const TOKEN_MINT_ADDRESS = "6TpnnQFFjbyruU4q96x1mygUUynQ9uRxSAWymuAK9FYz"; // Example SOL token mint

monitorTokenTransfers(WALLET_ADDRESS, TOKEN_MINT_ADDRESS)
  .then((subscriptionId) => {
    console.log(`Monitor started with subscription ID: ${subscriptionId}`);
  })
  .catch((error) => {
    console.error("Failed to start monitor:", error);
    process.exit(1);
  });
