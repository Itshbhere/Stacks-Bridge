import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  standardPrincipalCV,
  uintCV,
  noneCV,
  contractPrincipalCV,
  getAddressFromPrivateKey,
  makeContractCall,
  validateStacksAddress,
  broadcastTransaction,
  fetchCallReadOnlyFunction,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import fetch from "node-fetch";

// Only add this if running in Node.js environment
if (typeof global !== "undefined" && !global.fetch) {
  global.fetch = fetch;
}

export class DualTokenTransfer {
  constructor(solPayerKeypair, stacksSenderKey) {
    // Initialize Solana configuration
    this.connection = new Connection(
      "https://api.devnet.solana.com",
      "confirmed"
    );
    this.solPayer = solPayerKeypair;
    this.minimumBalance = 100;

    // Initialize Stacks configuration
    this.STACKS_SENDER_KEY = stacksSenderKey;

    // Token contract information
    this.TOKEN_CONTRACT_ADDRESS = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    this.TOKEN_CONTRACT_NAME = "KryptoTokens";

    // Bridge contract information
    this.BRIDGE_CONTRACT_ADDRESS = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
    this.BRIDGE_CONTRACT_NAME = "Bridg";

    this.network = STACKS_TESTNET;
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 20000;

    // Hardcoded recipient address for Solana only
    this.RECIPIENT_SOLANA_ADDRESS =
      "Cfez4iZDiEvATzbyBKiN1KDaPoBkyn82yuTpCZtpgtG4";
  }

  async checkSolanaBalance(walletAddress) {
    try {
      const balance = await this.connection.getBalance(walletAddress);
      const solBalance = balance / LAMPORTS_PER_SOL;
      console.log(
        `SOL balance for ${walletAddress.toString()}: ${solBalance} SOL`
      );
      return solBalance;
    } catch (error) {
      console.error("Error checking Solana balance:", error);
      throw error;
    }
  }

