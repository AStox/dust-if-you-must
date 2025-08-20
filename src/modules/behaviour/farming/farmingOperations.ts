import { getOperationalConfig } from "../../../config/loader.js";
import { DustBot } from "../../../index.js";
import { Vec3 } from "../../../types/base.js";
import { getObjectIdByName, ObjectTypes } from "../../../types/objectTypes.js";
import {
  coastPosition,
  waterPosition,
  housePosition,
  farmCenter,
  farmCorner1,
  farmCorner2,
  getFarmingParameters,
} from "./farmingMode.js";

/**
 * Commit chunks around the player's current position (3x3x3 grid)
 */
async function commitChunksAroundPlayer(bot: DustBot): Promise<void> {
  const currentPos = await bot.player.getCurrentPosition();
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
  console.log("=".repeat(60));
  console.log("🌊 MOVING TO COAST");
  console.log("=".repeat(60));
  console.log(
    `📍 Moving to coast: (${coastPosition.x}, ${coastPosition.y}, ${coastPosition.z})`
  );

  try {
    await bot.checkPlayerStatus("Moving to coast");
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
  console.log(
    `🎯 Water source: (${waterPosition.x}, ${waterPosition.y}, ${waterPosition.z})`
  );

  const inventory = await bot.inventory.getInventory(
    bot.player.characterEntityId
  );
  // Fill empty buckets
  const emptyBucketSlots = inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === getObjectIdByName("Bucket")!)
    .map(({ index }) => index);
  console.log("emptyBucketSlots", emptyBucketSlots);

  // Process bucket filling operations in parallel
  const bucketPromises = emptyBucketSlots.map(async (emptySlot) => {
    try {
      console.log(`🪣 Filling empty bucket in slot ${emptySlot}...`);
      await bot.farming.fillBucket(waterPosition, emptySlot);
      console.log(`✅ Filled bucket in slot ${emptySlot}`);
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
  console.log(
    `📍 Moving to farm center: (${farmCenter.x}, ${farmCenter.y}, ${farmCenter.z})`
  );

  try {
    await bot.checkPlayerStatus("Moving to farm center");
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

export async function waterFarmPlots(bot: DustBot, farmPlots: Vec3[], waterBuckets: number) {
  console.log("=".repeat(60));
  console.log("🚜 WATERING FARM PLOTS");
  console.log("=".repeat(60));

  console.log(`💧 Starting with ${waterBuckets} water buckets`);

  if (waterBuckets === 0) {
    console.log("🪣 No water buckets available");
    return;
  }

  // Get actual inventory to find water bucket slots
  const inventory = await bot.inventory.getInventory(
    bot.player.characterEntityId
  );

  const waterBucketId = getObjectIdByName("WaterBucket")!;
  const waterBucketSlots = inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === waterBucketId)
    .map(({ index }) => index);

  console.log("waterBucketSlots", waterBucketSlots);

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
    .map(({ plot }, index) => ({ plot, bucketSlot: waterBucketSlots[index] }));

  console.log(`💧 Found ${plotsToWater.length} plots ready for watering (limited by ${waterBucketSlots.length} available water buckets)`);

  // Log skipped plots
  for (const { plot, plotType, needsWatering } of plotResults) {
    if (!needsWatering) {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
      );
    }
  }

  if (plotsToWater.length === 0) {
    console.log("ℹ️ No plots available for watering");
    return;
  }

  // Process watering operations in parallel
  const wateringPromises = plotsToWater.map(async ({ plot, bucketSlot }) => {
    try {
      await bot.farming.wetFarmland(plot, bucketSlot);
      console.log(`✅ Watered plot at (${plot.x}, ${plot.y}, ${plot.z})`);
    } catch (error) {
      console.log(
        `⚠️ Failed to water plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  });

  await Promise.all(wateringPromises);
  console.log(`✅ Watering operations completed for ${plotsToWater.length} plots`);
}

export async function seedFarmPlots(bot: DustBot, farmPlots: Vec3[], wheatSeeds: number, inventory: any[]) {
  console.log("=".repeat(60));
  console.log("🚜 SEEDING FARM PLOTS");
  console.log("=".repeat(60));

  console.log(`🌾 Starting with ${wheatSeeds} wheat seeds`);
  
  // Debug: Check what seeds are actually in the inventory
  const seedId = getObjectIdByName("WheatSeed")!;
  const seedItems = inventory.filter((item) => item.type === seedId);
  console.log(`🔍 Debug: Found ${seedItems.length} seed items in inventory:`, seedItems.map(item => `${item.amount} seeds in slot`));

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
  
  // Filter plots that need seeding and limit to available seeds
  const plotsToSeed = plotResults
    .filter(({ needsSeeding }) => needsSeeding)
    .slice(0, wheatSeeds)
    .map(({ plot }) => plot);

  console.log(`🌱 Found ${plotsToSeed.length} plots ready for seeding (limited by ${wheatSeeds} available seeds)`);

  // Log skipped plots
  for (const { plot, plotType, plotType2, needsSeeding } of plotResults) {
    if (!needsSeeding) {
      if (plotType !== getObjectIdByName("WetFarmland")!) {
        console.log(
          `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
        );
      } else if (plotType2 === getObjectIdByName("WheatSeed")!) {
        console.log(
          `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - already has wheat`
        );
      }
    }
  }

  if (plotsToSeed.length === 0) {
    console.log("ℹ️ No plots available for seeding");
    return;
  }

  // Process seeding operations in parallel
  const seedingPromises = plotsToSeed.map(async (plot, index) => {
    try {
      console.log(`🌱 Attempting to plant seed type ${seedId} at (${plot.x}, ${plot.y}, ${plot.z})`);
      await bot.farming.plantSeedType(plot, seedId);
      console.log(`✅ Seeded plot at (${plot.x}, ${plot.y}, ${plot.z})`);
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

  // TODO: do each plot in parallel
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

  // Process growing operations sequentially to avoid blockchain conflicts
  for (const { plot, plotType, needsGrowing } of plotResults) {
    if (needsGrowing) {
      try {
        await bot.farming.growSeed(plot);
      } catch (error) {
        console.log(
          `⚠️ Failed to grow seed at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
        );
      }
    } else {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
      );
    }
  }
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
  for (const { plot, plotType, needsHarvesting } of plotResults) {
    if (!needsHarvesting) {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
      );
    }
  }

  if (plotsToHarvest.length === 0) {
    console.log("ℹ️ No plots available for harvesting");
    return;
  }

  // Process harvesting operations in parallel
  const harvestingPromises = plotsToHarvest.map(async (plot) => {
    try {
      await bot.farming.harvest(plot);
      console.log(`✅ Harvested plot at (${plot.x}, ${plot.y}, ${plot.z})`);
    } catch (error) {
      console.log(
        `⚠️ Failed to harvest plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  });

  await Promise.all(harvestingPromises);
  console.log(`✅ Harvesting operations completed for ${plotsToHarvest.length} plots`);
}

export async function transferToFromChest(bot: DustBot) {
  const currentState = bot.state;

  console.log("🔄 === COMPREHENSIVE INVENTORY SETUP ===");
  console.log(
    `📊 Current inventory: ${currentState.emptyBuckets} buckets, ${currentState.wheatSeeds} seeds, ${currentState.wheat} wheat, ${currentState.slop} slop`
  );

  // === 0. CLEAN UP NON-FARMING ITEMS FIRST ===
  console.log("🧹 Cleaning up non-farming items from inventory...");
  const config = getOperationalConfig();
  const playerInventory = await bot.inventory.getInventory(
    bot.player.characterEntityId
  );

  const bucketId = getObjectIdByName("Bucket")!;
  const waterBucketId = getObjectIdByName("WaterBucket")!;
  const wheatSeedId = getObjectIdByName("WheatSeed")!;
  const wheatId = getObjectIdByName("Wheat")!;

  // Define allowed items for farming inventory
  const allowedItems = new Set([
    bucketId, // Empty buckets
    waterBucketId, // Water buckets
    wheatSeedId, // Wheat seeds
    wheatId, // Wheat
    0, // Empty slots (type 0)
  ]);

  // Find items that don't belong in farming inventory and transfer them in parallel
  const itemsToCleanup = playerInventory.filter(
    (item) => !allowedItems.has(item.type) && item.amount > 0
  );

  if (itemsToCleanup.length > 0) {
    const cleanupPromises = itemsToCleanup.map(async (item) => {
      const itemName =
        Object.keys(getObjectIdByName as any).find(
          (name) => (getObjectIdByName as any)(name) === item.type
        ) || `Unknown_${item.type}`;

      console.log(`📤 Transferring ${item.amount}x ${itemName} to chest (cleanup)`);
      try {
        await bot.inventory.transferExactAmount(
          bot.player.characterEntityId,
          config.entities.chests?.rightChest,
          item.type,
          item.amount
        );
        console.log(`✅ Successfully transferred ${item.amount}x ${itemName}`);
      } catch (error) {
        console.log(`❌ Failed to transfer ${itemName}: ${error}`);
      }
    });

    await Promise.all(cleanupPromises);
  }

  // Get chest inventory once for efficiency
  console.log("🔍 Checking chest inventory...");
  const chestInventory = await bot.inventory.getInventory(
    config.entities.chests?.rightChest
  );

  // Calculate what's available in chest
  const bucketsInChest = chestInventory
    .filter((item) => item.type === bucketId)
    .reduce((acc, item) => acc + item.amount, 0);

  const waterBucketsInChest = chestInventory
    .filter((item) => item.type === waterBucketId)
    .reduce((acc, item) => acc + item.amount, 0);

  const seedsInChest = chestInventory
    .filter((item) => item.type === wheatSeedId)
    .reduce((acc, item) => acc + item.amount, 0);

  const wheatInChest = chestInventory
    .filter((item) => item.type === wheatId)
    .reduce((acc, item) => acc + item.amount, 0);

  console.log(
    `📦 Chest contains: ${bucketsInChest} empty buckets, ${waterBucketsInChest} water buckets, ${seedsInChest} seeds, ${wheatInChest} wheat`
  );

  const params = getFarmingParameters();

  // === 1. TRANSFER EMPTY BUCKETS (target: 5) ===
  const totalBucketsNeeded = params.targetBuckets;
  console.log(`🪣 Need ${totalBucketsNeeded} total buckets`);

  if (bucketsInChest > 0) {
    const bucketsToTransfer = Math.min(totalBucketsNeeded, bucketsInChest);
    console.log(
      `📤 Transferring ${bucketsToTransfer} empty buckets from chest to player`
    );

    try {
      await bot.inventory.transferExactAmount(
        config.entities.chests?.rightChest,
        bot.player.characterEntityId,
        bucketId,
        bucketsToTransfer
      );
      console.log(`✅ Successfully transferred ${bucketsToTransfer} empty buckets`);
    } catch (error) {
      console.log(`❌ Failed to transfer empty buckets: ${error}`);
    }
  } else {
    console.log("⚠️ No empty buckets available in chest");
  }

  // === 2. TRANSFER WATER BUCKETS ===
  if (waterBucketsInChest > 0) {
    console.log(
      `📤 Transferring ${waterBucketsInChest} water buckets from chest to player`
    );

    try {
      await bot.inventory.transferExactAmount(
        config.entities.chests?.rightChest,
        bot.player.characterEntityId,
        waterBucketId,
        waterBucketsInChest
      );
      console.log(`✅ Successfully transferred ${waterBucketsInChest} water buckets`);
    } catch (error) {
      console.log(`❌ Failed to transfer water buckets: ${error}`);
    }
  } else {
    console.log("ℹ️ No water buckets available in chest");
  }

  // === 3. TRANSFER SEEDS (target: 99) ===
  if (seedsInChest > 0) {
    const seedsToTransfer = Math.min(params.targetSeeds, seedsInChest);
    console.log(
      `📤 Transferring ${seedsToTransfer} seeds from chest to player`
    );

    try {
      await bot.inventory.transferExactAmount(
        config.entities.chests?.rightChest,
        bot.player.characterEntityId,
        wheatSeedId,
        seedsToTransfer
      );
      console.log(`✅ Successfully transferred ${seedsToTransfer} seeds`);
    } catch (error) {
      console.log(`❌ Failed to transfer seeds: ${error}`);
    }
  } else {
    console.log("⚠️ No seeds available in chest");
  }

  // === 4. TRANSFER WHEAT (target: 99) ===
  if (wheatInChest > 0) {
    const wheatToTransfer = Math.min(99, wheatInChest);
    console.log(
      `📤 Transferring ${wheatToTransfer} wheat from chest to player`
    );

    try {
      await bot.inventory.transferExactAmount(
        config.entities.chests?.rightChest,
        bot.player.characterEntityId,
        wheatId,
        wheatToTransfer
      );
      console.log(`✅ Successfully transferred ${wheatToTransfer} wheat`);
    } catch (error) {
      console.log(`❌ Failed to transfer wheat: ${error}`);
    }
  } else {
    console.log("⚠️ No wheat available in chest");
  }

  console.log("🔄 Comprehensive inventory setup completed");
}
