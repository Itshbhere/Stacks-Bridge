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
  const contractPrincipal = contractPrincipalCV(
    contractAddress,
    BridgeContractName
  );

  // Convert memo to buffer and wrap in optional
  const memo = "Hello, World!";
  const memoBuffer = Buffer.from(memo, "utf8");
  const memoCV = someCV(bufferCV(memoBuffer));

  const functionArgs = [
    uintCV(BigInt(100000000)), // amount
    standardPrincipalCV(senderAddress), // sender
    contractPrincipal, // recipient
    memoCV, // memo
  ];

  console.log("Stacks Transfer Started", functionArgs);

  const txOptions = {
    contractAddress,
    contractName,
    functionName: "transfer",
    functionArgs,
    senderKey: stacksKey,
    validateWithAbi: true,
    network: STACKS_TESTNET,
    anchorMode: 3,
    postConditionMode: 1,
    fee: 2000n,
  };

  try {
    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction({
      transaction,
      network: STACKS_TESTNET,
    });

    console.log("Stacks Transfer Complete");
    console.log("Transaction ID:", broadcastResponse.txid);
    return broadcastResponse.txid;
  } catch (error) {
    console.error("Transaction failed:", error);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
