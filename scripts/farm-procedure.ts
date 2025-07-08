#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import {
  assessCurrentState,
  logCurrentState,
} from "../src/modules/behaviour/state.js";
import { selectBestAction } from "../src/modules/behaviour/decision.js";

// Load environment variables
dotenv.config();

async function main() {
  // Initialize the bot
  const bot = new DustBot();

  // Display wallet info
  const walletInfo = await bot.getInfo();

  // Check actual player state and take appropriate action
  console.log("=".repeat(60));
  console.log("🚀 STEP 1: CHECKING & ACTIVATING CHARACTER");
  console.log("=".repeat(60));

  // Get the actual player state from game tables
  await bot.player.checkStatusAndActivate(bot);

  while (true) {
    // Assess current state
    bot.state = await assessCurrentState(bot);
    await logCurrentState(bot.state);

    // Check if we're done
    // if (state.unwateredPlots === 0) {
    //   const completeAction = utilityActions.find((a) => a.name === "COMPLETE")!;
    //   await completeAction.execute(bot);
    //   break;
    // }

    // Select and execute best action
    const bestAction = await selectBestAction(bot.state);
    console.log(`\n🎯 Executing: ${bestAction.name}`);

    try {
      await bestAction.execute(bot);
      // console.log(`✅ Completed: ${bestAction.name}`);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

// Run the demo
main().catch(console.error);
