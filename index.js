import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SolanaTracker } from "solana-swap";
import { performSwap, SOL_ADDR } from "./lib.js";
import base58 from "bs58";
import fs from 'fs';

// Load configuration from config.json
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const { RPC_URL, PRIVATE_KEYS, TOKEN_ADDR, MIN_SOL_BUY_AMOUNT, MAX_SOL_BUY_AMOUNT, FEES, SLIPPAGE, BUY_PERCENTAGES, SELL_PERCENTAGES } = config;

const connection = new Connection(RPC_URL);

async function swap(tokenIn, tokenOut, solanaTracker, keypair, amount) {
    try {
        const swapResponse = await solanaTracker.getSwapInstructions(
            tokenIn, tokenOut, amount, SLIPPAGE, keypair.publicKey.toBase58(), FEES, false
        );
        console.log("Send swap transaction...");
        const tx = await performSwap(swapResponse, keypair, connection, amount, tokenIn, {
            sendOptions: { skipPreflight: true },
            confirmationRetries: 30,
            confirmationRetryTimeout: 1000,
            lastValidBlockHeightBuffer: 150,
            resendInterval: 1000,
            confirmationCheckInterval: 1000,
            skipConfirmationCheck: true
        });
        console.log("Swap sent: " + tx);
    } catch (e) {
        console.error("Error when trying to swap", e);
    }
}

async function getTokenBalance(connection, owner, tokenAddr) {
    try {
        const result = await connection.getTokenAccountsByOwner(owner, { mint: new PublicKey(tokenAddr) });
        const info = await connection.getTokenAccountBalance(result.value[0].pubkey);
        if (info.value.uiAmount == null) throw new Error('No balance found');
        return info.value.uiAmount;
    } catch {
        return 0;
    }
}

async function main() {
    const solanaTracker = new SolanaTracker(connection);
    
    while (true) {
        for (let i = 0; i < PRIVATE_KEYS.length; i++) {
            const keypair = Keypair.fromSecretKey(base58.decode(PRIVATE_KEYS[i]));
            const solBuyAmount = Math.random() * (MAX_SOL_BUY_AMOUNT - MIN_SOL_BUY_AMOUNT) + MIN_SOL_BUY_AMOUNT;
            const buyAmount = solBuyAmount * (BUY_PERCENTAGES[i] / 100);
            const sellPercentage = SELL_PERCENTAGES[i] / 100;

            // Execute buys
            for (let j = 0; j < 4; j++) {
                await swap(SOL_ADDR, TOKEN_ADDR, solanaTracker, keypair, buyAmount);
            }

            // Get token balance and execute sell
            const balance = Math.round(await getTokenBalance(connection, keypair.publicKey, TOKEN_ADDR));
            const sellAmount = balance * sellPercentage;
            await swap(TOKEN_ADDR, SOL_ADDR, solanaTracker, keypair, sellAmount);

            // Pause between each key's operations
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

main().catch(console.error);
