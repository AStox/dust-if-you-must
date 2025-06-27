#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { Vec3 } from "../src/types.js";
import { PlayerState } from "../src/core/base.js";
import { getObjectIdByName, ObjectTypes } from "../src/types/objectTypes.js";

// Load environment variables
dotenv.config();

// Configurable delay constants
export const DEFAULT_OPERATION_DELAY = 4000; // milliseconds

// Define key locations
const coastPosition: Vec3 = { x: -443, y: 63, z: 489 };
const waterPosition: Vec3 = { x: -444, y: 62, z: 489 };
const farmCenter: Vec3 = { x: -401, y: 72, z: 483 };
const housePosition: Vec3 = { x: -401, y: 72, z: 489 };
const farmCorner1: Vec3 = { x: -405, y: 72, z: 479 };
const farmCorner2: Vec3 = { x: -398, y: 72, z: 486 };

// Function declarations
async function walkToCoast(bot: DustBot) {
  console.log("=".repeat(60));
  console.log("🌊 STEP 2: MOVING TO COAST");
  console.log("=".repeat(60));
  console.log(
    `📍 Moving to coast: (${coastPosition.x}, ${coastPosition.y}, ${coastPosition.z})`
  );

  try {
    await bot.checkPlayerStatus("Moving to coast");
    await bot.movement.moveTowards(coastPosition);
    console.log("✅ Reached the coast!");
  } catch (error) {
    throw error;
  }
}

async function fillBuckets(bot: DustBot) {
  console.log("=".repeat(60));
  console.log("🪣 STEP 3: FILLING BUCKETS WITH WATER");
  console.log("=".repeat(60));
  console.log(
    `🎯 Water source: (${waterPosition.x}, ${waterPosition.y}, ${waterPosition.z})`
  );

  const inventory = await bot.inventory.getInventory();
  // Fill empty buckets
  const emptyBucketSlots = inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === getObjectIdByName("Bucket")!)
    .map(({ index }) => index);
  console.log("emptyBucketSlots", emptyBucketSlots);

  for (const emptySlot of emptyBucketSlots) {
    try {
      console.log(`🪣 Filling empty bucket in slot ${emptySlot}...`);
      await bot.farming.fillBucket(waterPosition, emptySlot);
      console.log(`✅ Successfully filled bucket in slot ${emptySlot}!`);
    } catch (error) {
      console.log(`⚠️ Failed to fill bucket in slot ${emptySlot}: ${error}`);
    }
  }
}

async function walkToHouse(bot: DustBot) {
  console.log("=".repeat(60));
  console.log("🏠 STEP 4: TRAVELING TO HOUSE");
  console.log("=".repeat(60));
  console.log(
    `📍 Moving to house: (${housePosition.x}, ${housePosition.y}, ${housePosition.z})`
  );

  try {
    await bot.movement.moveTowards(housePosition);
    console.log("✅ Reached the house!");
  } catch (error) {
    console.error("❌ Failed to reach the house:", error);
    throw error;
  }
}

async function walkToFarmCenter(bot: DustBot) {
  console.log("=".repeat(60));
  console.log("🌾 STEP 5: TRAVELING TO FARM CENTER");
  console.log("=".repeat(60));
  console.log("🌾 Moving to the farm center...");
  console.log(
    `📍 Moving to farm center: (${farmCenter.x}, ${farmCenter.y}, ${farmCenter.z})`
  );

  try {
    await bot.checkPlayerStatus("Moving to farm center");
    await bot.movement.moveTowards(farmCenter);
    console.log("✅ Reached the farm center!");
  } catch (error) {
    console.error("❌ Failed to reach the farm center:", error);
    throw error;
  }
}

async function refillBuckets(bot: DustBot) {
  await walkToHouse(bot);
  await walkToCoast(bot);
  await fillBuckets(bot);
  await walkToHouse(bot);
  await walkToFarmCenter(bot);
}

async function generateFarmPlots(): Promise<Vec3[]> {
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

  return farmPlots;
}

