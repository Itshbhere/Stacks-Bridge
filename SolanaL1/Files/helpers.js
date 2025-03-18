"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPublicKeysFromFile = loadPublicKeysFromFile;
exports.saveDemoDataToFile = saveDemoDataToFile;
exports.savePublicKeyToFile = savePublicKeyToFile;
exports.loadKeypairFromFile = loadKeypairFromFile;
exports.saveKeypairToFile = saveKeypairToFile;
exports.loadOrGenerateKeypair = loadOrGenerateKeypair;
exports.explorerURL = explorerURL;
exports.airdropOnLowBalance = airdropOnLowBalance;
exports.extractSignatureFromFailedTransaction = extractSignatureFromFailedTransaction;
exports.numberFormatter = numberFormatter;
exports.printConsoleSeparator = printConsoleSeparator;
exports.buildTransaction = buildTransaction;
var fs_1 = require("fs");
var path_1 = require("path");
var web3_js_1 = require("@solana/web3.js");
// define some default locations
var DEFAULT_KEY_DIR_NAME = ".local_keys";
var DEFAULT_PUBLIC_KEY_FILE = "keys.json";
var DEFAULT_DEMO_DATA_FILE = "demo.json";
/**
 * Load locally stored PublicKey addresses
 */
function loadPublicKeysFromFile(absPath) {
    var _a;
    if (absPath === void 0) { absPath = "".concat(DEFAULT_KEY_DIR_NAME, "/").concat(DEFAULT_PUBLIC_KEY_FILE); }
    try {
        if (!absPath)
            throw Error("No path provided");
        if (!fs_1.default.existsSync(absPath))
            throw Error("File does not exist.");
        // load the public keys from the file
        var data = JSON.parse(fs_1.default.readFileSync(absPath, { encoding: "utf-8" })) || {};
        // convert all loaded keyed values into valid public keys
        for (var _i = 0, _b = Object.entries(data); _i < _b.length; _i++) {
            var _c = _b[_i], key = _c[0], value = _c[1];
            data[key] = (_a = new web3_js_1.PublicKey(value)) !== null && _a !== void 0 ? _a : "";
        }
        return data;
    }
    catch (err) {
        // console.warn("Unable to load local file");
    }
    // always return an object
    return {};
}
/*
  Locally save a demo data to the filesystem for later retrieval
*/
function saveDemoDataToFile(name, newData, absPath) {
    var _a;
    if (absPath === void 0) { absPath = "".concat(DEFAULT_KEY_DIR_NAME, "/").concat(DEFAULT_DEMO_DATA_FILE); }
    try {
        var data = {};
        // fetch all the current values, when the storage file exists
        if (fs_1.default.existsSync(absPath))
            data = JSON.parse(fs_1.default.readFileSync(absPath, { encoding: "utf-8" })) || {};
        data = __assign(__assign({}, data), (_a = {}, _a[name] = newData, _a));
        // actually save the data to the file
        fs_1.default.writeFileSync(absPath, JSON.stringify(data), {
            encoding: "utf-8",
        });
        return data;
    }
    catch (err) {
        console.warn("Unable to save to file");
        // console.warn(err);
    }
    // always return an object
    return {};
}
/*
  Locally save a PublicKey addresses to the filesystem for later retrieval
*/
function savePublicKeyToFile(name, publicKey, absPath) {
    var _a;
    if (absPath === void 0) { absPath = "".concat(DEFAULT_KEY_DIR_NAME, "/").concat(DEFAULT_PUBLIC_KEY_FILE); }
    try {
        // if (!absPath) throw Error("No path provided");
        // if (!fs.existsSync(absPath)) throw Error("File does not exist.");
        // fetch all the current values
        var data = loadPublicKeysFromFile(absPath);
        // convert all loaded keyed values from PublicKeys to strings
        for (var _i = 0, _b = Object.entries(data); _i < _b.length; _i++) {
            var _c = _b[_i], key = _c[0], value = _c[1];
            data[key] = value.toBase58();
        }
        data = __assign(__assign({}, data), (_a = {}, _a[name] = publicKey.toBase58(), _a));
        // actually save the data to the file
        fs_1.default.writeFileSync(absPath, JSON.stringify(data), {
            encoding: "utf-8",
        });
        // reload the keys for sanity
        data = loadPublicKeysFromFile(absPath);
        return data;
    }
    catch (err) {
        console.warn("Unable to save to file");
    }
    // always return an object
    return {};
}
/*
  Load a locally stored JSON keypair file and convert it to a valid Keypair
*/
function loadKeypairFromFile(absPath) {
    try {
        if (!absPath)
            throw Error("No path provided");
        if (!fs_1.default.existsSync(absPath))
            throw Error("File does not exist.");
        // load the keypair from the file
        var keyfileBytes = JSON.parse(fs_1.default.readFileSync(absPath, { encoding: "utf-8" }));
        // parse the loaded secretKey into a valid keypair
        var keypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(keyfileBytes));
        return keypair;
    }
    catch (err) {
        // return false;
        throw err;
    }
}
/*
  Save a locally stored JSON keypair file for later importing
*/
function saveKeypairToFile(keypair, fileName, dirName) {
    if (dirName === void 0) { dirName = DEFAULT_KEY_DIR_NAME; }
    fileName = path_1.default.join(dirName, "".concat(fileName, ".json"));
    // create the `dirName` directory, if it does not exists
    if (!fs_1.default.existsSync("./".concat(dirName, "/")))
        fs_1.default.mkdirSync("./".concat(dirName, "/"));
    // remove the current file, if it already exists
    if (fs_1.default.existsSync(fileName))
        fs_1.default.unlinkSync(fileName);
    // write the `secretKey` value as a string
    fs_1.default.writeFileSync(fileName, "[".concat(keypair.secretKey.toString(), "]"), {
        encoding: "utf-8",
    });
    return fileName;
}
/*
  Attempt to load a keypair from the filesystem, or generate and save a new one
*/
function loadOrGenerateKeypair(fileName, dirName) {
    if (dirName === void 0) { dirName = DEFAULT_KEY_DIR_NAME; }
    try {
        // compute the path to locate the file
        var searchPath = path_1.default.join(dirName, "".concat(fileName, ".json"));
        var keypair = web3_js_1.Keypair.generate();
        // attempt to load the keypair from the file
        if (fs_1.default.existsSync(searchPath))
            keypair = loadKeypairFromFile(searchPath);
        // when unable to locate the keypair, save the new one
        else
            saveKeypairToFile(keypair, fileName, dirName);
        return keypair;
    }
    catch (err) {
        console.error("loadOrGenerateKeypair:", err);
        throw err;
    }
}
/*
  Compute the Solana explorer address for the various data
*/
function explorerURL(_a) {
    var address = _a.address, txSignature = _a.txSignature, cluster = _a.cluster;
    var baseUrl;
    //
    if (address)
        baseUrl = "https://explorer.solana.com/address/".concat(address);
    else if (txSignature)
        baseUrl = "https://explorer.solana.com/tx/".concat(txSignature);
    else
        return "[unknown]";
    // auto append the desired search params
    var url = new URL(baseUrl);
    url.searchParams.append("cluster", cluster || "devnet");
    return url.toString() + "\n";
}
/**
 * Auto airdrop the given wallet of of a balance of < 0.5 SOL
 */
