#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { Vec3 } from "../src/types.js";
import { PlayerState } from "../src/core/base.js";

// Load environment variables
dotenv.config();

// Helper function to check and display player status before each action
async function checkPlayerStatus(bot: DustBot, action: string): Promise<void> {
  try {
    // Get comprehensive player state
    const [isDead, isSleeping, position, energy] = await Promise.all([
      bot.isPlayerDead(),
      bot.isPlayerSleeping(),
      bot.movement.getCurrentPosition(),
      bot.getPlayerEnergy(),
    ]);

    // Terse status display
    const posStr = position
      ? `(${position.x},${position.y},${position.z})`
      : "(??,??,??)";

    console.log(`${action} | energy:${energy} pos:${posStr}`);

    // Stop if dead
    if (isDead) {
      throw new Error("❌ Player died during farming - stopping operations");
    }
  } catch (error) {
    console.log(
      `⚠️ Status check failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

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

    // Check actual player state and take appropriate action
    console.log("=".repeat(60));
    console.log("🚀 STEP 1: CHECKING & ACTIVATING CHARACTER");
    console.log("=".repeat(60));

    // Get the actual player state from game tables
    const playerState = await bot.getPlayerState();

    let playerReady = false;

    switch (playerState) {
      case PlayerState.DEAD:
        console.log("💀 Player is DEAD - spawning character...");
        const spawnTilePosition = {
          x: -400,
          y: 73,
          z: 492,
        };

        try {
          await bot.movement.spawn(
            process.env.SPAWN_TILE_ENTITY_ID!,
            spawnTilePosition,
            245280000000000000n
          );
          console.log("🎉 Character spawned successfully!");
          playerReady = true;
        } catch (error) {
          console.error("❌ Failed to spawn character:", error);
          throw new Error("Could not spawn dead character");
        }
        break;

      case PlayerState.SLEEPING:
        console.log("😴 Player is SLEEPING - waking them up...");
        try {
          await bot.movement.activatePlayer();
          console.log("✅ Player woken up successfully!");
          playerReady = true;
        } catch (error) {
          console.error("❌ Failed to wake sleeping player:", error);
          throw new Error("Could not wake sleeping character");
        }
        break;

      case PlayerState.AWAKE:
        try {
          await bot.movement.activate();
          console.log("✅ Player activated successfully!");
          playerReady = true;
        } catch (error) {
          console.error("❌ Failed to activate awake player:", error);
          throw new Error("Could not activate awake character");
        }
        break;

      default:
        throw new Error(`Unknown player state: ${playerState}`);
    }

    if (!playerReady) {
      throw new Error("Character is not ready after state-specific activation");
    }
    console.log();

    // Define key locations
    const coastPosition: Vec3 = { x: -443, y: 63, z: 489 };
    const waterPosition: Vec3 = { x: -444, y: 62, z: 489 };
    const farmCenter: Vec3 = { x: -401, y: 72, z: 483 };
    const housePosition: Vec3 = { x: -401, y: 72, z: 489 };
    const farmCorner1: Vec3 = { x: -405, y: 72, z: 479 };
    const farmCorner2: Vec3 = { x: -298, y: 72, z: 486 };

    // Step 1: Move to the coast
    console.log("=".repeat(60));
    console.log("🌊 STEP 2: MOVING TO COAST");
    console.log("=".repeat(60));
    console.log(
      `📍 Moving to coast: (${coastPosition.x}, ${coastPosition.y}, ${coastPosition.z})`
    );

    try {
      await checkPlayerStatus(bot, "Moving to coast");
      await bot.movement.moveTowards(coastPosition);
      console.log("✅ Reached the coast!");
    } catch (error) {
      throw error;
    }

    // Step 2: Fill buckets from inventory slots
    console.log("=".repeat(60));
    console.log("🪣 STEP 3: FILLING BUCKETS WITH WATER");
    console.log("=".repeat(60));
    console.log("💧 Filling buckets with water...");
    console.log(
      `🎯 Water source: (${waterPosition.x}, ${waterPosition.y}, ${waterPosition.z})`
    );

    // Try to fill buckets from multiple inventory slots (assuming buckets might be in slots 0-9)
    let bucketsFilled = 0;
    const maxSlots = 10; // Check first 10 inventory slots for buckets
    const FILLED_BUCKET_TYPE = 32789; // Item type for filled buckets

    for (let slot = 0; slot < maxSlots; slot++) {
      try {
        await checkPlayerStatus(bot, `Checking slot ${slot}`);

        // Check what's in this slot first
        console.log(`🔍 Checking inventory slot ${slot}...`);
        const slotContents = await bot.farming.getInventorySlot(slot);

        if (slotContents && slotContents.itemType === FILLED_BUCKET_TYPE) {
          console.log(
            `✅ Slot ${slot} already contains a filled bucket (type ${FILLED_BUCKET_TYPE}) - skipping`
          );
          bucketsFilled++; // Count as filled since it's already a filled bucket
          continue;
        }

        await checkPlayerStatus(bot, `Filling bucket slot ${slot}`);
        console.log(`🪣 Attempting to fill bucket from slot ${slot}...`);
        await bot.farming.fillBucket(waterPosition, slot);
        console.log(`✅ Successfully filled bucket in slot ${slot}!`);
        bucketsFilled++;

        // Small delay between bucket fills
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.log(
          `⚠️ No bucket or failed to fill from slot ${slot} (this is normal if slot is empty)`
        );
        // Continue to next slot - this is expected for empty slots
      }
    }

    if (bucketsFilled > 0) {
      console.log(
        `🎉 Found ${bucketsFilled} bucket(s) with water (filled or already filled)!`
      );
    } else {
      console.log(
        "⚠️ No water buckets found - make sure you have buckets in your inventory"
      );
    }

    // Step 3: Move to house
    console.log("=".repeat(60));
    console.log("🏠 STEP 4: TRAVELING TO HOUSE");
    console.log("=".repeat(60));
    console.log("🏠 Moving to the house...");
    console.log(
      `📍 Moving to house: (${housePosition.x}, ${housePosition.y}, ${housePosition.z})`
    );

    try {
      await checkPlayerStatus(bot, "Moving to house");
      await bot.movement.moveTowards(housePosition);
      console.log("✅ Reached the house!");
    } catch (error) {
      console.error("❌ Failed to reach the house:", error);
      throw error;
    }

    // Step 4: Move to farm center
    console.log("=".repeat(60));
    console.log("🌾 STEP 5: TRAVELING TO FARM CENTER");
    console.log("=".repeat(60));
    console.log("🌾 Moving to the farm center...");
    console.log(
      `📍 Moving to farm center: (${farmCenter.x}, ${farmCenter.y}, ${farmCenter.z})`
    );

    try {
      await checkPlayerStatus(bot, "Moving to farm center");
      await bot.movement.moveTowards(farmCenter);
      console.log("✅ Reached the farm center!");
    } catch (error) {
      console.error("❌ Failed to reach the farm center:", error);
      throw error;
    }

    console.log("🎉 Ready to begin farming operations at the farm center!");

    // Step 5: Water all farm plots
    console.log("=".repeat(60));
    console.log("🚜 STEP 6: WATERING ALL FARM PLOTS");
    console.log("=".repeat(60));
    console.log("💧 Starting to water all farm plots...");

    // Generate all farm plot coordinates between corners
    const farmPlots: Vec3[] = [];
    const minX = Math.min(farmCorner1.x, farmCorner2.x);
    const maxX = Math.max(farmCorner1.x, farmCorner2.x);
    const minZ = Math.min(farmCorner1.z, farmCorner2.z);
    const maxZ = Math.max(farmCorner1.z, farmCorner2.z);

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        farmPlots.push({ x, y: 72, z }); // Assuming y=72 for all farm plots
      }
    }

    console.log(`🌾 Found ${farmPlots.length} farm plots to water`);
    console.log(`📏 Farm area: (${minX},${minZ}) to (${maxX},${maxZ})`);

    let totalPlotsWatered = 0;
    let currentBucketSlot = 0;
    const maxBucketSlots = 10;

    // Keep watering until all plots are done
    while (totalPlotsWatered < farmPlots.length) {
      console.log(
        `\n🚜 Watering cycle ${
          Math.floor(totalPlotsWatered / maxBucketSlots) + 1
        }`
      );
      console.log(
        `📊 Progress: ${totalPlotsWatered}/${farmPlots.length} plots watered`
      );

      // Water plots with current buckets
      let plotsWateredThisCycle = 0;
      for (
        let bucketSlot = 0;
        bucketSlot < maxBucketSlots &&
        totalPlotsWatered + plotsWateredThisCycle < farmPlots.length;
        bucketSlot++
      ) {
        const plotIndex = totalPlotsWatered + plotsWateredThisCycle;
        const plot = farmPlots[plotIndex];

        try {
          await checkPlayerStatus(
            bot,
            `Water plot ${plotIndex + 1}/${farmPlots.length} at (${plot.x},${
              plot.y
            },${plot.z})`
          );

          console.log(
            `💧 Watering plot ${plotIndex + 1}/${farmPlots.length} at (${
              plot.x
            }, ${plot.y}, ${plot.z}) with bucket from slot ${bucketSlot}`
          );
          await bot.farming.wetFarmland(plot, bucketSlot);
          console.log(
            `✅ Successfully watered plot at (${plot.x}, ${plot.y}, ${plot.z})`
          );
          plotsWateredThisCycle++;

          // Small delay between watering
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.log(
            `⚠️ Failed to water plot at (${plot.x}, ${plot.y}, ${plot.z}) - bucket slot ${bucketSlot} might be empty or used up`
          );
          // Break out of bucket loop - need to refill
          break;
        }
      }

      totalPlotsWatered += plotsWateredThisCycle;
      console.log(
        `✅ Watered ${plotsWateredThisCycle} plots this cycle. Total: ${totalPlotsWatered}/${farmPlots.length}`
      );

      // If we haven't finished all plots, go refill buckets
      if (totalPlotsWatered < farmPlots.length) {
        console.log("\n" + "=".repeat(50));
        console.log("🔄 REFILL CYCLE: RETURNING TO COAST");
        console.log("=".repeat(50));
        console.log(
          "🪣 Buckets empty or used up - returning to coast to refill..."
        );

        // Return to coast
        console.log(
          `📍 Returning to coast: (${coastPosition.x}, ${coastPosition.y}, ${coastPosition.z})`
        );
        try {
          await checkPlayerStatus(bot, "Returning to coast");
          await bot.movement.moveTowards(coastPosition);
          console.log("✅ Back at the coast!");
        } catch (error) {
          console.error("❌ Failed to return to coast:", error);
          throw error;
        }

        // Refill all buckets
        console.log("💧 Refilling buckets with water...");
        let bucketsRefilled = 0;
        for (let slot = 0; slot < maxBucketSlots; slot++) {
          try {
            await checkPlayerStatus(bot, `Refill check slot ${slot}`);

            // Check what's in this slot first
            console.log(`🔍 Checking inventory slot ${slot} for refill...`);
            const slotContents = await bot.farming.getInventorySlot(slot);

            if (slotContents && slotContents.itemType === FILLED_BUCKET_TYPE) {
              console.log(
                `✅ Slot ${slot} already contains a filled bucket (type ${FILLED_BUCKET_TYPE}) - skipping refill`
              );
              bucketsRefilled++; // Count as filled since it's already a filled bucket
              continue;
            }

            await checkPlayerStatus(bot, `Refilling slot ${slot}`);
            console.log(`🪣 Refilling bucket in slot ${slot}...`);
            await bot.farming.fillBucket(waterPosition, slot);
            console.log(`✅ Refilled bucket in slot ${slot}!`);
            bucketsRefilled++;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (error) {
            console.log(`⚠️ No bucket or failed to refill slot ${slot}`);
          }
        }

        console.log(
          `🎉 Ready with ${bucketsRefilled} water bucket(s) (refilled or already filled)!`
        );

        // Return to farm center via house
        console.log("\n" + "=".repeat(50));
        console.log("🔄 REFILL CYCLE: RETURNING TO FARM");
        console.log("=".repeat(50));
        console.log("🏠 Returning to house...");
        try {
          await checkPlayerStatus(bot, "Returning to house");
          await bot.movement.moveTowards(housePosition);
          console.log("✅ Back at house!");
        } catch (error) {
          console.error("❌ Failed to return to house:", error);
          throw error;
        }

        console.log("🌾 Returning to farm center...");
        try {
          await checkPlayerStatus(bot, "Returning to farm");
          await bot.movement.moveTowards(farmCenter);
          console.log("✅ Back at farm center!");
        } catch (error) {
          console.error("❌ Failed to return to farm center:", error);
          throw error;
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 FARMING PROCEDURE COMPLETE!");
    console.log("=".repeat(60));
    console.log(`✅ Successfully watered all ${farmPlots.length} farm plots!`);
    console.log("🚜 Farm is ready for growth and future harvest!");
    console.log("=".repeat(60));
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
