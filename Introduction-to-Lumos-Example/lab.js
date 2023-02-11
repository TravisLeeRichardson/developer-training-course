"use strict";

//const { FileSystemModule } = require("bufferutility");
import { FileSystemModule } from "bufferutility";

//const {describeTransaction: libDescribeTransaction} = import("../lib/index.js");
import {describeTransaction as libDescribeTransaction} from "../lib/index.js";
//import {describeTransaction} from "../lib/index.js";
//const {addDefaultCellDeps, addDefaultWitnessPlaceholders, getLiveCell, sendTransaction, signTransaction, waitForTransactionConfirmation} = await import ("../lib/index.js");



export function  describeTransaction(transaction)
{
	const options =
	{
		showCellDeps: false,
		showWitnesses: false,
		showInputType: false,
		showOutputType: false,
	};

	return libDescribeTransaction(transaction, options);
}

export async function initializeLab(NODE_URL, indexer)
{
	// Nothing to do in this lab.
}

export async function validateLab(transaction)
{
	// Nothing to do in this lab.
}



