"use strict";

const {utils} = require("@ckb-lumos/base");
const {ckbHash} = utils;
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, initializeLumosIndexer, sendTransaction, signTransaction, waitForTransactionConfirmation, MULTISIG_LOCK_HASH, indexerReady} = require("../lib/index.js");
const {ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const privateKey1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const address1 = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

// Multi-Sig configuration.
const multisigAddresses =
[
	"ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e",
	"ckt1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37",
	"ckt1qyqywrwdchjyqeysjegpzw38fvandtktdhrs0zaxl4"
];
const multisigReserved = 0;
const multisigMustMatch = 0;
const multisigThreshold = 2;
const multisigPublicKeys = multisigAddresses.length;

// This is the TX fee amount that will be paid in Shannons.
const txFee = 100_000n;

async function main()
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = await initializeLumosIndexer(nodeUrl);

	// Initialize our lab.
	await initializeLab(nodeUrl, indexer);
	await indexerReady(indexer);

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell that uses the multi-sig lock.
	const outputCapacity1 = intToHex(ckbytesToShannons(61n));
	const multisigScript = "0x"
		+ multisigReserved.toString(16).padStart(2, "0")
		+ multisigMustMatch.toString(16).padStart(2, "0")
		+ multisigThreshold.toString(16).padStart(2, "0")
		+ multisigPublicKeys.toString(16).padStart(2, "0")
		+ multisigAddresses.map((address)=>addressToScript(address).args.substr(2)).join("");
	const multisigScriptHash = ckbHash(hexToArrayBuffer(multisigScript)).serializeJson().substr(0, 42);
	const lockScript1 =
	{
		code_hash: MULTISIG_LOCK_HASH,
		hash_type: "type",
		args: multisigScriptHash
	};
	const output1 = {cell_output: {capacity: outputCapacity1, lock: lockScript1, type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add capacity to the transaction.
	const capacityRequired = hexToInt(outputCapacity1) + ckbytesToShannons(61n) + txFee; // output1 + minimum for a change cell + tx fee
	const {inputCells} = await collectCapacity(indexer, addressToScript(address1), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(inputCells));

	// Get the capacity sums of the inputs and outputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const outputCapacity2 = intToHex(inputCapacity - outputCapacity - txFee);
	const output2 = {cell_output: {capacity: outputCapacity2, lock: addressToScript(address1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output2));	

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");

	console.log("Lab completed successfully!");
}
main();
