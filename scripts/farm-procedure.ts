#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import {
  FarmingMode,
  logFarmingState,
} from "../src/modules/behaviour/farmingMode.js";
import { BehaviorRegistry } from "../src/modules/behaviour/behaviorRegistry.js";
import { executeBehaviorCycle } from "../src/modules/behaviour/decision.js";

// Load environment variables
dotenv.config();

async function main() {
  console.log("🌾 Starting Farming Procedure with Behavior Mode System");
  console.log("=".repeat(60));

  // Initialize the bot
  const bot = new DustBot();

  // Display wallet info
  const walletInfo = await bot.getInfo();
  console.log("💳 Wallet Address:", walletInfo.address);

  // Check actual player state and take appropriate action
  console.log("\n🚀 STEP 1: CHECKING & ACTIVATING CHARACTER");
  console.log("=".repeat(60));

  // Get the actual player state from game tables
  await bot.player.checkStatusAndActivate(bot);

  // Initialize behavior system
  console.log("\n🧠 STEP 2: INITIALIZING BEHAVIOR SYSTEM");
  console.log("=".repeat(60));

  // Create behavior registry and register farming mode
  const behaviorRegistry = new BehaviorRegistry();
  const farmingMode = new FarmingMode();

  behaviorRegistry.register(farmingMode);
  behaviorRegistry.logStatus();

  // Main behavior loop
  console.log("\n🔄 STEP 3: STARTING FARMING BEHAVIOR LOOP");
  console.log("=".repeat(60));

  let cycleCount = 0;
  const maxCycles = 1000; // Safety limit to prevent infinite loops

  while (cycleCount < maxCycles) {
    cycleCount++;
    console.log(`\n📊 === Behavior Cycle ${cycleCount} ===`);

    try {
      // Get available behavior modes
      const availableModes = await behaviorRegistry.getAvailableModesByPriority(
        bot
      );

      if (availableModes.length === 0) {
        console.log("⚠️ No behavior modes available, waiting 30 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 30000));
        continue;
      }

      // Execute behavior cycle using the new system
      const success = await executeBehaviorCycle(bot, availableModes);

      if (!success) {
        console.log("❌ Behavior cycle failed, waiting before retry...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
        continue;
      }

      // Optional: Log detailed farming state every few cycles
      if (cycleCount % 5 === 0) {
        console.log("\n📈 === Detailed Farming State (Every 5 cycles) ===");
        const farmingState = await farmingMode.assessState(bot);
        await logFarmingState(farmingState);
      }

      // Small delay between cycles to prevent overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Optional: Check for completion conditions
      // You could add logic here to break the loop when farming is "done"
      // For example, when all plots are harvested and no more work is needed
    } catch (error) {
      console.error(`❌ Error in behavior cycle ${cycleCount}:`, error);

      // On error, wait a bit longer before retrying
      console.log("⏰ Waiting 30 seconds before retry...");
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }

  console.log(`\n🏁 Farming procedure completed after ${cycleCount} cycles`);
  console.log("=".repeat(60));
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Run the farming procedure
main().catch((error) => {
  console.error("💥 Fatal error in farming procedure:", error);
  process.exit(1);
});
