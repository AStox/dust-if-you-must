import { getOperationalConfig } from "../../../config/loader.js";
import { DustBot } from "../../../index.js";
import { Vec3 } from "../../../types/base.js";
import { getObjectIdByName, ObjectTypes } from "../../../types/objectTypes.js";
import { getItemCount } from "../../../utils.js";
import {
  getFarmingParameters,
} from "./farmingMode.js";

/**
 * Commit chunks around the player's current position (3x3x3 grid)
 */
async function commitChunksAroundPlayer(bot: DustBot): Promise<void> {
  // Use pre-fetched position from bot.state
  const currentPos = bot.state.position;
  const playerChunk = bot.world.toChunkCoord(currentPos);

  console.log(
    `📦 Committing chunks around player at chunk (${playerChunk.x}, ${playerChunk.y}, ${playerChunk.z})...`
  );

  const commitPromises = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunkToCommit = {
          x: playerChunk.x + dx,
          y: playerChunk.y + dy,
          z: playerChunk.z + dz,
        };

        const commitPromise = bot.world
          .commitChunk(chunkToCommit)
          .then(() => {
            console.log(
              `✅ Committed chunk (${chunkToCommit.x}, ${chunkToCommit.y}, ${chunkToCommit.z})`
            );
          })
          .catch((error) => {
            console.log(
              `⚠️ Failed to commit chunk (${chunkToCommit.x}, ${chunkToCommit.y}, ${chunkToCommit.z}): ${error}`
            );
          });

        commitPromises.push(commitPromise);
      }
    }
  }

  await Promise.all(commitPromises);
  console.log(`✅ Chunk commits completed`);
}

export async function walkToCoast(bot: DustBot) {
  const config = getOperationalConfig();
  const coastPosition = config.areas.farming.coastPosition;
  console.log("=".repeat(60));
  console.log("🌊 MOVING TO COAST");
  console.log("=".repeat(60));
  console.log(
    `📍 Moving to coast: (${coastPosition.x}, ${coastPosition.y}, ${coastPosition.z})`
  );

  try {
    await bot.movement.pathTo({
      x: coastPosition.x,
      y: coastPosition.y,
      z: coastPosition.z,
    });
    console.log("✅ Reached the coast!");
  } catch (error) {
    throw error;
  }
}

export async function fillBuckets(bot: DustBot) {
  console.log("=".repeat(60));
  console.log("🪣 FILLING BUCKETS WITH WATER");
  console.log("=".repeat(60));
  const config = getOperationalConfig();
  const waterPosition = config.areas.farming.waterSource;
  console.log(
    `🎯 Water source: (${waterPosition.x}, ${waterPosition.y}, ${waterPosition.z})`
  );

  // Fill empty buckets
  const emptyBucketSlots = await bot.inventory.getAllSlotsForItemType(getObjectIdByName("Bucket"));

  // Process bucket filling operations in parallel
  const bucketPromises = emptyBucketSlots.map(async (emptySlot) => {
    try {
      await bot.farming.fillBucket(waterPosition, emptySlot[0]);
    } catch (error) {
      console.log(`⚠️ Failed to fill bucket in slot ${emptySlot}: ${error}`);
    }
  });

  await Promise.all(bucketPromises);
}

export async function walkToHouse(bot: DustBot) {
  console.log("=".repeat(60));
  console.log("🏠 TRAVELING TO HOUSE");
  console.log("=".repeat(60));
  const config = getOperationalConfig();
  const housePosition = config.areas.farming.housePosition;
  console.log(
    `📍 Moving to house: (${housePosition.x}, ${housePosition.y}, ${housePosition.z})`
  );

  try {
    await bot.movement.pathTo({
      x: housePosition.x,
      y: housePosition.y,
      z: housePosition.z,
    });
    console.log("✅ Reached the house!");
  } catch (error) {
    console.error("❌ Failed to reach the house:", error);
    throw error;
  }
}

export async function walkToFarmCenter(bot: DustBot) {
  console.log("=".repeat(60));
  console.log("🌾 TRAVELING TO FARM CENTER");
  console.log("=".repeat(60));
  console.log("🌾 Moving to the farm center...");
  const config = getOperationalConfig();
  const farmCenter = config.areas.farming.farmCenter;
  console.log(
    `📍 Moving to farm center: (${farmCenter.x}, ${farmCenter.y}, ${farmCenter.z})`
  );

  try {
    await bot.movement.pathTo({
      x: farmCenter.x,
      y: farmCenter.y,
      z: farmCenter.z,
    });
    console.log("✅ Reached the farm center!");
  } catch (error) {
    console.error("❌ Failed to reach the farm center:", error);
    throw error;
  }
}

