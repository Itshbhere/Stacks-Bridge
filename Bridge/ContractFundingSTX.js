import {
  standardPrincipalCV,
  uintCV,
  noneCV,
  contractPrincipalCV,
  getAddressFromPrivateKey,
  makeContractCall,
  broadcastTransaction,
  bufferCV,
  someCV,
  makeSTXTokenTransfer,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import fetch from "node-fetch";

async function main() {
  global.fetch = fetch;

  const stacksKey =
    "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01";
  const contractAddress = "ST1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H3CK5ACA";
  const contractName = "ADVT";
  const BridgeContractName = "StacksBridge";
  const senderAddress = getAddressFromPrivateKey(stacksKey, STACKS_TESTNET);

  // Use the contract address directly as a string
  const recipientAddress = `${contractAddress}.${BridgeContractName}`;

  const memo = "Hello, World!";
  const memoBuffer = Buffer.from(memo, "utf8");

  const amount = BigInt(100000000);
  console.log("\nInitiating STX Transfer");
  console.log("Amount:", amount, "microSTX");
  console.log("Recipient:", recipientAddress);

  async function getAccountNonce(address) {
    try {
      const response = await fetch(
        `https://api.testnet.hiro.so/extended/v1/address/${address}/nonces`
      );
      const data = await response.json();
      return data.possible_next_nonce;
    } catch (error) {
      console.error("Error fetching nonce:", error);
      throw new Error("Failed to fetch account nonce");
    }
  }

  const nonce = await getAccountNonce(senderAddress);
  console.log(`Using nonce: ${nonce}`);

  const txOptions = {
    recipient: recipientAddress, // Use the contract address as a string
    amount: amount,
    senderKey: stacksKey,
    network: STACKS_TESTNET,
    memo: memo, // Pass the memo as a string
    anchorMode: 3,
    nonce: nonce,
    fee: BigInt(2000),
  };

  console.log("Creating STX Transfer Transaction", txOptions);

  const transaction = await makeSTXTokenTransfer(txOptions);

  console.log("Broadcasting STX Transfer Transaction");
  const broadcastResponse = await broadcastTransaction({
    transaction,
    network: STACKS_TESTNET,
  });

  console.log("STX Transfer Complete");
  console.log("Transaction ID:", broadcastResponse.txid);

  return broadcastResponse.txid;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