function airdropOnLowBalance(connection_1, keypair_1) {
    return __awaiter(this, arguments, void 0, function (connection, keypair, forceAirdrop) {
        var balance, MIN_BALANCE_TO_AIRDROP;
        if (forceAirdrop === void 0) { forceAirdrop = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, connection.getBalance(keypair.publicKey)];
                case 1:
                    balance = _a.sent();
                    MIN_BALANCE_TO_AIRDROP = web3_js_1.LAMPORTS_PER_SOL / 2;
                    if (!(forceAirdrop === true || balance < MIN_BALANCE_TO_AIRDROP)) return [3 /*break*/, 3];
                    console.log("Requesting airdrop of 1 SOL to ".concat(keypair.publicKey.toBase58(), "..."));
                    return [4 /*yield*/, connection
                            .requestAirdrop(keypair.publicKey, web3_js_1.LAMPORTS_PER_SOL)
                            .then(function (sig) {
                            console.log("Tx signature:", sig);
                            // balance = balance + LAMPORTS_PER_SOL;
                        })];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: 
                // else console.log("Balance of:", balance / LAMPORTS_PER_SOL, "SOL");
                return [2 /*return*/, balance];
            }
        });
    });
}
/*
  Helper function to extract a transaction signature from a failed transaction's error message
*/
function extractSignatureFromFailedTransaction(connection, err, fetchLogs) {
    return __awaiter(this, void 0, void 0, function () {
        var failedSig;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (err === null || err === void 0 ? void 0 : err.signature)
                        return [2 /*return*/, err.signature];
                    failedSig = (_b = new RegExp(/^((.*)?Error: )?(Transaction|Signature) ([A-Z0-9]{32,}) /gim).exec((_a = err === null || err === void 0 ? void 0 : err.message) === null || _a === void 0 ? void 0 : _a.toString())) === null || _b === void 0 ? void 0 : _b[4];
                    if (!failedSig) return [3 /*break*/, 3];
                    if (!fetchLogs) return [3 /*break*/, 2];
                    return [4 /*yield*/, connection
                            .getTransaction(failedSig, {
                            maxSupportedTransactionVersion: 0,
                        })
                            .then(function (tx) {
                            var _a, _b;
                            console.log("\n==== Transaction logs for ".concat(failedSig, " ===="));
                            console.log(explorerURL({ txSignature: failedSig }), "");
                            console.log((_b = (_a = tx === null || tx === void 0 ? void 0 : tx.meta) === null || _a === void 0 ? void 0 : _a.logMessages) !== null && _b !== void 0 ? _b : "No log messages provided by RPC");
                            console.log("==== END LOGS ====\n");
                        })];
                case 1:
                    _c.sent();
                    return [3 /*break*/, 3];
                case 2:
                    console.log("\n========================================");
                    console.log(explorerURL({ txSignature: failedSig }));
                    console.log("========================================\n");
                    _c.label = 3;
                case 3: 
                // always return the failed signature value
                return [2 /*return*/, failedSig];
            }
        });
    });
}
/*
  Standard number formatter
*/
function numberFormatter(num, forceDecimals) {
    if (forceDecimals === void 0) { forceDecimals = false; }
    // set the significant figures
    var minimumFractionDigits = num < 1 || forceDecimals ? 10 : 2;
    // do the formatting
    return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: minimumFractionDigits,
    }).format(num);
}
/*
  Display a separator in the console, with our without a message
*/
function printConsoleSeparator(message) {
    console.log("\n===============================================");
    console.log("===============================================\n");
    if (message)
        console.log(message);
}
/**
 * Helper function to build a signed transaction
 */
function buildTransaction(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var blockhash, messageV0, tx;
        var connection = _b.connection, payer = _b.payer, signers = _b.signers, instructions = _b.instructions;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, connection
                        .getLatestBlockhash()
                        .then(function (res) { return res.blockhash; })];
                case 1:
                    blockhash = _c.sent();
                    messageV0 = new web3_js_1.TransactionMessage({
                        payerKey: payer,
                        recentBlockhash: blockhash,
                        instructions: instructions,
                    }).compileToV0Message();
                    tx = new web3_js_1.VersionedTransaction(messageV0);
                    signers.forEach(function (s) { return tx.sign([s]); });
                    return [2 /*return*/, tx];
            }
        });
    });
}
