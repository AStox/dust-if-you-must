#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";

// Load environment variables
dotenv.config();

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("❌ Usage: npm run pathTo -- <x> <z>");
    console.error("   Example: npm run pathTo -- 100 -50");
    console.error("   Example: npm run pathTo -- -405 479");
    console.error(
      "   Note: Use '--' before coordinates when using negative numbers"
    );
    process.exit(1);
  }

  const x = parseInt(args[0]);
  const z = parseInt(args[1]);

  if (isNaN(x) || isNaN(z)) {
    console.error("❌ Both coordinates must be valid numbers");
    process.exit(1);
  }

  // Initialize the bot
  const bot = new DustBot();

  // Display wallet info
  const walletInfo = await bot.getInfo();

  console.log("=".repeat(60));
  console.log("🚀 PATHFINDING TO TARGET");
  console.log("=".repeat(60));

  // Check actual player state and take appropriate action
  await bot.player.checkStatusAndActivate(bot);

  try {
    console.log(`🎯 Target coordinates: [${x}, ${z}]`);
    console.log(`🔍 Starting pathfinding...`);

    // Use pathfinding to navigate to target
    await bot.movement.pathTo({ x, z });
  } catch (error) {
    console.error(
      `❌ Failed to reach target: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
