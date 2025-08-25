#!/usr/bin/env tsx
import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { executeBehaviorCycle } from "../src/modules/behaviour/decision.js";
import { loadOperationalConfig } from "../src/config/loader.js";
import { SurvivalMode } from "../src/modules/behaviour/survival/survivalMode.js";
import { FarmingMode } from "../src/modules/behaviour/farming/farmingMode.js";
import { EnergizeMode } from "../src/modules/behaviour/energize/energizeMode.js";

// Load environment variables
dotenv.config();

// Parse command line arguments for debug flag
const args = process.argv.slice(2);
const isDebugMode = args.includes('--debug');

// Global debug logging function
global.debugLog = (message: string, ...args: any[]) => {
  if (isDebugMode) {
    console.log(`🐛 DEBUG: ${message}`, ...args);
  }
};

declare global {
  var debugLog: (message: string, ...args: any[]) => void;
}

async function runComprehensiveProcedure() {
  debugLog("Starting comprehensive procedure", { isDebugMode });
  
  try {
    debugLog("Loading operational configuration...");
    await loadOperationalConfig({
      configPath: "./config/operational.json",
      validateSchema: true,
      allowEnvironmentOverrides: true,
      requireEnergizeAreas: true, // Required for energize mode
    });
    debugLog("Configuration loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load configuration:", error);
    console.error(
      "💡 Make sure config/operational.json exists and has all required areas configured"
    );
    process.exit(1);
  }

  // Initialize the bot
  debugLog("Initializing DustBot...");
  const bot = new DustBot();

  // Display wallet info
  debugLog("Getting wallet info...");
  const walletInfo = await bot.getInfo();
  debugLog("Wallet info retrieved", walletInfo);

  // Initial setup logging
  console.log("\n🚀 INITIAL SETUP COMPLETE");
  console.log("=".repeat(60));

  // Initialize all behavior modes with proper priority order
  debugLog("Initializing behavior modes...");
  const survivalMode = new SurvivalMode(); // Priority: 1000 (highest)
  const farmingMode = new FarmingMode(); // Priority: 100 (medium)
  const energizeMode = new EnergizeMode(); // Priority: 80 (low)

  const allModes = [survivalMode, farmingMode, energizeMode];

  let cycleCount = 0;
  let lastDetailedLog = 0;

  console.log(
    `  🚨 ${
      survivalMode.name
    } (priority: ${survivalMode.getPriority()}) - Critical survival actions`
  );
  console.log(
    `  🌾 ${
      farmingMode.name
    } (priority: ${farmingMode.getPriority()}) - Food production`
  );
  console.log(
    `  🔋 ${
      energizeMode.name
    } (priority: ${energizeMode.getPriority()}) - Energy generation`
  );

  while (true) {
    cycleCount++;
    console.log("\n" + "=".repeat(80));
    console.log(
      `${"-".repeat(25)} CYCLE ${cycleCount} - STARTING NEW CYCLE ${"-".repeat(
        25
      )}`
    );
    console.log("=".repeat(80));

    try {
      // Check actual player state and take appropriate action every cycle
      console.log("\n🚀 CHECKING & ACTIVATING CHARACTER");
      debugLog(`Starting cycle ${cycleCount} - character activation`);
      
      // activate character (needed for all modes to handle dead players)
      debugLog("Activating player character...");
      await bot.player.activate();

      // Refresh nonce to ensure it's in sync after activation
      debugLog("Refreshing nonce...");
      await bot.player.refreshNonce();

      // Get the actual player state from game tables
      debugLog("Checking player status and activating...");
      await bot.player.checkStatusAndActivate(bot);

      // Execute behavior cycle with all modes - will automatically select highest priority available mode
      debugLog("Executing behavior cycle with all modes...");
      await executeBehaviorCycle(bot, allModes);

    } catch (error) {
      console.error(
        `❌ Error in comprehensive behavior cycle ${cycleCount}:`,
        error
      );

      // If we haven't done a detailed log recently, do one to help debug
      if (cycleCount - lastDetailedLog > 10) {
        console.log("\n🔍 === Emergency State Report (After Error) ===");
        try {
          debugLog("Getting emergency survival state report...");
          const survivalState = await survivalMode.assessState(bot);
          debugLog("Emergency survival state", survivalState);
          console.log("\n🚨 Emergency Survival State:", JSON.stringify(survivalState, null, 2));
        } catch (debugError) {
          console.log("⚠️ Could not get emergency state report:", debugError);
          debugLog("Emergency state report error", debugError);
        }
      }
    }
  }
}

runComprehensiveProcedure().catch((error) => {
  console.error("💥 Fatal error in comprehensive procedure:", error);
  process.exit(1);
});
