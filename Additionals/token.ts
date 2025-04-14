import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import * as fs from "fs";

async function createToken() {
  // Connect to testnet
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  // Load your wallet keypair (payer)
  const secretKeyString = fs.readFileSync("./my-solana-wallet.json", "utf8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const payer = Keypair.fromSecretKey(secretKey);

  console.log("Payer Public Key:", payer.publicKey.toString());

  // Check wallet balance before proceeding
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  if (balance === 0) {
    console.log("Wallet has no SOL. Requesting airdrop...");
    try {
      const signature = await connection.requestAirdrop(
        payer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(signature);
      console.log("Airdrop successful!");
    } catch (error) {
      console.error("Airdrop failed:", error);
      throw new Error("Failed to fund wallet. Please fund it manually.");
    }
  }

  console.log("Creating token...");

  try {
    // Get the minimum lamports needed for rent exemption
    const lamports = await getMinimumBalanceForRentExemptMint(connection);
    console.log(`Minimum lamports needed: ${lamports / LAMPORTS_PER_SOL} SOL`);

    // Create and initialize the token mint
    const mint = await createMint(
      connection,
      payer,
      payer.publicKey,
      payer.publicKey,
      9
    );

    console.log("Token created successfully!");
    console.log("Token Mint Address:", mint.toString());

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

async function getTokenInfo(mintAddress: string) {
  const connection = new Connection(
    "https://api.devnet.solana.com",
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

createToken()
  .then(async (mintAddress) => {
    console.log("Waiting for confirmation...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await getTokenInfo(mintAddress.toString());
  })
  .catch(console.error);








  try {
        // For this implementation, we'll simulate the conversion
        // In a real implementation, you would call the AMM contract
        // This is a placeholder for demonstration purposes
        //   const stxAmount = sipAmount * 0.25; // Example conversion rate
  
        // In a complete implementation, you would use a contract call like:
        // /*
        const txOptions = {
          contractAddress: this.ammContractAddress,
          contractName: this.ammContractName,
          functionName: "get-x-given-y",
          functionArgs: [
            contractPrincipalCV(
              this.tokenContractAddress,
              this.tokenContractName
            ),
            contractPrincipalCV(this.tokenXAddress, this.tokenXContract),
            Cl.uint(this.factorX),
            Cl.uint(sipAmount * Math.pow(10, this.decimals)),
          ],
          network: STACKS_MAINNET,
          senderAddress: this.stacksSenderAddress,
        };
  
        const stxResult = await fetchCallReadOnlyFunction(txOptions);
        const stxAmountRaw = BigInt(stxResult.value.value);
        const stxAmount = Number(stxAmountRaw) / Math.pow(10, 6); // STX decimals
        console.log(`✅ Expected STX amount: ${stxAmount} STX`);
  
        return stxAmount;
      } catch (error) {
        console.error("Error during SIP to STX conversion:", error);
        throw error;
      }