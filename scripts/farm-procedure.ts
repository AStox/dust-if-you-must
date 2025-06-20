#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { Vec3 } from "../src/types.js";

// Load environment variables
dotenv.config();

async function main() {
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

    // Check if player is alive by trying to wake/activate them
    console.log("🔍 Checking player status...");
    let playerReady = false;

    // First try to wake up if sleeping
    try {
      await bot.movement.activatePlayer();
      console.log("😴 Player was sleeping - woke them up!");
      playerReady = true;
    } catch (error) {
      console.log("💤 Player not sleeping, trying regular activation...");
    }

    // If not sleeping, try regular activation
    if (!playerReady) {
      try {
        await bot.movement.activate();
        console.log("✅ Player is alive and activated!");
        playerReady = true;
      } catch (error) {
        console.log("💀 Player appears to be dead or unable to activate");
      }
    }

    // If still not ready, spawn them
    if (!playerReady) {
      console.log("✨ Spawning character...");

      const spawnTilePosition = {
        x: -400,
        y: 73,
        z: 492,
      };
      await bot.movement.spawn(
        process.env.SPAWN_TILE_ENTITY_ID!,
        spawnTilePosition,
        245280000000000000n
      );

      console.log("🎉 Character spawned successfully!");
    }
    console.log();

    // Define waypoints (dummy coordinates - fill in later)
    // First waypoint must be within 1 block of spawn position (-400, 73, 492)
    const waypoints: Vec3[] = [
      { x: -401, y: 72, z: 483 }, // Waypoint 1 - farm center
      { x: -401, y: 72, z: 489 }, // Waypoint 2 - house
      { x: -443, y: 63, z: 489 }, // Waypoint 3 - coast
      { x: -401, y: 72, z: 489 }, // Waypoint 4 - house
    ];

    console.log("🗺️ Moving through waypoints...");

    // Move to each waypoint sequentially
    for (let i = 0; i < waypoints.length; i++) {
      const waypoint = waypoints[i];
      console.log(
        `📍 Moving to waypoint ${i + 1}: (${waypoint.x}, ${waypoint.y}, ${
          waypoint.z
        })`
      );

      try {
        await bot.movement.moveTowards(waypoint);
        console.log(`✅ Reached waypoint ${i + 1}`);

        // Small delay between waypoints
        console.log("⏳ Waiting 2 seconds before next waypoint...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Failed to reach waypoint ${i + 1}:`);
        // Continue to next waypoint even if one fails
      }
    }

    console.log("🎉 Completed all waypoint movements!");
    console.log("🚜 Ready to begin farming operations...");
  } catch (error) {
    console.error("💥 Script failed:", error);
    process.exit(1);
  }
}

// Handle script interruption
process.on("SIGINT", () => {
  console.log("\n⏹️  interrupted");
  process.exit(0);
});

// Run the demo
main().catch(console.error);
