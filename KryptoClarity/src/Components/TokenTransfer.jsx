import React, { useState, useEffect } from "react";
import {
  standardPrincipalCV,
  uintCV,
  someCV,
  noneCV,
  bufferCVFromString,
  getAddressFromPrivateKey,
  makeContractCall,
  validateStacksAddress,
  broadcastTransaction,
} from "@stacks/transactions";
import { STACKS_TESTNET, STACKS_MAINNET } from "@stacks/network";

const TokenTransfer = () => {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [txId, setTxId] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [recipientError, setRecipientError] = useState("");

  const SENDER_KEY =
    "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01";
  const CONTRACT_ADDRESS = "SP1X8ZTAN1JBX148PNJY4D1BPZ1QKCKV3H2SAZ7CN";
  const CONTRACT_NAME = "Krypto";

  const network = STACKS_MAINNET;

  useEffect(() => {
    try {
      const address = getAddressFromPrivateKey(SENDER_KEY, network.version);
      setSenderAddress(address);
      console.log("Sender's address:", address);
    } catch (err) {
      console.error("Error getting sender address:", err);
      setError("Error initializing sender address");
    }
  }, []);

  const validateRecipientAddress = (address) => {
    try {
      if (!address) {
        setRecipientError("Recipient address is required");
        return false;
      }

      if (!address.startsWith("SP")) {
        setRecipientError("Invalid address format. Must start with 'ST'");
        return false;
      }

      const isValid = validateStacksAddress(address);
      if (!isValid) {
        setRecipientError("Invalid Stacks address format");
        return false;
      }

      setRecipientError("");
      return true;
    } catch (err) {
      setRecipientError("Invalid address format");
      return false;
    }
  };

  const handleRecipientChange = (e) => {
    const value = e.target.value;
    setRecipient(value);
    if (value) {
      validateRecipientAddress(value);
    } else {
      setRecipientError("");
    }
  };

  const validateAmount = (amount) => {
    const numAmount = Number(amount);
    return numAmount > 0 && Number.isInteger(numAmount);
  };

  const handleTransfer = async () => {
    try {
      setLoading(true);
      setError("");
      setTxId("");

      if (!validateRecipientAddress(recipient)) {
        throw new Error("Invalid recipient address");
      }

      if (!validateAmount(amount)) {
        throw new Error("Amount must be a positive integer");
      }

      if (!senderAddress) {
        throw new Error("Sender address not initialized");
      }

      const functionArgs = [
        uintCV(parseInt(amount)),
        standardPrincipalCV(senderAddress),
        standardPrincipalCV(recipient),
        memo ? someCV(bufferCVFromString(memo)) : noneCV(),
      ];

      const txOptions = {
        senderKey: SENDER_KEY,
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: "transfer",
        functionArgs,
        validateWithAbi: true,
        network,
        anchorMode: 3,
        postConditionMode: 1,
        fee: 2000n,
      };

      console.log("Creating contract call...");
      const transaction = await makeContractCall(txOptions);
      console.log("Transaction created:", transaction);

      console.log("Broadcasting transaction...");
      const broadcastResponse = await broadcastTransaction({
        transaction,
        network: STACKS_MAINNET,
      });
      console.log("Broadcast response:", broadcastResponse);

      if (broadcastResponse.error) {
        throw new Error(broadcastResponse.error);
      }

      setTxId(broadcastResponse.txid);

      // Clear form
      setAmount("");
      setRecipient("");
      setMemo("");
    } catch (err) {
      console.error("Transfer error:", err);
      setError(err.message || "Failed to transfer tokens");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-6 bg-gray-900 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-white text-center">
        Transfer Tokens
      </h2>

      {senderAddress && (
        <div className="mb-4 p-3 bg-gray-800 rounded">
          <p className="text-sm text-gray-300">
            Sending from:{" "}
            <span className="text-white break-all">{senderAddress}</span>
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-white mb-2">Recipient Address</label>
          <input
            type="text"
            value={recipient}
            onChange={handleRecipientChange}
            placeholder="Enter recipient address (starts with ST)"
            className={`w-full p-2 rounded bg-gray-800 text-white border ${
              recipientError ? "border-red-500" : "border-gray-700"
            }`}
            disabled={loading}
          />
          {recipientError && (
            <p className="text-red-500 text-sm mt-1">{recipientError}</p>
          )}
        </div>

        <div>
          <label className="block text-white mb-2">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount (positive integer)"
            className="w-full p-2 rounded bg-gray-800 text-white border border-gray-700"
            disabled={loading}
            min="1"
            step="1"
          />
        </div>

        <div>
          <label className="block text-white mb-2">Memo (Optional)</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Enter memo (optional)"
            className="w-full p-2 rounded bg-gray-800 text-white border border-gray-700"
            disabled={loading}
          />
        </div>

        <button
          onClick={handleTransfer}
          disabled={loading || !!recipientError}
          className={`w-full py-2 px-4 rounded ${
            loading || !!recipientError
              ? "bg-blue-800 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          } text-white transition duration-200`}
        >
          {loading ? "Processing..." : "Transfer Tokens"}
        </button>

        {error && (
          <div className="text-red-500 text-sm mt-2 p-3 bg-red-900/20 rounded">
            {error}
          </div>
        )}

        {txId && (
          <div className="mt-4 p-4 bg-gray-800 rounded">
            <h3 className="text-white font-semibold mb-2">
              Transaction Successful!
            </h3>
            <p className="text-sm text-gray-300 break-all">
              Transaction ID: {txId}
            </p>
            <a
              href={`https://explorer.stacks.co/txid/${txId}?chain=testnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
            >
              View in Explorer
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenTransfer;