  async transferSOL(fromWallet, amount) {
    try {
      const recipientPubKey = new PublicKey(this.RECIPIENT_SOLANA_ADDRESS);
      const lamports = amount * LAMPORTS_PER_SOL;

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromWallet.publicKey,
          toPubkey: recipientPubKey,
          lamports,
        })
      );

      console.log(`Initiating SOL transfer of ${amount} SOL...`);
      const signature = await this.connection.sendTransaction(transaction, [
        fromWallet,
      ]);

      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    } catch (error) {
      console.error("Error transferring SOL:", error);
      throw error;
    }
  }

  async approveTokens(amount) {
    try {
      const senderAddress = getAddressFromPrivateKey(
        this.STACKS_SENDER_KEY,
        this.network
      );

      //Issue 1
      const bridgeContractAddress = this.BRIDGE_CONTRACT_ADDRESS;
      const bridgeContractName = this.BRIDGE_CONTRACT_NAME;
      // Check token balance before approval
      const tokenBalance = await this.getStacksBalance(senderAddress);
      console.log(`Current token balance: ${tokenBalance.toString()}`);

      if (tokenBalance < BigInt(amount)) {
        throw new Error("Insufficient token balance for approval");
      }

      // Call the approve function from the token contract
      const functionArgs = [
        contractPrincipalCV(bridgeContractAddress, bridgeContractName),
        uintCV(BigInt(amount)),
      ];

      const txOptions = {
        senderKey: this.STACKS_SENDER_KEY,
        contractAddress: this.TOKEN_CONTRACT_ADDRESS,
        contractName: this.TOKEN_CONTRACT_NAME,
        functionName: "approve",
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

      console.log(`Tokens approved. Transaction ID: ${broadcastResponse.txid}`);
      return broadcastResponse.txid;
    } catch (error) {
      console.error("Error approving tokens:", error);
      throw error;
    }
  }

  async transferFromUser(amount) {
    try {
      const senderAddress = getAddressFromPrivateKey(
        this.STACKS_SENDER_KEY,
        this.network
      );

      const initialSenderBalance = await this.getStacksBalance(senderAddress);

      if (initialSenderBalance < BigInt(amount)) {
        throw new Error("Insufficient token balance for transfer");
      }

      // Create the function arguments for the token transfer
      const functionArgs = [
        uintCV(BigInt(amount)), // amount
        standardPrincipalCV(senderAddress), // sender
        contractPrincipalCV(
          this.BRIDGE_CONTRACT_ADDRESS,
          this.BRIDGE_CONTRACT_NAME
        ), // recipient (the contract)
        noneCV(), // memo (optional)
      ];

      const txOptions = {
        senderKey: this.STACKS_SENDER_KEY,
        contractAddress: this.TOKEN_CONTRACT_ADDRESS,
        contractName: this.TOKEN_CONTRACT_NAME,
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

  async executeSwap(sip10Amount, solAmount) {
    console.log("=== Starting Token Swap ===\n");
    console.log(`SIP-10 Amount to send to contract: ${sip10Amount}`);
    console.log(`SOL Amount to release: ${solAmount}`);
    console.log(
      `Token Contract: ${this.TOKEN_CONTRACT_ADDRESS}.${this.TOKEN_CONTRACT_NAME}`
    );
    console.log(
      `Bridge Contract: ${this.BRIDGE_CONTRACT_ADDRESS}.${this.BRIDGE_CONTRACT_NAME}`
    );
    console.log(`Solana Recipient: ${this.RECIPIENT_SOLANA_ADDRESS}\n`);

    try {
      // Step 1: Approve tokens for the bridge contract
      console.log("\nApproving tokens for the bridge contract...");
      const approvalTxId = await this.approveTokens(sip10Amount.toString());
      console.log("Approval transaction ID:", approvalTxId);

      // Wait for approval transaction verification
      console.log("\nWaiting for approval transaction verification...");
      await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY / 2));

      // Step 2: Check allowance
      const stacksAddress = getAddressFromPrivateKey(
        this.STACKS_SENDER_KEY,
        this.network
      );
      const allowance = await this.getAllowance(
        stacksAddress,
        this.BRIDGE_CONTRACT_ADDRESS
      );
      console.log(`Allowance for bridge contract: ${allowance.toString()}`);

      // Step 3: Execute transfer-from to move tokens from user to bridge contract
      console.log("\nTransferring tokens from user to bridge contract...");
      const transferTxId = await this.transferFromUser(sip10Amount.toString());
      console.log("Transfer transaction ID:", transferTxId);

      // Wait for transfer transaction verification
      console.log("\nWaiting for transfer transaction verification...");
      await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));

      // Step 4: Release SOL after Stacks transaction verifications
      console.log("\nReleasing SOL to recipient...");
      const solanaTxId = await this.transferSOL(this.solPayer, solAmount);
      console.log("Solana transaction signature:", solanaTxId);

      return {
        approvalTransactionId: approvalTxId,
        transferTransactionId: transferTxId,
        solanaTransactionId: solanaTxId,
        status: "completed",
      };
    } catch (error) {
      console.error("Error in token swap:", error);
      throw error;
    }
  }

  async getAllowance(owner, spender) {
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.TOKEN_CONTRACT_ADDRESS,
        contractName: this.TOKEN_CONTRACT_NAME,
        functionName: "get-allowance",
        functionArgs: [
          standardPrincipalCV(owner),
          standardPrincipalCV(spender),
        ],
        network: this.network,
        senderAddress: owner,
      });

      if (!result) {
        throw new Error("No response received from allowance check");
      }
      console.log("Allowance check response:", result.value.value);
      return BigInt(result.value.value);
    } catch (error) {
      console.error("Error getting allowance:", error);
      return BigInt(0);
    }
  }

  async getStacksBalance(address) {
    try {
      console.log(`Fetching token balance for address: ${address}`);
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.TOKEN_CONTRACT_ADDRESS,
        contractName: this.TOKEN_CONTRACT_NAME,
        functionName: "get-balance",
        functionArgs: [standardPrincipalCV(address)],
        network: this.network,
        senderAddress: address,
      });

      if (!result) {
        throw new Error("No response received from token balance check");
      }
      console.log("Balance check response:", result.value.value);
      return BigInt(result.value.value);
    } catch (error) {
      console.error("Error getting token balance:", error);
      return BigInt(0);
    }
  }
}
