import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  standardPrincipalCV,
  uintCV,
  noneCV,
  contractPrincipalCV,
  getAddressFromPrivateKey,
  makeContractCall,
  broadcastTransaction,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import * as fs from "fs";
import fetch from "node-fetch";
import * as readline from "readline";
import * as anchor from "@project-serum/anchor";
import { BN } from "bn.js";

// Only add this if running in Node.js environment
if (typeof global !== "undefined" && !global.fetch) {
  global.fetch = fetch;
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify the question function
function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

class SIPtoSOLBridge {
  constructor(config) {
    // Solana configuration
    this.solanaKeypair = config.solanaKeypair;
    this.connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    this.solanaRecipientAddress = config.solanaRecipientAddress;

    // Stacks configuration
    this.stacksPrivateKey = config.stacksPrivateKey;
    this.network = STACKS_TESTNET;
    this.stacksSenderAddress = getAddressFromPrivateKey(
      this.stacksPrivateKey,
      this.network
    );

    // Token contract information
    this.tokenContractAddress =
      config.tokenContractAddress ||
      "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    this.tokenContractName = config.tokenContractName || "ADVT";

    // Bridge contract information
    this.bridgeContractAddress =
      config.bridgeContractAddress ||
      "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    this.bridgeContractName = config.bridgeContractName || "Bridged";

    // Solana PDA and Program configuration
    this.programId = new PublicKey(
      config.programId || "HV2pqqq7dpW3JrxjhaWhC7etu6RjRLPzzSJ4FGDW49Cr"
    );
    this.pdaSeed = config.pdaSeed || "death_god";
    this.pdaAddress = null;
    this.pdaBump = null;

    // Solana program
    this.wallet = new anchor.Wallet(this.solanaKeypair);
    this.provider = new anchor.AnchorProvider(this.connection, this.wallet, {
      commitment: "confirmed",
    });
    anchor.setProvider(this.provider);

    // Load the program
    try {
      const idl = JSON.parse(
        fs.readFileSync(config.idlPath || "./idl.json", "utf-8")
      );
      this.program = new anchor.Program(idl, this.programId, this.provider);
    } catch (error) {
      console.error("Error loading program IDL:", error);
      throw error;
    }

    // Retry configuration
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 20000;

    // Conversion rate (configurable)
    this.conversionRate = config.conversionRate || 0.1; // 10 SIP to 1 SOL
    this.decimals = config.decimals || 6;
  }

  async initialize() {
    try {
      console.log("SIP to SOL Bridge Initialized");
      console.log("Stacks Sender:", this.stacksSenderAddress);
      console.log(
        "Solana Keypair Public Key:",
        this.solanaKeypair.publicKey.toString()
      );
      console.log("Solana Recipient:", this.solanaRecipientAddress);

      // Derive the PDA address and bump
      const [pdaAddress, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from(this.pdaSeed)],
        this.programId
      );
      this.pdaAddress = pdaAddress;
      this.pdaBump = bump;

      console.log("PDA address:", this.pdaAddress.toString());
      console.log("PDA bump:", this.pdaBump);

      // Check initial balances
      await this.checkBalances();

      return true;
    } catch (error) {
      console.error("Initialization error:", error);
      throw error;
    }
  }

  async checkBalances() {
    try {
      // Check Solana balance of the PDA
      const pdaBalance = await this.connection.getBalance(this.pdaAddress);
      console.log(`PDA Address: ${this.pdaAddress.toString()}`);
      console.log(`PDA SOL balance: ${pdaBalance / LAMPORTS_PER_SOL} SOL`);

      // Check Solana balance of the wallet
      const walletBalance = await this.connection.getBalance(
        this.solanaKeypair.publicKey
      );
      console.log(`Wallet Address: ${this.solanaKeypair.publicKey.toString()}`);
      console.log(
        `Wallet SOL balance: ${walletBalance / LAMPORTS_PER_SOL} SOL`
      );

      // Check SIP token balance
      const tokenBalance = await this.getStacksTokenBalance(
        this.stacksSenderAddress
      );

      // Convert to human-readable format with proper decimals
      const readableBalance =
        Number(tokenBalance) / Math.pow(10, this.decimals);
      console.log(
        `SIP token balance: ${tokenBalance.toString()} units (${readableBalance.toFixed(
          this.decimals
        )} tokens)`
      );

      return {
        pdaBalance: pdaBalance / LAMPORTS_PER_SOL,
        walletBalance: walletBalance / LAMPORTS_PER_SOL,
        tokenBalance,
        readableTokenBalance: readableBalance,
      };
    } catch (error) {
      console.error("Error checking balances:", error);
      throw error;
    }
  }

  async getStacksTokenBalance(address) {
    try {
      console.log(`Fetching token balance for address: ${address}`);
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.tokenContractAddress,
        contractName: this.tokenContractName,
        functionName: "get-balance",
        functionArgs: [standardPrincipalCV(address)],
        network: this.network,
        senderAddress: address,
      });

      if (!result) {
        throw new Error("No response received from token balance check");
      }

      return BigInt(result.value.value);
    } catch (error) {
      console.error("Error getting token balance:", error);
      return BigInt(0);
    }
  }

  async transferSIPtoSOL(sipAmount) {
    // Convert to the raw amount with proper decimals
    const rawAmount = BigInt(sipAmount) * BigInt(Math.pow(10, this.decimals));

    console.log("=== Starting SIP to SOL Bridge Transfer ===");
    console.log(`SIP Amount to send: ${sipAmount} tokens (${rawAmount} units)`);

    try {
      // Step 1: Lock tokens in the bridge contract
      console.log("\nLocking SIP tokens in bridge contract...");
      const lockTxId = await this.lockTokensInBridge(rawAmount);
      console.log("Lock transaction ID:", lockTxId);

      // Wait for lock transaction verification
      console.log("\nWaiting for lock transaction verification...");
      await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));

      // Step 2: Calculate the corresponding SOL amount
      const solAmount = this.calculateSOLAmount(BigInt(rawAmount));
      console.log(`\nCalculated SOL amount to release: ${solAmount} SOL`);

      // Step 3: Transfer SOL from PDA to recipient
      console.log("\nReleasing SOL from PDA to recipient...");
      const solanaTxId = await this.transferSOLFromPDA(
        this.solanaRecipientAddress,
        solAmount
      );
      console.log("Solana transaction signature:", solanaTxId);

      return {
        lockTransactionId: lockTxId,
        solanaTransactionId: solanaTxId,
        status: "completed",
      };
    } catch (error) {
      console.error("Error in SIP to SOL bridge transfer:", error);
      throw error;
    }
  }

  calculateSOLAmount(sipAmount) {
    // Convert SIP amount to SOL based on conversion rate
    // Account for decimals in the conversion
    return (
      (Number(sipAmount) * this.conversionRate) / Math.pow(10, this.decimals)
    );
  }

  async lockTokensInBridge(sipAmount) {
    try {
      const PKey = this.stacksPrivateKey;
      const senderAddress = this.stacksSenderAddress;

      const tokenContractAddress = this.tokenContractAddress;
      const tokenContractName = this.tokenContractName;
      const bridgeContractAddress = this.bridgeContractAddress;
      const bridgeContractName = this.bridgeContractName;

      const initialSenderBalance = await this.getStacksTokenBalance(
        senderAddress
      );

      const readableBalance =
        Number(initialSenderBalance) / Math.pow(10, this.decimals);
      console.log(
        `Initial sender balance: ${initialSenderBalance.toString()} units (${readableBalance.toFixed(
          this.decimals
        )} tokens)`
      );

      if (initialSenderBalance < sipAmount) {
        throw new Error("Insufficient token balance for transfer");
      }

      // Create the function arguments for the token transfer
      const functionArgs = [
        uintCV(sipAmount), // amount
        standardPrincipalCV(senderAddress), // sender
        contractPrincipalCV(bridgeContractAddress, bridgeContractName), // recipient (the contract)
        noneCV(), // memo (optional)
      ];

      const txOptions = {
        senderKey: PKey,
        contractAddress: tokenContractAddress,
        contractName: tokenContractName,
        functionName: "transfer",
        functionArgs,
        validateWithAbi: true,
        network: this.network,
        anchorMode: 3,
        postConditionMode: 1,
        fee: BigInt(2000),
      };

      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction({
        transaction,
        network: this.network,
      });

      if (broadcastResponse.error) {
        throw new Error(broadcastResponse.error);
      }

      return broadcastResponse.txid;
    } catch (error) {
      throw error;
    }
  }

  async transferSOLFromPDA(recipientAddress, amount) {
    try {
      const recipientPubKey = new PublicKey(recipientAddress);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

      console.log(
        `Initiating SOL transfer of ${amount} SOL (${lamports} lamports) from PDA...`
      );

      // Use the program to transfer SOL from the PDA to the recipient
      const tx = await this.program.methods
        .transferFromPda(new BN(lamports), this.pdaBump)
        .accounts({
          pda: this.pdaAddress,
          recipient: recipientPubKey,
          payer: this.solanaKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await this.connection.confirmTransaction(tx, "confirmed");
      return tx;
    } catch (error) {
      console.error("Error transferring SOL from PDA:", error);
      throw error;
    }
  }
}

// Example usage
async function main() {
  try {
    // Load Solana keypair
    const keypairData = JSON.parse(fs.readFileSync("./Keypair.json", "utf-8"));
    const solanaKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

    // Create bridge instance
    const bridge = new SIPtoSOLBridge({
      solanaKeypair: solanaKeypair,
      solanaRecipientAddress: "wHPN297UsAPwDsJDxKgCWCVTEWXBJ7divqnKW4fxKYj", // Updated recipient
      stacksPrivateKey:
        "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01",
      tokenContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
      tokenContractName: "ADVT",
      bridgeContractAddress: "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA",
      bridgeContractName: "Bridged",
      programId: "HV2pqqq7dpW3JrxjhaWhC7etu6RjRLPzzSJ4FGDW49Cr",
      pdaSeed: "death_god",
      idlPath: "./idl.json",
      conversionRate: 0.1,
      decimals: 6,
    });

    // Initialize bridge
    await bridge.initialize();

    // Get user input for amount to transfer
    const userInput = await question(
      "\nEnter the amount of SIP tokens to swap (e.g., 10): "
    );

    // Validate user input
    const sipAmount = parseFloat(userInput);

    if (isNaN(sipAmount) || sipAmount <= 0) {
      console.error("Invalid amount. Please enter a positive number.");
      rl.close();
      return;
    }

    // Confirm the transaction
    const confirmation = await question(
      `\nYou are about to swap ${sipAmount} SIP tokens. Confirm? (y/n): `
    );

    if (
      confirmation.toLowerCase() !== "y" &&
      confirmation.toLowerCase() !== "yes"
    ) {
      console.log("Transaction cancelled by user.");
      rl.close();
      return;
    }

    // Execute transfer with user-provided amount
    const result = await bridge.transferSIPtoSOL(sipAmount);

    console.log("\n=== Transfer Result ===");
    console.log(`Status: ${result.status}`);
    console.log(`Lock Transaction ID: ${result.lockTransactionId}`);
    console.log(`Solana Transaction ID: ${result.solanaTransactionId}`);

    // Check final balances
    console.log("\n=== Final Balances ===");
    await bridge.checkBalances();

    rl.close();
  } catch (error) {
    console.error("Error executing SIP to SOL bridge:", error);
    rl.close();
  }
}

// Run the main function
main()
  .then(() => console.log("Script completed successfully"))
  .catch((error) => console.error("Script failed with error:", error));
