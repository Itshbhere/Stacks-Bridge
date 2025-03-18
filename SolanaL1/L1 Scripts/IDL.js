import fs from "fs";
import anchor from "@project-serum/anchor";
const { PublicKey, SystemProgram } = anchor.web3;

// Replace with your program ID
const programId = new PublicKey("95kZqjTgyqKUJBgW32Pp6n96ENnSSeeeJgGcGMhxXy5S");

// Load wallet keypair properly
const secretKeyData = JSON.parse(
  fs.readFileSync("my-solana-wallet.json", "utf-8")
);
const wallet = new anchor.Wallet(
  anchor.web3.Keypair.fromSecretKey(Uint8Array.from(secretKeyData))
);

// Use AnchorProvider instead of Provider
const provider = new anchor.AnchorProvider(
  new anchor.web3.Connection("https://api.devnet.solana.com"),
  wallet,
  { commitment: "processed" }
);

// Set the provider as the default
anchor.setProvider(provider);

// Load the program
const idl = JSON.parse(fs.readFileSync("idl.json", "utf-8"));
const program = new anchor.Program(idl, programId, provider);

async function sendSol() {
  // Replace with your contract's account address
  const from = new PublicKey("9WYxcKAEfp33Ucp6PSG9AbDPv145uTGJQm2YKY9b5WsP");

  // Replace with the recipient's account address
  const to = new PublicKey("wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj");

  // Replace with the amount of SOL to send (in lamports)
  const amount = 1000000000; // 1 SOL = 1,000,000,000 lamports, this is 0.001 SOL

  // Call the send_sol function
  const tx = await program.methods
    .sendSol(new anchor.BN(amount))
    .accounts({
      from: from,
      to: to,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Transaction signature:", tx);
}

sendSol().catch(console.error);
