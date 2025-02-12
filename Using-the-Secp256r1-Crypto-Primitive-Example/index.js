"use strict";

const secp256r1 = require("secp256r1");
const {utils} = require("@ckb-lumos/base");
const {ckbHash} = utils;
const {secp256k1Blake160} = require("@ckb-lumos/common-scripts");
const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, sealTransaction, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {Reader} = require("ckb-js-toolkit");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, getLiveCell, indexerReady, readFileToHexString, readFileToHexStringSync, sendTransaction, waitForTransactionConfirmation} = require("../lib/index.js");
const {arrayBufferToHex, ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8116/";

// This is the private key and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";
const secp256r1PublicKey1 = arrayBufferToHex(new Uint8Array(secp256r1.publicKeyCreate(Buffer.from(hexToArrayBuffer(PRIVATE_KEY_1)))).buffer);
const secp256r1LockArg1 = ckbHash(hexToArrayBuffer(secp256r1PublicKey1)).serializeJson().substr(0, 42);

// This is the always success RISC-V binary.
const DATA_FILE_1 = "../files/secp256r1";
const DATA_FILE_HASH_1 = ckbHash(hexToArrayBuffer(readFileToHexStringSync(DATA_FILE_1).hexString)).serializeJson(); // Blake2b hash of the always success binary.

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 200_000n;

function prepareSigningEntries(transaction, config)
{
	let processedArgs = Set();
	const tx = createTransactionFromSkeleton(transaction);
	const txHash = ckbHash(core.SerializeRawTransaction(normalizers.NormalizeRawTransaction(tx))).serializeJson();
	const inputs = transaction.get("inputs");
	const witnesses = transaction.get("witnesses");
	let signingEntries = transaction.get("signingEntries");

	for (let i = 0; i < inputs.size; i++)
	{
		const input = inputs.get(i);
		if (
		template.CODE_HASH === input.cell_output.lock.code_hash &&
		template.HASH_TYPE === input.cell_output.lock.hash_type &&
		!processedArgs.has(input.cell_output.lock.args)
		) {
		processedArgs = processedArgs.add(input.cell_output.lock.args);
		const lockValue = new values.ScriptValue(input.cell_output.lock, {
			validate: false,
		});
		const hasher = new CKBHasher();
		hasher.update(txHash);
		if (i >= witnesses.size) {
			throw new Error(
			`The first witness in the script group starting at input index ${i} does not exist, maybe some other part has invalidly tampered the transaction?`
			);
		}
		hashWitness(hasher, witnesses.get(i)!);
		for (let j = i + 1; j < inputs.size && j < witnesses.size; j++) {
			const otherInput = inputs.get(j)!;
			if (
			lockValue.equals(
				new values.ScriptValue(otherInput.cell_output.lock, {
				validate: false,
				})
			)
			) {
			hashWitness(hasher, witnesses.get(j)!);
			}
		}
		for (let j = inputs.size; j < witnesses.size; j++) {
			hashWitness(hasher, witnesses.get(j)!);
		}
		const signingEntry = {
			type: "witness_args_lock",
			index: i,
			message: hasher.digestHex(),
		};
		signingEntries = signingEntries.push(signingEntry);
		}
	}
	transaction = transaction.set("signingEntries", signingEntries);
	return transaction;
  }

function signMessage(PRIVATE_KEY, message)
{
	const messageArray = Buffer.from(new Reader(message).toArrayBuffer());
	const pkArray = Buffer.from(new Reader(PRIVATE_KEY).toArrayBuffer());
	const {signature, recid} = secp256r1.sign(messageArray, pkArray);
	const array = new Uint8Array(65);
	array.set(signature, 0);
	array.set([recid], 64);

	return new Reader(array.buffer).serializeJson();
}

function signTransaction(transaction, PRIVATE_KEY)
{
	// Sign the transaction with our private key.
	transaction = secp256k1Blake160.prepareSigningEntries(transaction);
	const signingEntries = transaction.get("signingEntries").toArray();
	const signature = signMessage(PRIVATE_KEY, signingEntries[0].message);
	const tx = sealTransaction(transaction, [signature]);

	return tx;
}

async function deploySecp256r1Binary(indexer)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell with data from the specified file.
	const {hexString: hexString1, dataSize: dataSize1} = await readFileToHexString(DATA_FILE_1);
	const outputCapacity1 = ckbytesToShannons(61n) + ckbytesToShannons(dataSize1);
	const output1 = {cell_output: {capacity: intToHex(outputCapacity1), lock: addressToScript(ADDRESS_1), type: null}, data: hexString1};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add input capacity cells.
	const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), outputCapacity1 + ckbytesToShannons(61n) + TX_FEE);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	// Return the out point for the always success binary so it can be used in the next transaction.
	const outPoint =
	{
		tx_hash: txid,
		index: "0x0"
	};

	return outPoint;
}

async function createCellWithSecp256r1Lock(indexer, alwaysSuccessCodeOutPoint)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell using the always success lock.
	const outputCapacity1 = ckbytesToShannons(61n);
	const lockScript1 =
	{
		code_hash: DATA_FILE_HASH_1,
		hash_type: "data",
		args: secp256r1LockArg1
	}
	const output1 = {cell_output: {capacity: intToHex(outputCapacity1), lock: lockScript1, type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add input capacity cells.
	const capacityRequired = outputCapacity1 + ckbytesToShannons(61n) + TX_FEE;
	const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	// Return the out point for the cell locked with the always success lock so it can be used in the next transaction.
	const outPoint =
	{
		tx_hash: txid,
		index: "0x0"
	};

	return outPoint;
}

async function consumeCellWithSecp256r1Lock(indexer, alwaysSuccessCodeOutPoint, alwaysSuccessCellOutPoint)
{
	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);
	const cellDep = {dep_type: "code", out_point: alwaysSuccessCodeOutPoint};
	transaction = transaction.update("cellDeps", (cellDeps)=>cellDeps.push(cellDep));

	// Add the always success cell to the transaction.
	const input = await getLiveCell(NODE_URL, alwaysSuccessCellOutPoint);
	transaction = transaction.update("inputs", (i)=>i.push(input));

	// Add input capacity cells.
	const capacityRequired = ckbytesToShannons(61n) + TX_FEE;
	const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = {cell_output: {capacity: changeCapacity, lock: addressToScript(ADDRESS_1), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");
}

async function main()
{
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(config);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);
	await indexerReady(indexer);

	// Create a cell that contains the always_success binary.
	const alwaysSuccessCodeOutPoint = await deploySecp256r1Binary(indexer);
	await indexerReady(indexer);

	// Create a cell that uses the always success binary that was just deployed.
	const alwaysSuccessCellOutPoint = await createCellWithSecp256r1Lock(indexer, alwaysSuccessCodeOutPoint);
	await indexerReady(indexer);

	// Consume the cell locked with the always success lock.
	await consumeCellWithSecp256r1Lock(indexer, alwaysSuccessCodeOutPoint, alwaysSuccessCellOutPoint);
	await indexerReady(indexer);

	console.log("Example completed successfully!");
}
main();