async function waterFarmPlots(bot: DustBot, farmPlots: Vec3[]) {
  console.log("=".repeat(60));
  console.log("🚜 WATERING FARM PLOTS");
  console.log("=".repeat(60));

  console.log(`🌾 Found ${farmPlots.length} farm plots to water`);

  let totalPlotsWatered = 0;
  for (const plot of farmPlots) {
    const type = await bot.world.getBlockType(plot);
    if (type === getObjectIdByName("WetFarmland")!) {
      totalPlotsWatered++;
    }
  }

  let plotIndex = 0;
  while (totalPlotsWatered < farmPlots.length) {
    console.log(
      `📊 Progress: ${totalPlotsWatered}/${farmPlots.length} plots watered`
    );

    let inventory = await bot.inventory.getInventory();
    const waterBucketIndexes = inventory
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.type === getObjectIdByName("WaterBucket")!)
      .map(({ index }) => index);
    let waterBucketCount = waterBucketIndexes.length;

    while (waterBucketCount > 0) {
      const plot = farmPlots[plotIndex];
      if (
        (await bot.world.getBlockType(plot)) !== getObjectIdByName("Farmland")!
      ) {
        plotIndex++;
        continue;
      }

      try {
        await bot.farming.wetFarmland(plot);
        console.log(
          `✅ Successfully watered plot at (${plot.x}, ${plot.y}, ${plot.z})`
        );
        plotIndex++;
        waterBucketCount--;
        totalPlotsWatered++;

        // Small delay between watering
        await new Promise((resolve) =>
          setTimeout(resolve, DEFAULT_OPERATION_DELAY)
        );
      } catch (error) {
        console.log(
          `⚠️ Failed to water plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
        );
        // Break out of bucket loop - need to refill
        break;
      }
    }

    // If we haven't finished all plots, go refill buckets
    if (totalPlotsWatered < farmPlots.length) {
      console.log("\n" + "=".repeat(50));
      console.log("🔄 REFILL CYCLE: RETURNING TO COAST");
      console.log("=".repeat(50));
      console.log(
        "🪣 Buckets empty or used up - returning to coast to refill..."
      );

      await refillBuckets(bot);
    }
  }
}

async function main() {
  // Initialize the bot
  const bot = new DustBot();

  // Display wallet info
  const walletInfo = await bot.getInfo();
  let inventory = await bot.inventory.getInventory();

  // Check actual player state and take appropriate action
  console.log("=".repeat(60));
  console.log("ACTIVATING CHARACTER");
  console.log("=".repeat(60));
  await bot.player.checkStatusAndActivate(bot);

  // Main execution flow

  // Check for empty buckets and fill if needed
  const bucketId = getObjectIdByName("Bucket");
  const waterBucketId = getObjectIdByName("WaterBucket");
  const emptyBucketIndexes = inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === bucketId)
    .map(({ index }) => index);
  const emptyBucketCount = emptyBucketIndexes.length;
  console.log("emptyBucketCount", emptyBucketCount);

  // Check for water buckets
  inventory = await bot.inventory.getInventory();
  const waterBucketIndexes = inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === waterBucketId)
    .map(({ index }) => index);
  const waterBucketCount = waterBucketIndexes.length;
  console.log("waterBucketCount", waterBucketCount);

  // Navigate to farm and start watering
  await walkToHouse(bot);
  await walkToFarmCenter(bot);

  // Generate farm plots and water them
  const farmPlots = await generateFarmPlots();
  await waterFarmPlots(bot, farmPlots);

  console.log("\n" + "=".repeat(60));
  console.log("🎉 FARMING PROCEDURE COMPLETE!");
  console.log("=".repeat(60));
  console.log(`✅ Successfully watered all ${farmPlots.length} farm plots!`);
  console.log("🚜 Farm is ready for growth and future harvest!");
  console.log("=".repeat(60));
}

// Run the demo
main().catch(console.error);
