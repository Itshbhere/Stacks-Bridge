import axios from "axios";

// Function to fetch the price for a given pair
async function getPrice(pair) {
  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
  try {
    const response = await axios.get(url);
    const data = response.data;

    if (data.error && data.error.length > 0) {
      throw new Error(data.error.join(", "));
    }

    // Extract the last trade price from the API response
    const price = parseFloat(data.result[pair].c[0]);
    return price;
  } catch (error) {
    console.error(`Error fetching price for ${pair}: ${error.message}`);
    return null;
  }
}

// Function to calculate the SOL to STX exchange rate
async function calculateSolToStxExchangeRate() {
  const solUsdPair = "SOLUSD";
  const stxUsdPair = "STXUSD";

  // Fetch prices for SOL/USD and STX/USD
  const solPrice = await getPrice(solUsdPair);
  const stxPrice = await getPrice(stxUsdPair);

  if (solPrice && stxPrice) {
    // Calculate the exchange rate for SOL to STX
    const solToStxRate = solPrice / stxPrice;
    console.log(`Exchange rate (SOL to STX): ${solToStxRate}`);
  } else {
    console.error("Failed to fetch prices for one or both pairs.");
  }
}

// Run the calculation
calculateSolToStxExchangeRate();
