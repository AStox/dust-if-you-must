#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";

// Load environment variables
dotenv.config();

async function main() {
  console.log("🎮 Dust Game - Character Spawn Demo");
  console.log("====================================");

  try {
    // Initialize the bot
    const bot = new DustBot();

    // Display wallet info
    const walletInfo = await bot.getInfo();
    console.log("💰 Wallet Info:");
    console.log(`   Address: ${walletInfo.address}`);
    console.log(`   Balance: ${walletInfo.balance} ETH`);
    console.log(`   Character ID: ${walletInfo.entityId}`);
    console.log();

    // Check if balance is sufficient (warn if very low)
    const balance = parseFloat(walletInfo.balance);
    if (balance < 0.001) {
      console.log(
        "⚠️  WARNING: Low wallet balance! You may need more ETH for gas fees."
      );
      console.log(`   Current: ${walletInfo.balance} ETH`);
      console.log(`   Recommended: At least 0.001 ETH`);
      console.log();
    }

    console.log("✨ Spawning character...");
    console.log("🔧 Using optimized gas settings for Redstone chain:");
    console.log("   - Gas Limit: 200,000");
    console.log("   - Max Fee: 0.000002 gwei");
    console.log("   - Priority Fee: 0.0000001 gwei");
    console.log();

    // Spawn with default parameters (same as browser console call)
    await bot.movement.spawn(process.env.SPAWN_TILE_ENTITY_ID!, {
      x: -400,
      y: 73,
      z: 492,
    });

    console.log();
    console.log("🎉 Character spawned successfully!");
    console.log("💡 Your character should now be in the game world.");
  } catch (error) {
    process.exit(1);
  }
}

// Handle script interruption
process.on("SIGINT", () => {
  console.log("\n⏹️  Spawn demo interrupted");
  process.exit(0);
});

// Run the demo
main().catch(console.error);
