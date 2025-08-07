#!/usr/bin/env tsx
import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { executeBehaviorCycle } from "../src/modules/behaviour/decision.js";
import { loadOperationalConfig } from "../src/config/loader.js";
import { BaseBehaviorMode } from "../src/modules/behaviour/behaviorMode.js";

// Load environment variables
dotenv.config();

interface ProcedureConfig {
  mode: BaseBehaviorMode;
  configRequirements?: {
    requireEnergizeAreas?: boolean;
  };
  logState?: (state: any) => Promise<void>;
  logInterval?: number; // Log every N cycles
}

async function runProcedure(config: ProcedureConfig) {
  try {
    await loadOperationalConfig({
      configPath: "./config/operational.json",
      validateSchema: true,
      allowEnvironmentOverrides: true,
      requireEnergizeAreas: config.configRequirements?.requireEnergizeAreas || false,
    });
    console.log("✅ Configuration loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load configuration:", error);
    if (config.configRequirements?.requireEnergizeAreas) {
      console.error(
        "💡 Make sure config/operational.json has energize areas configured"
      );
    } else {
      console.error("💡 Make sure config/operational.json exists and is valid");
    }
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

  // activate character (needed for both farming and energize to handle dead players)
  await bot.player.activate();
  
  // Refresh nonce to ensure it's in sync after activation
  await bot.player.refreshNonce();

  // Get the actual player state from game tables
  await bot.player.checkStatusAndActivate(bot);

  let cycleCount = 0;

  while (true) {
    cycleCount++;
    console.log(`\n📊 === Behavior Cycle ${cycleCount} ===`);

    try {
      await executeBehaviorCycle(bot, [config.mode]);

      // Optional state logging at intervals
      if (config.logState && config.logInterval && cycleCount % config.logInterval === 0) {
        console.log(`\n📈 === Detailed ${config.mode.name} State (Every ${config.logInterval} cycles) ===`);
        const state = await config.mode.assessState(bot);
        await config.logState(state);
      }
    } catch (error) {
      console.error(`❌ Error in behavior cycle ${cycleCount}:`, error);
    }
  }
}

// Export for use by specific procedure scripts
export { runProcedure, type ProcedureConfig };

// Allow running directly with mode specified via command line
async function main() {
  const mode = process.argv[2];
  
  if (!mode) {
    console.error("❌ Please specify a mode: 'farm', 'energize', or 'survival'");
    console.error("Usage: tsx universal-procedure.ts <mode>");
    process.exit(1);
  }

  let config: ProcedureConfig;

  if (mode === "farm") {
    const { FarmingMode, logFarmingState } = await import("../src/modules/behaviour/farming/farmingMode.js");
    config = {
      mode: new FarmingMode(),
      logState: logFarmingState,
      logInterval: 5,
    };
  } else if (mode === "energize") {
    const { EnergizeMode } = await import("../src/modules/behaviour/energize/energizeMode.js");
    config = {
      mode: new EnergizeMode(),
      configRequirements: { requireEnergizeAreas: true },
    };
  } else if (mode === "survival") {
    const { SurvivalMode, logSurvivalState } = await import("../src/modules/behaviour/survival/survivalMode.js");
    config = {
      mode: new SurvivalMode(),
      logState: logSurvivalState,
      logInterval: 3,
    };
  } else {
    console.error(`❌ Unknown mode: ${mode}. Use 'farm', 'energize', or 'survival'`);
    process.exit(1);
  }

  console.log(`🚀 Starting ${mode.toUpperCase()} procedure`);
  await runProcedure(config);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("💥 Fatal error in universal procedure:", error);
    process.exit(1);
  });
}
