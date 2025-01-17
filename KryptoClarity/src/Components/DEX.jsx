import React, { useState, useCallback, useEffect } from "react";
import { DualTokenTransfer } from "../Scripts/SIPtoSOL";
import { STXtoSOL } from "../Scripts/STXtoSOL";
import { Keypair } from "@solana/web3.js";
import { Settings, ArrowDownUp } from "lucide-react";
import axios from "axios";
import config from "./config.json";

const TokenSwapInterface = () => {
  const [inputAmount, setInputAmount] = useState("");
  const [outputAmount, setOutputAmount] = useState("");
  const [isReversed, setIsReversed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dualTransfer, setDualTransfer] = useState(null);
  const [stxTransfer, setStxTransfer] = useState(null);
  const [isNativeSTX, setIsNativeSTX] = useState(false);
  const [solToStxRate, setSolToStxRate] = useState(2); // Default rate

  // Base rate for SIP only
  const SOL_TO_SIP = 172;

  const getPrice = async (pair) => {
    const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
    try {
      const response = await axios.get(url);
      const data = response.data;

      if (data.error && data.error.length > 0) {
        throw new Error(data.error.join(", "));
      }

      return parseFloat(data.result[pair].c[0]);
    } catch (error) {
      console.error(`Error fetching price for ${pair}: ${error.message}`);
      return null;
    }
  };

  const updateExchangeRate = async () => {
    try {
      const solUsdPair = "SOLUSD";
      const stxUsdPair = "STXUSD";

      const solPrice = await getPrice(solUsdPair);
      const stxPrice = await getPrice(stxUsdPair);

      if (solPrice && stxPrice) {
        const newRate = solPrice / stxPrice;
        setSolToStxRate(newRate);

        // Recalculate output amount with new rate if there's an input amount
        if (inputAmount) {
          const newOutput = calculateSwap(inputAmount, !isReversed, newRate);
          setOutputAmount(newOutput);
        }
      }
    } catch (err) {
      console.error("Failed to update exchange rate:", err);
    }
  };

  useEffect(() => {
    // Initial rate update
    updateExchangeRate();

    // Update rate every 60 seconds
    const interval = setInterval(updateExchangeRate, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    initializeTransfers();
  }, []);

  const initializeTransfers = async () => {
    try {
      const solanaKeypair = Keypair.fromSecretKey(
        new Uint8Array(config.solanaKeypair.secretKey)
      );

      const stacksSenderKey =
        "f7984d5da5f2898dc001631453724f7fd44edaabdaa926d7df29e6ae3566492c01";

      const sipTransfer = new DualTokenTransfer(solanaKeypair, stacksSenderKey);
      setDualTransfer(sipTransfer);

      const stxTransfer = new STXtoSOL(solanaKeypair, stacksSenderKey);
      setStxTransfer(stxTransfer);
    } catch (err) {
      setError("Failed to initialize wallet connections");
      console.error("Initialization error:", err);
    }
  };

  const calculateSwap = useCallback(
    (amount, isSolToToken, currentRate = solToStxRate) => {
      if (!amount) return "";
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount)) return "";

      const rate = isNativeSTX ? currentRate : SOL_TO_SIP;
      return isSolToToken
        ? (numAmount * rate).toFixed(4)
        : (numAmount / rate).toFixed(4);
    },
    [isNativeSTX, solToStxRate]
  );

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

  const toggleTokenType = () => {
    setIsNativeSTX(!isNativeSTX);
    setInputAmount("");
    setOutputAmount("");
    setError("");
    setSuccess("");
  };

  const handleSwap = async () => {
    const transfer = isNativeSTX ? stxTransfer : dualTransfer;

    if (!transfer) {
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

      let result;
      if (isNativeSTX) {
        result = await transfer.executeTransfers(
          parseFloat(isReversed ? inputAmount : outputAmount),
          parseFloat(isReversed ? outputAmount : inputAmount)
        );
      } else {
        result = await transfer.executeTransfers(
          parseFloat(isReversed ? inputAmount : outputAmount),
          parseFloat(isReversed ? outputAmount : inputAmount)
        );
      }

      setSuccess(
        `Swap successful! ${
          isNativeSTX ? "STX" : "Stacks"
        } TX: ${result.stacksTransactionId.slice(0, 8)}... 
         Solana TX: ${result.solanaTransactionId.slice(0, 8)}...`
      );
    } catch (err) {
      setError(err.message || "Swap failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const getTokenName = (isInput) => {
    if (isNativeSTX) {
      return isReversed ? (isInput ? "STX" : "SOL") : isInput ? "SOL" : "STX";
    }
    return isReversed
      ? isInput
        ? "SIP010"
        : "SOL"
      : isInput
      ? "SOL"
      : "SIP010";
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-lg border border-gray-700">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold">Swap</h2>
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleTokenType}
              className={`px-3 py-1 rounded-lg transition-colors ${
                isNativeSTX ? "bg-blue-600" : "bg-gray-600"
              }`}
            >
              {isNativeSTX ? "Native STX" : "SIP010"}
            </button>
            <button className="text-gray-400 hover:text-white">
              <Settings className="w-5 h-5" />
            </button>
          </div>
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
                {getTokenName(true)}
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
                {getTokenName(false)}
              </button>
            </div>
          </div>

          {/* Rate Info */}
          <div className="bg-gray-700 p-4 rounded-lg mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Rate</span>
              <span>
                1 {getTokenName(true)} ={" "}
                {isReversed
                  ? (1 / (isNativeSTX ? solToStxRate : SOL_TO_SIP)).toFixed(4)
                  : isNativeSTX
                  ? solToStxRate.toFixed(4)
                  : SOL_TO_SIP}{" "}
                {getTokenName(false)}
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
