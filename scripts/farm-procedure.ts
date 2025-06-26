#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { Vec3 } from "../src/types.js";
import { PlayerState } from "../src/core/base.js";
import { ObjectTypes } from "../src/types/objectTypes.js";

// Load environment variables
dotenv.config();

// Configurable delay constants
export const DEFAULT_OPERATION_DELAY = 4000; // milliseconds

// Helper function to check and display player status before each action

async function main() {
  // Initialize the bot
  const bot = new DustBot();
  const coord = { x: -443, y: 58, z: 489 };
  console.log(
    "type:",
    ObjectTypes[await bot.world.getObjectTypeAt(coord)].name
  );
  console.log("type:", ObjectTypes[await bot.world.getBlockType(coord)].name);

  // Display wallet info
  const walletInfo = await bot.getInfo();

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
        const hash = await bot.movement.spawn(
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
        await bot.player.activatePlayer();
        console.log("✅ Player woken up successfully!");
        playerReady = true;
      } catch (error) {
        console.error("❌ Failed to wake sleeping player:", error);
        throw new Error("Could not wake sleeping character");
      }
      break;

    case PlayerState.AWAKE:
      playerReady = true;
      break;

    default:
      throw new Error(`Unknown player state: ${playerState}`);
  }

  // Define key locations
  const coastPosition: Vec3 = { x: -443, y: 63, z: 489 };
  const waterPosition: Vec3 = { x: -444, y: 62, z: 489 };
  const farmCenter: Vec3 = { x: -401, y: 72, z: 483 };
  const housePosition: Vec3 = { x: -401, y: 72, z: 489 };
  const farmCorner1: Vec3 = { x: -405, y: 72, z: 479 };
  const farmCorner2: Vec3 = { x: -298, y: 72, z: 486 };

  if (!playerReady) {
    throw new Error("Character is not ready after state-specific activation");
  }
  console.log();

  // Check current inventory status
  const inventory = await bot.inventory.getInventorySummary();
  console.log("inventory", inventory);

  // const [emptyBuckets, waterBuckets] = await Promise.all([
  //   bot.farming.findEmptyBuckets(maxSlots),
  //   bot.farming.findWaterBuckets(maxSlots),
  // ]);

  //   const walkToCoast = async () => {
  //     console.log("=".repeat(60));
  //     console.log("🌊 STEP 2: MOVING TO COAST");
  //     console.log("=".repeat(60));
  //     console.log(
  //       `📍 Moving to coast: (${coastPosition.x}, ${coastPosition.y}, ${coastPosition.z})`
  //     );

  //     try {
  //       await bot.checkPlayerStatus("Moving to coast");

  //       await bot.movement.moveTowards(coastPosition);
  //       console.log("✅ Reached the coast!");
  //     } catch (error) {
  //       throw error;
  //     }
  //   };

  //   const fillBuckets = async () => {
  //     console.log("=".repeat(60));
  //     console.log("🪣 STEP 3: FILLING BUCKETS WITH WATER");
  //     console.log("=".repeat(60));
  //     console.log(
  //       `🎯 Water source: (${waterPosition.x}, ${waterPosition.y}, ${waterPosition.z})`
  //     );

  //     // Fill empty buckets
  //     let bucketsFilled = waterBuckets.length; // Already filled buckets
  //     for (const emptySlot of emptyBuckets) {
  //       try {
  //         await bot.checkPlayerStatus(`Filling bucket slot ${emptySlot}`);
  //         console.log(`🪣 Filling empty bucket in slot ${emptySlot}...`);
  //         await bot.farming.fillBucket(waterPosition, emptySlot);
  //         console.log(`✅ Successfully filled bucket in slot ${emptySlot}!`);
  //         bucketsFilled++;

  //         // Small delay between bucket fills
  //         await new Promise((resolve) =>
  //           setTimeout(resolve, DEFAULT_OPERATION_DELAY)
  //         );
  //       } catch (error) {
  //         console.log(
  //           `⚠️ Failed to fill bucket in slot ${emptySlot}: ${error}`
  //         );
  //       }
  //     }

  //     if (bucketsFilled > 0) {
  //       console.log(
  //         `🎉 Found ${bucketsFilled} bucket(s) with water (filled or already filled)!`
  //       );
  //     } else {
  //       console.log(
  //         "⚠️ No water buckets found - make sure you have buckets in your inventory"
  //       );
  //     }
  //   };

  //   const walkToHouse = async () => {
  //     console.log("=".repeat(60));
  //     console.log("🏠 STEP 4: TRAVELING TO HOUSE");
  //     console.log("=".repeat(60));
  //     console.log(
  //       `📍 Moving to house: (${housePosition.x}, ${housePosition.y}, ${housePosition.z})`
  //     );

  //     try {
  //       const { position } = await bot.checkPlayerStatus("Moving to house");
  //       if (position) {
  //         console.log(
  //           `🔍 Moving towards: (${housePosition.x}, ${housePosition.y}, ${housePosition.z}) from ${position}`
  //         );
  //         await bot.movement.moveTowards(housePosition, position);
  //       } else {
  //         throw new Error("❌ Player position is null - stopping operations");
  //       }
  //       console.log("✅ Reached the house!");
  //     } catch (error) {
  //       console.error("❌ Failed to reach the house:", error);
  //       throw error;
  //     }
  //   };

  //   const walkToFarmCenter = async () => {
  //     console.log("=".repeat(60));
  //     console.log("🌾 STEP 5: TRAVELING TO FARM CENTER");
  //     console.log("=".repeat(60));
  //     console.log("🌾 Moving to the farm center...");
  //     console.log(
  //       `📍 Moving to farm center: (${farmCenter.x}, ${farmCenter.y}, ${farmCenter.z})`
  //     );

  //     try {
  //       await bot.checkPlayerStatus("Moving to farm center");
  //       await bot.movement.moveTowards(farmCenter);
  //       console.log("✅ Reached the farm center!");
  //     } catch (error) {
  //       console.error("❌ Failed to reach the farm center:", error);
  //       throw error;
  //     }
  //   };

  //   if (emptyBuckets.length > 0) {
  //     await walkToCoast();
  //     await fillBuckets();
  //   }

  //   if (waterBuckets.length === maxSlots) {
  //     await walkToHouse();
  //     await walkToFarmCenter();
  //   }

  //   // Step 5: Water all farm plots
  //   console.log("=".repeat(60));
  //   console.log("🚜 STEP 6: WATERING ALL FARM PLOTS");
  //   console.log("=".repeat(60));
  //   console.log("💧 Starting to water all farm plots...");

  //   // Generate all farm plot coordinates between corners
  //   const farmPlots: Vec3[] = [];
  //   const minX = Math.min(farmCorner1.x, farmCorner2.x);
  //   const maxX = Math.max(farmCorner1.x, farmCorner2.x);
  //   const minZ = Math.min(farmCorner1.z, farmCorner2.z);
  //   const maxZ = Math.max(farmCorner1.z, farmCorner2.z);

  //   for (let x = minX; x <= maxX; x++) {
  //     for (let z = minZ; z <= maxZ; z++) {
  //       farmPlots.push({ x, y: 72, z }); // Assuming y=72 for all farm plots
  //     }
  //   }

  //   console.log(`🌾 Found ${farmPlots.length} farm plots to water`);
  //   console.log(`📏 Farm area: (${minX},${minZ}) to (${maxX},${maxZ})`);

  //   let totalPlotsWatered = 0;
  //   let currentBucketSlot = 0;
  //   const maxBucketSlots = 10;

  //   // Keep watering until all plots are done
  //   while (totalPlotsWatered < farmPlots.length) {
  //     console.log(
  //       `\n🚜 Watering cycle ${
  //         Math.floor(totalPlotsWatered / maxBucketSlots) + 1
  //       }`
  //     );
  //     console.log(
  //       `📊 Progress: ${totalPlotsWatered}/${farmPlots.length} plots watered`
  //     );

  //     // Water plots with current buckets
  //     let plotsWateredThisCycle = 0;
  //     for (
  //       let bucketSlot = 0;
  //       bucketSlot < maxBucketSlots &&
  //       totalPlotsWatered + plotsWateredThisCycle < farmPlots.length;
  //       bucketSlot++
  //     ) {
  //       const plotIndex = totalPlotsWatered + plotsWateredThisCycle;
  //       const plot = farmPlots[plotIndex];

  //       try {
  //         await bot.checkPlayerStatus(
  //           `Water plot ${plotIndex + 1}/${farmPlots.length} at (${plot.x},${
  //             plot.y
  //           },${plot.z})`
  //         );

  //         console.log(
  //           `💧 Watering plot ${plotIndex + 1}/${farmPlots.length} at (${
  //             plot.x
  //           }, ${plot.y}, ${plot.z}) with bucket from slot ${bucketSlot}`
  //         );
  //         await bot.farming.wetFarmland(plot, bucketSlot);
  //         console.log(
  //           `✅ Successfully watered plot at (${plot.x}, ${plot.y}, ${plot.z})`
  //         );
  //         plotsWateredThisCycle++;

  //         // Small delay between watering
  //         await new Promise((resolve) =>
  //           setTimeout(resolve, DEFAULT_OPERATION_DELAY)
  //         );
  //       } catch (error) {
  //         console.log(
  //           `⚠️ Failed to water plot at (${plot.x}, ${plot.y}, ${plot.z}) - bucket slot ${bucketSlot} might be empty or used up`
  //         );
  //         // Break out of bucket loop - need to refill
  //         break;
  //       }
  //     }

  //     totalPlotsWatered += plotsWateredThisCycle;
  //     console.log(
  //       `✅ Watered ${plotsWateredThisCycle} plots this cycle. Total: ${totalPlotsWatered}/${farmPlots.length}`
  //     );

  //     // If we haven't finished all plots, go refill buckets
  //     if (totalPlotsWatered < farmPlots.length) {
  //       console.log("\n" + "=".repeat(50));
  //       console.log("🔄 REFILL CYCLE: RETURNING TO COAST");
  //       console.log("=".repeat(50));
  //       console.log(
  //         "🪣 Buckets empty or used up - returning to coast to refill..."
  //       );

  //       // Return to coast
  //       console.log(
  //         `📍 Returning to coast: (${coastPosition.x}, ${coastPosition.y}, ${coastPosition.z})`
  //       );
  //       try {
  //         await bot.checkPlayerStatus("Returning to coast");
  //         await bot.movement.moveTowards(coastPosition);
  //         console.log("✅ Back at the coast!");
  //       } catch (error) {
  //         console.error("❌ Failed to return to coast:", error);
  //         throw error;
  //       }

  //       // Refill all buckets
  //       console.log("💧 Refilling buckets with water...");
  //       await bot.farming.getInventorySummary(maxBucketSlots);

  //       const [refillEmptyBuckets, refillWaterBuckets] = await Promise.all([
  //         bot.farming.findEmptyBuckets(maxBucketSlots),
  //         bot.farming.findWaterBuckets(maxBucketSlots),
  //       ]);

  //       // Fill only the empty buckets
  //       for (const emptySlot of refillEmptyBuckets) {
  //         try {
  //           await bot.checkPlayerStatus(`Refilling slot ${emptySlot}`);
  //           console.log(`🪣 Refilling empty bucket in slot ${emptySlot}...`);
  //           await bot.farming.fillBucket(waterPosition, emptySlot);
  //           console.log(`✅ Refilled bucket in slot ${emptySlot}!`);
  //           await new Promise((resolve) => setTimeout(resolve, 1000));
  //         } catch (error) {
  //           console.log(
  //             `⚠️ Failed to refill bucket in slot ${emptySlot}: ${error}`
  //           );
  //         }
  //       }

  //       const totalWaterBuckets =
  //         refillWaterBuckets.length + refillEmptyBuckets.length;
  //       console.log(
  //         `🎉 Ready with ${totalWaterBuckets} water bucket(s) (${refillWaterBuckets.length} already filled + ${refillEmptyBuckets.length} refilled)!`
  //       );

  //       // Return to farm center via house
  //       console.log("\n" + "=".repeat(50));
  //       console.log("🔄 REFILL CYCLE: RETURNING TO FARM");
  //       console.log("=".repeat(50));
  //       console.log("🏠 Returning to house...");
  //       try {
  //         await bot.checkPlayerStatus("Returning to house");
  //         await bot.movement.moveTowards(housePosition);
  //         console.log("✅ Back at house!");
  //       } catch (error) {
  //         console.error("❌ Failed to return to house:", error);
  //         throw error;
  //       }

  //       console.log("🌾 Returning to farm center...");
  //       try {
  //         await bot.checkPlayerStatus("Returning to farm");
  //         await bot.movement.moveTowards(farmCenter);
  //         console.log("✅ Back at farm center!");
  //       } catch (error) {
  //         console.error("❌ Failed to return to farm center:", error);
  //         throw error;
  //       }
  //     }
  //   }

  //   console.log("\n" + "=".repeat(60));
  //   console.log("🎉 FARMING PROCEDURE COMPLETE!");
  //   console.log("=".repeat(60));
  //   console.log(`✅ Successfully watered all ${farmPlots.length} farm plots!`);
  //   console.log("🚜 Farm is ready for growth and future harvest!");
  //   console.log("=".repeat(60));
  // } catch (error) {
  //   console.error("💥 Script failed:", error);
  //   process.exit(1);
  // }
}

// Run the demo
main().catch(console.error);