export async function generateFarmPlots(): Promise<Vec3[]> {
  const config = getOperationalConfig();
  const farmPlots: Vec3[] = [];
  const farmCorner1 = config.areas.farming.farmBounds.corner1;
  const farmCorner2 = config.areas.farming.farmBounds.corner2;
  const minX = Math.min(farmCorner1.x, farmCorner2.x);
  const maxX = Math.max(farmCorner1.x, farmCorner2.x);
  const minZ = Math.min(farmCorner1.z, farmCorner2.z);
  const maxZ = Math.max(farmCorner1.z, farmCorner2.z);

  const farmCenter = config.areas.farming.farmCenter;

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      farmPlots.push({ x, y: farmCenter.y - 1, z });
    }
  }

  return farmPlots;
}

export async function waterFarmPlots(bot: DustBot, farmPlots: Vec3[], waterBuckets: number) {
  console.log("=".repeat(60));
  console.log("🚜 WATERING FARM PLOTS");
  console.log("=".repeat(60));

  console.log(`💧 Starting with ${waterBuckets} water buckets`);

  if (waterBuckets === 0) {
    console.log("🪣 No water buckets available");
    return;
  }

  // Use pre-fetched inventory from bot.state
  const inventory = bot.state.inventory;

  const waterBucketId = getObjectIdByName("WaterBucket")!;
  const waterBucketSlots = await bot.inventory.getAllSlotsForItemType(waterBucketId);

  // Check all plots in parallel to identify which need watering
  const plotChecks = farmPlots.map(async (plot) => {
    const plotType = await bot.world.getBlockType(plot);
    const needsWatering = plotType === getObjectIdByName("Farmland")!;

    return {
      plot,
      plotType,
      needsWatering,
    };
  });

  const plotResults = await Promise.all(plotChecks);
  
  // Filter plots that need watering and limit to available water buckets
  const plotsToWater = plotResults
    .filter(({ needsWatering }) => needsWatering)
    .slice(0, waterBucketSlots.length)
    .map(({ plot }, index) => ({ plot, bucketSlot: waterBucketSlots[index][0] }));

  console.log(`💧 Found ${plotsToWater.length} plots ready for watering (limited by ${waterBucketSlots.length} available water buckets)`);

  // Log skipped plots
  // for (const { plot, plotType, needsWatering } of plotResults) {
  //   if (!needsWatering) {
  //     console.log(
  //       `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
  //     );
  //   }
  // }

  if (plotsToWater.length === 0) {
    console.log("ℹ️ No plots available for watering");
    return;
  }

  // Process watering operations in parallel
  const wateringPromises = plotsToWater.map(async ({ plot, bucketSlot }) => {
    try {
      await bot.farming.wetFarmland(plot, bucketSlot);
    } catch (error) {
      console.log(
        `⚠️ Failed to water plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  });

  await Promise.all(wateringPromises);
  console.log(`✅ Watering operations completed for ${plotsToWater.length} plots`);
}

export async function seedFarmPlots(bot: DustBot, farmPlots: Vec3[], inventory: any[]) {
  console.log("=".repeat(60));
  console.log("🚜 SEEDING FARM PLOTS");
  console.log("=".repeat(60));
  
  // Debug: Check what seeds are actually in the inventory
  const seedId = getObjectIdByName("WheatSeed")!;
  const seedSlots = await bot.inventory.getAllSlotsForItemType(seedId);
  console.log(`🔍 Debug: Found ${seedSlots.length} seed items in inventory:`, seedSlots.map(item => `${item[1]} seeds in slot ${item[0]}`));

  // Check all plots in parallel to identify which need seeding
  const plotChecks = farmPlots.map(async (plot) => {
    const plotType = await bot.world.getBlockType(plot);
    const plotType2 = await bot.world.getBlockType({
      x: plot.x,
      y: plot.y + 1,
      z: plot.z,
    });

    const needsSeeding = 
      plotType === getObjectIdByName("WetFarmland")! &&
      plotType2 !== getObjectIdByName("WheatSeed")!;

    return {
      plot,
      plotType,
      plotType2,
      needsSeeding,
    };
  });

  const plotResults = await Promise.all(plotChecks);
  
  const wheatSeeds = getItemCount(getObjectIdByName("WheatSeed"), bot.state.inventory);
  // Filter plots that need seeding and limit to available seeds
  const plotsToSeed = plotResults
    .filter(({ needsSeeding }) => needsSeeding)
    .slice(0, wheatSeeds)
    .map(({ plot }) => plot);

  console.log(`🌱 Found ${plotsToSeed.length} plots ready for seeding (limited by ${wheatSeeds} available seeds)`);

  // Log skipped plots
  // for (const { plot, plotType, plotType2, needsSeeding } of plotResults) {
  //   if (!needsSeeding) {
  //     if (plotType !== getObjectIdByName("WetFarmland")!) {
  //       console.log(
  //         `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
  //       );
  //     } else if (plotType2 === getObjectIdByName("WheatSeed")!) {
  //       console.log(
  //         `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - already has wheat`
  //       );
  //     }
  //   }
  // }

  if (plotsToSeed.length === 0) {
    console.log("ℹ️ No plots available for seeding");
    return;
  }

  // Process seeding operations in parallel
  const seedingPromises = plotsToSeed.map(async (plot, index) => {
    try {
      await bot.farming.plantSeedType(plot, seedId);
    } catch (error) {
      console.log(
        `⚠️ Failed to seed plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  });

  await Promise.all(seedingPromises);
  console.log(`✅ Seeding operations completed for ${plotsToSeed.length} plots`);
}

export async function growSeededFarmPlots(bot: DustBot, farmPlots: Vec3[]) {
  console.log("=".repeat(60));
  console.log("🚜 GROWING SEEDED FARM PLOTS");
  console.log("=".repeat(60));

  // Commit chunks around player before growing
  await commitChunksAroundPlayer(bot);

  // Check all plots in parallel to identify which need growing
  const plotChecks = farmPlots.map(async (plot) => {
    const plotType = await bot.world.getBlockType({
      x: plot.x,
      y: plot.y + 1,
      z: plot.z,
    });

    const needsGrowing =
      plotType === getObjectIdByName("WheatSeed")! &&
      (await bot.farming.isPlantReadyToGrow({
        x: plot.x,
        y: plot.y + 1,
        z: plot.z,
      }));

    return {
      plot,
      plotType,
      needsGrowing,
    };
  });

  const plotResults = await Promise.all(plotChecks);
  
  // Filter plots that need growing
  const plotsToGrow = plotResults
    .filter(({ needsGrowing }) => needsGrowing)
    .map(({ plot }) => plot);

  console.log(`🌱 Found ${plotsToGrow.length} plots ready for growing`);

  // Log skipped plots
  for (const { plot, plotType, needsGrowing } of plotResults) {
    if (!needsGrowing) {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
      );
    }
  }

  if (plotsToGrow.length === 0) {
    console.log("ℹ️ No plots available for growing");
    return;
  }

  // Process growing operations in parallel
  const growingPromises = plotsToGrow.map(async (plot) => {
    try {
      await bot.farming.growSeed(plot);
    } catch (error) {
      console.log(
        `⚠️ Failed to grow seed at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  });

  await Promise.all(growingPromises);
  console.log(`✅ Growing operations completed for ${plotsToGrow.length} plots`);
}

export async function harvestFarmPlots(bot: DustBot, farmPlots: Vec3[]) {
  console.log("=".repeat(60));
  console.log("🚜 HARVESTING FARM PLOTS");
  console.log("=".repeat(60));

  // Commit chunks around player before harvesting
  await commitChunksAroundPlayer(bot);

  // Check all plots in parallel to identify which have wheat to harvest
  const plotChecks = farmPlots.map(async (plot) => {
    const plotType = await bot.world.getBlockType({
      x: plot.x,
      y: plot.y + 1,
      z: plot.z,
    });

    const needsHarvesting = plotType === getObjectIdByName("Wheat")!;

    return {
      plot,
      plotType,
      needsHarvesting,
    };
  });

  const plotResults = await Promise.all(plotChecks);
  
  // Filter plots that need harvesting
  const plotsToHarvest = plotResults
    .filter(({ needsHarvesting }) => needsHarvesting)
    .map(({ plot }) => plot);

  console.log(`🌾 Found ${plotsToHarvest.length} plots ready for harvesting`);

  // Log skipped plots
  // for (const { plot, plotType, needsHarvesting } of plotResults) {
  //   if (!needsHarvesting) {
  //     console.log(
  //       `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
  //     );
  //   }
  // }

  if (plotsToHarvest.length === 0) {
    console.log("ℹ️ No plots available for harvesting");
    return;
  }

  // Process harvesting operations in parallel
  const harvestingPromises = plotsToHarvest.map(async (plot) => {
    try {
      await bot.farming.harvest(plot);
    } catch (error) {
      console.log(
        `⚠️ Failed to harvest plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  });

  await Promise.all(harvestingPromises);
  console.log(`✅ Harvesting operations completed for ${plotsToHarvest.length} plots`);
}