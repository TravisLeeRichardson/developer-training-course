"use strict";
/* taken from lumos v19 example code:
import { bytes } from '@ckb-lumos/codec';
import {
  Indexer,
  helpers,
  Address,
  Script,
  RPC,
  hd,
  config,
  Cell,
  commons,
  WitnessArgs,
  BI,
} from "@ckb-lumos/lumos";
import { values , blockchain} from "@ckb-lumos/base"; */

//import { Script, Indexer, helpers, config } from "@ckb-lumos/lumos"
//const { Script, Indexer, helpers, config } = await import ("@ckb-lumos/lumos");
const { Script, Indexer, helpers } = await import ("@ckb-lumos/lumos");


//const {initializeConfig} = import("@ckb-lumos/config-manager");
import { initializeConfig } from "@ckb-lumos/config-manager"; //Example A: Static import with JSON import assertion
//const { initializeConfig } = await import("@ckb-lumos/config-manager",  {assert: { type: "json" }, 
//});//an alternative way to do it...Example B: Dynamic import with JSON import assertion

//const config = require ("../config.json");
import config from "../config.json" assert { type: "json" }; 

//const {addressToScript, TransactionSkeleton} = import("@ckb-lumos/helpers");
import {addressToScript, TransactionSkeleton} from "@ckb-lumos/helpers";

//const {Indexer} = import("@ckb-lumos/ckb-indexer");
//import {Indexer} from "@ckb-lumos/ckb-indexer";

//const {addDefaultCellDeps, addDefaultWitnessPlaceholders, getLiveCell, sendTransaction, signTransaction, waitForTransactionConfirmation} = import("../lib/index.js");
//const {addDefaultCellDeps} = await import("../lib/index.js");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, getLiveCell, sendTransaction, signTransaction, waitForTransactionConfirmation} = await import ("../lib/index.js");
//const {addDefaultCellDeps} = await import ("../lib/index.js");

//const {hexToInt, intToHex} = import("../lib/util.js");
const {hexToInt, intToHex} = await import ("../lib/util.js"); 

//const {describeTransaction} = import("./lab.js");
const {describeTransaction} = await import ("./lab.js"); 



const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8116/";
//const NODE_URL = "https://testnet.ckb.dev/rpc";
//const INDEXER_URL = "https://testnet.ckb.dev/indexer"; 

const PRIVATE_KEY = "0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc";
const ADDRESS = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga";
const PREVIOUS_OUTPUT =
{
	tx_hash: "0x13023ee10f099df86239f6c5ca31677ff31b484ad0b00f59ee3986581aec674a",
	index: "0x0"
};
const TX_FEE = 100_000n;

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(config);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);
	console.log("transaction.cellDeps.outPoint is----------__*(O#(#(#(#(#(");
	console.log (transaction.cellDeps.outPoint);

	// Add the input cell to the transaction.
	const input = await getLiveCell(NODE_URL, PREVIOUS_OUTPUT);
	transaction = transaction.update("inputs", (i)=>i.push(input));

	// Add an output cell.
	const outputCapacity = intToHex(hexToInt(input.cellOutput.capacity) - TX_FEE);
	//const output = {cell_output: {capacity: outputCapacity, lock: addressToScript(ADDRESS), type: null}, data: "0x"};
	const output = {cellOutput: {capacity: outputCapacity, lock: addressToScript(ADDRESS), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS()); 

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY);
    console.log("signed TX is:");
    console.log(signedTx);
	console.log("signedTx.cellDeps is: ----------");
	console.log (signedTx.cellDeps);
	console.log("signedTx.cellDeps.outPoint: ----------");
	console.log (signedTx.cellDeps.outPoint);//undefined
	console.log("signedTx.cellDeps.outPoint[0]: ----------");
	console.log (signedTx.cellDeps[0].outPoint);
	console.log("celldeps.inputs is: ----------");
	console.log (signedTx.inputs); //this is good.
	console.log("signedTx.inputs.previousOutput is: ----------");
	console.log(signedTx.inputs.previousOutput); //undefined
	console.log("signedTx.inputs.PREVIOUS_OUTPUT: ----------");
	console.log (signedTx.inputs.PREVIOUS_OUTPUT); //undefined
	console.log("signedTx.outputsData is:----------");
	console.log (signedTx.outputsData);
signedTx.inputs;
	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	console.log("Example completed successfully!");
}
main();

