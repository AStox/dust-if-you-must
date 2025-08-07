#!/usr/bin/env tsx
import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { executeBehaviorCycle } from "../src/modules/behaviour/decision.js";
import { loadOperationalConfig } from "../src/config/loader.js";
import { SurvivalMode, logSurvivalState } from "../src/modules/behaviour/survival/survivalMode.js";
import { FarmingMode, logFarmingState } from "../src/modules/behaviour/farming/farmingMode.js";
import { EnergizeMode, logEnergizeState } from "../src/modules/behaviour/energize/energizeMode.js";

// Load environment variables
dotenv.config();

async function runComprehensiveProcedure() {
  try {
    await loadOperationalConfig({
      configPath: "./config/operational.json",
      validateSchema: true,
      allowEnvironmentOverrides: true,
      requireEnergizeAreas: true, // Required for energize mode
    });
    console.log("✅ Configuration loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load configuration:", error);
    console.error("💡 Make sure config/operational.json exists and has all required areas configured");
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

  // activate character (needed for all modes to handle dead players)
  await bot.player.activate();
  
  // Refresh nonce to ensure it's in sync after activation
  await bot.player.refreshNonce();

  // Get the actual player state from game tables
  await bot.player.checkStatusAndActivate(bot);

  // Initialize all behavior modes with proper priority order
  const survivalMode = new SurvivalMode(); // Priority: 1000 (highest)
  const farmingMode = new FarmingMode();   // Priority: 100 (medium)  
  const energizeMode = new EnergizeMode(); // Priority: 80 (low)

  const allModes = [survivalMode, farmingMode, energizeMode];

  let cycleCount = 0;
  let lastDetailedLog = 0;

  console.log("\n🎯 Starting comprehensive behavior cycle with all modes:");
  console.log(`  🚨 ${survivalMode.name} (priority: ${survivalMode.getPriority()}) - Critical survival actions`);
  console.log(`  🌾 ${farmingMode.name} (priority: ${farmingMode.getPriority()}) - Food production`);
  console.log(`  🔋 ${energizeMode.name} (priority: ${energizeMode.getPriority()}) - Energy generation`);

  while (true) {
    cycleCount++;
    console.log(`\n📊 === Comprehensive Behavior Cycle ${cycleCount} ===`);

    try {
      // Execute behavior cycle with all modes - will automatically select highest priority available mode
      await executeBehaviorCycle(bot, allModes);

      // Detailed state logging every 5 cycles
      if (cycleCount % 5 === 0) {
        lastDetailedLog = cycleCount;
        console.log(`\n📈 === Detailed State Report (Cycle ${cycleCount}) ===`);
        
        // Show survival state (always relevant)
        const survivalState = await survivalMode.assessState(bot);
        await logSurvivalState(survivalState);

        // Show farming state if farming mode is available
        try {
          if (await farmingMode.isAvailable(bot)) {
            const farmingState = await farmingMode.assessState(bot);
            await logFarmingState(farmingState);
          } else {
            console.log("\n🌾 Farming mode not currently available");
          }
        } catch (error) {
          console.log("\n⚠️ Could not assess farming state:", error);
        }

        // Show energize state if energize mode is available
        try {
          if (await energizeMode.isAvailable(bot)) {
            const energizeState = await energizeMode.assessState(bot);
            await logEnergizeState(energizeState);
          } else {
            console.log("\n🔋 Energize mode not currently available");
          }
        } catch (error) {
          console.log("\n⚠️ Could not assess energize state:", error);
        }
      }

    } catch (error) {
      console.error(`❌ Error in comprehensive behavior cycle ${cycleCount}:`, error);
      
      // If we haven't done a detailed log recently, do one to help debug
      if (cycleCount - lastDetailedLog > 10) {
        console.log("\n🔍 === Emergency State Report (After Error) ===");
        try {
          const survivalState = await survivalMode.assessState(bot);
          await logSurvivalState(survivalState);
        } catch (debugError) {
          console.log("⚠️ Could not get emergency state report:", debugError);
        }
      }
    }
  }
}

console.log("🎯 Starting COMPREHENSIVE procedure (Survival + Farming + Energize)");
runComprehensiveProcedure().catch((error) => {
  console.error("💥 Fatal error in comprehensive procedure:", error);
  process.exit(1);
});
