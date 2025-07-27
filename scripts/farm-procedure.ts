#!/usr/bin/env tsx
import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import {
  FarmingMode,
  logFarmingState,
} from "../src/modules/behaviour/farming/farmingMode.js";
import { executeBehaviorCycle } from "../src/modules/behaviour/decision.js";
import { loadOperationalConfig } from "../src/config/loader.js";

// Load environment variables
dotenv.config();

async function main() {
  try {
    await loadOperationalConfig({
      configPath: "./config/operational.json",
      validateSchema: true,
      allowEnvironmentOverrides: true,
      requireEnergizeAreas: false,
    });
  } catch (error) {
    console.error("❌ Failed to load configuration:", error);
    console.error("💡 Make sure config/operational.json exists and is valid");
    process.exit(1);
  }

  // Initialize the bot
  const bot = new DustBot();

  // Display wallet info
  const walletInfo = await bot.getInfo();
  console.log("💳 Wallet Address:", walletInfo.address);

  // Check actual player state and take appropriate action
  console.log("\n🚀 CHECKING & ACTIVATING CHARACTER");
  console.log("=".repeat(60));

  // Get the actual player state from game tables
  await bot.player.checkStatusAndActivate(bot);

  const farmingMode = new FarmingMode();

  let cycleCount = 0;

  while (true) {
    cycleCount++;
    console.log(`\n📊 === Behavior Cycle ${cycleCount} ===`);

    try {
      await executeBehaviorCycle(bot, [farmingMode]);

      if (cycleCount % 5 === 0) {
        console.log("\n📈 === Detailed Farming State (Every 5 cycles) ===");
        const farmingState = await farmingMode.assessState(bot);
        await logFarmingState(farmingState);
      }
    } catch (error) {
      console.error(`❌ Error in behavior cycle ${cycleCount}:`, error);
    }
  }
}

// Run the farming procedure
main().catch((error) => {
  console.error("💥 Fatal error in farming procedure:", error);
  process.exit(1);
});
