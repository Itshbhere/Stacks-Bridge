import { ethers } from "ethers";
import { ABI } from "./ABI.js";

export class TokenBridgeContract {
  constructor(bridgeContractAddress, privateKey, rpcUrl) {
    this.bridgeContractAddress = bridgeContractAddress;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.bridgeContract = null;

    // ABI for the TokenBridge contract
    this.ABI = ABI;
  }

  async initializeBridgeContract() {
    try {
      if (!this.bridgeContract) {
        this.bridgeContract = new ethers.Contract(
          this.bridgeContractAddress,
          this.ABI,
          this.wallet
        );
      }
    } catch (error) {
      console.error("Failed to initialize bridge contract:", error);
      throw error;
    }
  }

  async getWalletAddress() {
    return this.wallet.address;
  }

  async getContractOwner() {
    try {
      await this.initializeBridgeContract();
      const owner = await this.bridgeContract.contractOwner();
      console.log(`Contract owner is: ${owner}`);
      return owner;
    } catch (error) {
      console.error("Failed to get contract owner:", error);
      throw error;
    }
  }

  async transferOwnership(newOwner) {
    try {
      await this.initializeBridgeContract();
      const tx = await this.bridgeContract.transferOwnership(newOwner);
      await tx.wait();
      console.log(
        `Ownership transferred to ${newOwner}. Transaction: ${tx.hash}`
      );
      return tx.hash;
    } catch (error) {
      console.error("Transferring ownership failed:", error);
      throw error;
    }
  }

  async depositEth(amount) {
    try {
      await this.initializeBridgeContract();
      const tx = await this.bridgeContract.depositEth({
        value: amount,
      });
      await tx.wait();
      console.log(`ETH deposited successfully. Transaction: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      console.error("Depositing ETH failed:", error);
      throw error;
    }
  }

  async lockEther(amount, recipient) {
    try {
      await this.initializeBridgeContract();
      const tx = await this.bridgeContract.lockEther(amount, recipient);
      await tx.wait();
      console.log(`Ether locked successfully. Transaction: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      console.error("Locking ether failed:", error);
      throw error;
    }
  }

  async getContractBalance() {
    try {
      await this.initializeBridgeContract();
      const balance = await this.bridgeContract.getContractBalance();
      console.log(`Contract balance: ${ethers.formatEther(balance)} ETH`);
      return balance;
    } catch (error) {
      console.error("Getting contract balance failed:", error);
      throw error;
    }
  }

  async getLockedEthBalance(userAddress) {
    try {
      await this.initializeBridgeContract();
      const balance = await this.bridgeContract.lockedEth(userAddress);
      console.log(
        `Locked ETH balance for ${userAddress}: ${ethers.formatEther(
          balance
        )} ETH`
      );
      return balance;
    } catch (error) {
      console.error("Getting locked ETH balance failed:", error);
      throw error;
    }
  }

  async getEtherBalance(address) {
    try {
      // If address is not provided, use the wallet's address
      if (!address) {
        address = await this.getWalletAddress();
      }

      const balance = await this.provider.getBalance(address);
      console.log(
        `ETH balance for ${address}: ${ethers.formatEther(balance)} ETH`
      );
      return balance;
    } catch (error) {
      console.error("Getting ETH balance failed:", error);
      throw error;
    }
  }
}
