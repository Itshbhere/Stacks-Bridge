import React, { useState, useCallback, useEffect } from "react";
import { DualTokenTransfer } from "../Scripts/SIPtoSOL";
import { Keypair } from "@solana/web3.js";
import { Settings, ArrowDownUp } from "lucide-react";

const TokenSwapInterface = () => {
  const [inputAmount, setInputAmount] = useState("");
  const [outputAmount, setOutputAmount] = useState("");
  const [isReversed, setIsReversed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dualTransfer, setDualTransfer] = useState(null);

  // Base rates
  const SOL_TO_SIP = 169;

  useEffect(() => {
    initializeDualTransfer();
  }, []);

  const initializeDualTransfer = async () => {
    try {
      const secretKey = new Uint8Array([
        212, 23, 12, 221, 150, 160, 45, 194, 157, 232, 201, 89, 197, 25, 29, 50,
        40, 41, 241, 182, 153, 131, 106, 82, 139, 115, 7, 118, 79, 52, 2, 115,
        126, 111, 121, 138, 203, 35, 78, 194, 9, 131, 203, 115, 130, 101, 13,
        82, 182, 81, 103, 149, 89, 27, 128, 55, 139, 213, 194, 195, 245, 178,
        105, 254,
      ]);
      const solanaKeypair = Keypair.fromSecretKey(secretKey);
      const stacksSenderKey =
        "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01";

      const transfer = new DualTokenTransfer(solanaKeypair, stacksSenderKey);
      setDualTransfer(transfer);
    } catch (err) {
      setError("Failed to initialize wallet connections");
      console.error("Initialization error:", err);
    }
  };

  const calculateSwap = useCallback((amount, isSolToSip) => {
    if (!amount) return "";
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return "";

    return isSolToSip
      ? (numAmount * SOL_TO_SIP).toFixed(4)
      : (numAmount / SOL_TO_SIP).toFixed(4);
  }, []);

  const handleInputChange = (value) => {
    setInputAmount(value);
    setOutputAmount(calculateSwap(value, !isReversed));
    setError("");
    setSuccess("");
  };

  const handleSwitch = () => {
    setIsReversed(!isReversed);
    setInputAmount("");
    setOutputAmount("");
    setError("");
    setSuccess("");
  };

  const handleSwap = async () => {
    if (!dualTransfer) {
      setError("Transfer service not initialized");
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      setSuccess("");

      if (!inputAmount || parseFloat(inputAmount) <= 0) {
        throw new Error("Please enter a valid amount");
      }

      const result = await dualTransfer.executeTransfers(
        parseFloat(isReversed ? inputAmount : outputAmount),
        parseFloat(isReversed ? outputAmount : inputAmount)
      );

      setSuccess(
        `Swap successful! Stacks TX: ${result.stacksTransactionId.slice(
          0,
          8
        )}... 
         Solana TX: ${result.solanaTransactionId.slice(0, 8)}...`
      );
    } catch (err) {
      setError(err.message || "Swap failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-lg border border-gray-700">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold">Swap</h2>
          <button className="text-gray-400 hover:text-white">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-900/50 border border-red-600 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-4 bg-green-900/50 border border-green-600 rounded-lg text-green-200">
              {success}
            </div>
          )}

          {/* Input Token */}
          <div className="bg-gray-700 p-4 rounded-lg mb-2">
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">You pay</span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                placeholder="0.0"
                value={inputAmount}
                onChange={(e) => handleInputChange(e.target.value)}
                className="w-full text-2xl bg-transparent border-none focus:outline-none"
              />
              <button className="bg-gray-600 px-4 py-2 rounded-lg hover:bg-gray-500 transition-colors">
                {isReversed ? "SIP010" : "SOL"}
              </button>
            </div>
          </div>

          {/* Swap Direction Button */}
          <div className="relative flex justify-center my-4">
            <button
              className="absolute top-1/2 -translate-y-1/2 bg-gray-700 p-2 rounded-full hover:bg-gray-600 transition-colors"
              onClick={handleSwitch}
            >
              <ArrowDownUp className="w-4 h-4" />
            </button>
          </div>

          {/* Output Token */}
          <div className="bg-gray-700 p-4 rounded-lg mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">You receive</span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                placeholder="0.0"
                value={outputAmount}
                readOnly
                className="w-full text-2xl bg-transparent border-none focus:outline-none"
              />
              <button className="bg-gray-600 px-4 py-2 rounded-lg hover:bg-gray-500 transition-colors">
                {isReversed ? "SOL" : "SIP010"}
              </button>
            </div>
          </div>

          {/* Rate Info */}
          <div className="bg-gray-700 p-4 rounded-lg mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Rate</span>
              <span>
                1 {isReversed ? "SIP010" : "SOL"} ={" "}
                {isReversed ? (1 / SOL_TO_SIP).toFixed(4) : SOL_TO_SIP}{" "}
                {isReversed ? "SOL" : "SIP010"}
              </span>
            </div>
          </div>

          {/* Swap Button */}
          <button
            className={`w-full py-3 rounded-lg text-lg font-semibold transition-colors ${
              isLoading
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={handleSwap}
            disabled={isLoading || !inputAmount || inputAmount === "0"}
          >
            {isLoading ? "Swapping..." : "Swap"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TokenSwapInterface;
