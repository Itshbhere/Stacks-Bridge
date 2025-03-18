"use strict";
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATIC_PUBLICKEY =
  exports.connection =
  exports.CLUSTER_URL =
  exports.testWallet =
  exports.payer =
    void 0;
/**
 *
 */
var dotenv_1 = require("dotenv");
var web3_js_1 = require("@solana/web3.js");
var helpers_1 = require("./helpers");
var js_1 = require("@metaplex-foundation/js");
// load the env variables from file
dotenv_1.default.config();
/**
 * Load the `payer` keypair from the local file system, or load/generate a new
 * one and storing it within the local directory
 */
exports.payer = (
  (_a = process.env) === null || _a === void 0
    ? void 0
    : _a.LOCAL_PAYER_JSON_ABSPATH
)
  ? (0, helpers_1.loadKeypairFromFile)(
      (_b = process.env) === null || _b === void 0
        ? void 0
        : _b.LOCAL_PAYER_JSON_ABSPATH
    )
  : (0, helpers_1.loadOrGenerateKeypair)("payer");
// generate a new Keypair for testing, named `wallet`
exports.testWallet = (0, helpers_1.loadOrGenerateKeypair)("testWallet");
// load the env variables and store the cluster RPC url
exports.CLUSTER_URL =
  (_c = process.env.RPC_URL) !== null && _c !== void 0
    ? _c
    : (0, web3_js_1.clusterApiUrl)("devnet");
// create a new rpc connection
exports.connection = new web3_js_1.Connection(exports.CLUSTER_URL, "single");
// define an address to also transfer lamports too
exports.STATIC_PUBLICKEY = new js_1.PublicKey(
  "hb691dAk4hKpHVPZenpzqVtw2F8RHnCq27QcfiReXD"
);
