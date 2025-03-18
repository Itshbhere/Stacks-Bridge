import fs from "fs";
import anchor from "@project-serum/anchor";
const { PublicKey, SystemProgram } = anchor.web3;

// Program ID
const programId = new PublicKey("HV2pqqq7dpW3JrxjhaWhC7etu6RjRLPzzSJ4FGDW49Cr");

// Load wallet keypair
const secretKeyData = JSON.parse(
  fs.readFileSync("my-solana-wallet.json", "utf-8")
);
const wallet = new anchor.Wallet(
  anchor.web3.Keypair.fromSecretKey(Uint8Array.from(secretKeyData))
);

// Set up provider
const provider = new anchor.AnchorProvider(
  new anchor.web3.Connection("https://api.devnet.solana.com"),
  wallet,
  { commitment: "confirmed" }
);
anchor.setProvider(provider);

// Load the program
const idl = JSON.parse(fs.readFileSync("idl.json", "utf-8"));
const program = new anchor.Program(idl, programId, provider);

// Function to send SOL from the PDA to a recipient
async function sendSolFromPda() {
  // Recipient address
  const recipient = new PublicKey(
    "wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj"
  );

  // Amount to send (in lamports)
  const amount = new anchor.BN(1000000); // 1 SOL

  // Derive the PDA address and bump from the seed
  const [pdaAddress, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("death_god")],
    programId
  );

  console.log("PDA address:", pdaAddress.toString());
  console.log("PDA bump:", bump);

  // Call the program's send function
  const tx = await program.methods
    .transferFromPda(amount, bump)
    .accounts({
      pda: pdaAddress,
      recipient: recipient,
      payer: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Transaction signature:", tx);
}

sendSolFromPda().catch(console.error);
