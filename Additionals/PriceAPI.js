import axios from "axios";

const from = "BNB";
const to = "STX";
const amount = 2;

async function convertCoin() {
  try {
    const url = `https://dev-api-wallet.stonezone.gg/coin/convert/${from}/${to}/${amount}`;
    const response = await axios.get(url, {
      headers: {
        Accept: "*/*",
      },
    });

    console.log("Conversion Result:", response.data);
  } catch (error) {
    console.error(
      "Error during conversion:",
      error.response?.data || error.message
    );
  }
}

convertCoin();
