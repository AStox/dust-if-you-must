import { getOperationalConfig } from "../../config/loader.js";
import { DustBot } from "../../index.js";
import { Vec3 } from "../../types/base.js";
import { getObjectIdByName, ObjectTypes } from "../../types/objectTypes.js";
import {
  coastPosition,
  waterPosition,
  housePosition,
  farmCenter,
  farmCorner1,
  farmCorner2,
  getFarmingParameters,
} from "./farmingMode.js";

export async function walkToCoast(bot: DustBot) {
  console.log("=".repeat(60));
  console.log("🌊 MOVING TO COAST");
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

  for (const emptySlot of emptyBucketSlots) {
    try {
      console.log(`🪣 Filling empty bucket in slot ${emptySlot}...`);
      await bot.farming.fillBucket(waterPosition, emptySlot);
    } catch (error) {
      console.log(`⚠️ Failed to fill bucket in slot ${emptySlot}: ${error}`);
    }
  }
}

export async function walkToHouse(bot: DustBot) {
  console.log("=".repeat(60));
  console.log("🏠 TRAVELING TO HOUSE");
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
    await bot.movement.moveTowards(farmCenter);
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

export async function waterFarmPlots(bot: DustBot, farmPlots: Vec3[]) {
  console.log("=".repeat(60));
  console.log("🚜 WATERING FARM PLOTS");
  console.log("=".repeat(60));

  const inventory = await bot.inventory.getInventory(
    bot.player.characterEntityId
  );

  const waterBucketId = getObjectIdByName("WaterBucket")!;
  const waterBucketSlots = inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === waterBucketId)
    .map(({ index }) => index);

  console.log("waterBucketSlots", waterBucketSlots);

  if (waterBucketSlots.length === 0) {
    console.log("🪣 No water buckets available");
    return;
  }

  // Water plots one by one until we run out of water or plots
  let waterBucketIndex = 0;
  for (const plot of farmPlots) {
    if (waterBucketIndex >= waterBucketSlots.length) {
      console.log("🪣 Out of water buckets - stopping watering");
      break;
    }

    // console.log("checking plot", plot);

    const plotType = await bot.world.getBlockType(plot);
    if (plotType !== getObjectIdByName("Farmland")!) {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
      );
      continue; // Skip already watered or non-farmland plots
    }

    try {
      await bot.farming.wetFarmland(plot, waterBucketSlots[waterBucketIndex]);
      waterBucketIndex++;
    } catch (error) {
      console.log(
        `⚠️ Failed to water plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  }
}

export async function seedFarmPlots(bot: DustBot, farmPlots: Vec3[]) {
  console.log("=".repeat(60));
  console.log("🚜 SEEDING FARM PLOTS");
  console.log("=".repeat(60));

  // Water plots one by one until we run out of water or plots
  for (const plot of farmPlots) {
    // console.log("checking plot", plot);

    const plotType = await bot.world.getBlockType(plot);
    if (plotType !== getObjectIdByName("WetFarmland")!) {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
      );
      continue; // Skip can only seed on wet farmland
    }

    const plotType2 = await bot.world.getBlockType({
      x: plot.x,
      y: plot.y + 1,
      z: plot.z,
    });
    if (plotType2 === getObjectIdByName("WheatSeed")!) {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - already has wheat`
      );
      continue; // Skip can only seed where there isn't wheat already
    }

    const inventory = await bot.inventory.getInventory(
      bot.player.characterEntityId
    );

    const seedId = getObjectIdByName("WheatSeed")!;
    const seedCount = inventory.filter((item) => item.type === seedId).length;

    if (seedCount === 0) {
      console.log("🪣 Out of seeds - stopping seeding");
      break;
    }

    try {
      await bot.farming.plantSeedType(plot, seedId);
    } catch (error) {
      console.log(
        `⚠️ Failed to seed plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  }
}

export async function growSeededFarmPlots(bot: DustBot, farmPlots: Vec3[]) {
  console.log("=".repeat(60));
  console.log("🚜 GROWING SEEDED FARM PLOTS");
  console.log("=".repeat(60));

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

  for (const plot of farmPlots) {
    // console.log("checking plot", plot);

    const plotType = await bot.world.getBlockType({
      x: plot.x,
      y: plot.y + 1,
      z: plot.z,
    });
    if (plotType !== getObjectIdByName("Wheat")!) {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
      );
      continue; // Skip can only harvest wheat
    }

    try {
      await bot.farming.harvest(plot);
    } catch (error) {
      console.log(
        `⚠️ Failed to harvest plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  }
}

export async function transferToFromChest(bot: DustBot) {
  const currentState = bot.state;

  console.log("🔄 === COMPREHENSIVE INVENTORY SETUP ===");
  console.log(
    `📊 Current inventory: ${currentState.emptyBuckets} buckets, ${currentState.wheatSeeds} seeds, ${currentState.wheat} wheat, ${currentState.slop} slop`
  );

  // Get chest inventory once for efficiency
  console.log("🔍 Checking chest inventory...");
  const config = getOperationalConfig();
  const chestInventory = await bot.inventory.getInventory(
    config.entities.chests?.rightChest
  );

  const bucketId = getObjectIdByName("Bucket")!;
  const wheatSeedId = getObjectIdByName("WheatSeed")!;
  const wheatId = getObjectIdByName("Wheat")!;
  const slopId = getObjectIdByName("WheatSlop")!;

  // Calculate what's available in chest
  const bucketsInChest = chestInventory
    .filter((item) => item.type === bucketId)
    .reduce((acc, item) => acc + item.amount, 0);

  const seedsInChest = chestInventory
    .filter((item) => item.type === wheatSeedId)
    .reduce((acc, item) => acc + item.amount, 0);

  const wheatInChest = chestInventory
    .filter((item) => item.type === wheatId)
    .reduce((acc, item) => acc + item.amount, 0);

  console.log(
    `📦 Chest contains: ${bucketsInChest} buckets, ${seedsInChest} seeds, ${wheatInChest} wheat`
  );

  const params = getFarmingParameters();

  // === 1. TRANSFER BUCKETS (target: 5) ===
  if (currentState.emptyBuckets < params.targetBuckets) {
    const bucketsNeeded = params.targetBuckets - currentState.emptyBuckets;
    console.log(`🪣 Need ${bucketsNeeded} more buckets to reach 5`);

    if (bucketsInChest > 0) {
      const bucketsToTransfer = Math.min(bucketsNeeded, bucketsInChest);
      console.log(
        `📤 Transferring ${bucketsToTransfer} buckets from chest to player`
      );

      try {
        await bot.inventory.transferExactAmount(
          config.entities.chests?.rightChest,
          bot.player.characterEntityId,
          bucketId,
          bucketsToTransfer
        );
        console.log(`✅ Successfully transferred ${bucketsToTransfer} buckets`);
      } catch (error) {
        console.log(`❌ Failed to transfer buckets: ${error}`);
      }
    } else {
      console.log("⚠️ No buckets available in chest");
    }
  } else {
    console.log("✅ Already have enough buckets (5 or more)");
  }

  // === 2. TRANSFER SEEDS (target: 99) ===
  if (currentState.wheatSeeds < params.targetSeeds) {
    const seedsNeeded = params.targetSeeds - currentState.wheatSeeds;
    console.log(`🌱 Need ${seedsNeeded} more seeds to reach 99`);

    if (seedsInChest > 0) {
      const seedsToTransfer = Math.min(seedsNeeded, seedsInChest);
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
  } else {
    console.log("✅ Already have enough seeds (99 or more)");
  }

  // === 3. TRANSFER WHEAT (target: 99) ===
  if (currentState.wheat < 99) {
    const wheatNeeded = 99 - currentState.wheat;
    console.log(`🌾 Need ${wheatNeeded} more wheat to reach 99`);

    if (wheatInChest > 0) {
      const wheatToTransfer = Math.min(wheatNeeded, wheatInChest);
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
  } else {
    console.log("✅ Already have enough wheat (99 or more)");
  }

  // === 4. TRANSFER SLOP TO CHEST (cleanup) ===
  if (currentState.slop > 0) {
    console.log(
      `📤 Transferring ${currentState.slop} slop from player to chest`
    );

    try {
      await bot.inventory.transferExactAmount(
        bot.player.characterEntityId,
        config.entities.chests?.rightChest,
        slopId,
        currentState.slop
      );
      console.log(
        `✅ Successfully transferred ${currentState.slop} slop to chest`
      );
    } catch (error) {
      console.log(`❌ Failed to transfer slop: ${error}`);
    }
  } else {
    console.log("ℹ️ No slop to transfer");
  }

  // === 5. TRANSFER ANY OTHER ITEMS TO CHEST (cleanup) ===
  console.log("🧹 Cleaning up non-farming items...");
  const playerInventory = await bot.inventory.getInventory(
    bot.player.characterEntityId
  );

  // Define allowed items for farming inventory
  const allowedItems = new Set([
    bucketId, // Empty buckets
    wheatSeedId, // Wheat seeds
    wheatId, // Wheat
    0, // Empty slots (type 0)
  ]);

  // Find items that don't belong in farming inventory
  const itemsToTransfer: { itemType: number; amount: number; name: string }[] =
    [];

  for (const item of playerInventory) {
    if (!allowedItems.has(item.type) && item.amount > 0) {
      // Find the name of this item for logging
      const itemName =
        Object.keys(getObjectIdByName as any).find(
          (name) => (getObjectIdByName as any)(name) === item.type
        ) || `Unknown_${item.type}`;

      itemsToTransfer.push({
        itemType: item.type,
        amount: item.amount,
        name: itemName,
      });
    }
  }

  if (itemsToTransfer.length > 0) {
    console.log(
      `🗑️ Found ${itemsToTransfer.length} types of non-farming items to transfer:`
    );

    for (const item of itemsToTransfer) {
      console.log(`  📦 ${item.amount}x ${item.name} (ID: ${item.itemType})`);

      try {
        await bot.inventory.transferExactAmount(
          bot.player.characterEntityId,
          config.entities.chests?.rightChest,
          item.itemType,
          item.amount
        );
        console.log(`  ✅ Transferred ${item.amount}x ${item.name} to chest`);
      } catch (error) {
        console.log(`  ❌ Failed to transfer ${item.name}: ${error}`);
      }
    }
  } else {
    console.log("✅ No non-farming items found - inventory is clean");
  }

  console.log("🔄 Comprehensive inventory setup completed");
}

export async function setupEnergizeInventory(bot: DustBot): Promise<void> {
  console.log("🔄 === ENERGIZE INVENTORY SETUP ===");

  // Get current inventory
  const currentInventory = bot.state.inventory;

  // Count current axes and oak saplings
  let currentAxes = 0;
  let currentOakSaplings = 0;
  let otherItems = 0;

  const axeTypes = [
    getObjectIdByName("WoodenAxe"),
    getObjectIdByName("StoneAxe"),
    getObjectIdByName("IronAxe"),
    getObjectIdByName("DiamondAxe"),
  ];
  const oakSaplingId = getObjectIdByName("OakSapling");

  // Items to exclude from "other items" count
  const excludedTypes = [
    getObjectIdByName("OakLog"),
    getObjectIdByName("BirchLog"),
    getObjectIdByName("SpruceLog"),
    getObjectIdByName("OakLeaves"),
    getObjectIdByName("BirchLeaves"),
    getObjectIdByName("SpruceLeaves"),
    getObjectIdByName("Battery"),
  ].filter((id) => id !== undefined);

  for (const item of currentInventory) {
    if (axeTypes.includes(item.type)) {
      currentAxes += item.amount;
    } else if (item.type === oakSaplingId) {
      currentOakSaplings += item.amount;
    } else if (!excludedTypes.includes(item.type)) {
      otherItems += item.amount;
    }
  }

  // Target: exactly 1 axe, at least 1 oak sapling (up to 99), 0 other items
  const needsInventorySetup =
    currentAxes !== 1 || currentOakSaplings < 1 || otherItems > 0;

  if (!needsInventorySetup) {
    console.log("✅ Inventory already perfect for energize mode!");
    return;
  }

  // Get energize areas and entity IDs
  const config = getOperationalConfig();

  console.log("🔄 Need to reorganize inventory");
  const target = {
    x: config.areas.farming.farmCenter.x,
    y: config.areas.farming.farmCenter.y,
    z: config.areas.farming.farmCenter.z,
  };
  if (bot.state.position !== target) {
    console.log("  Moving to chest...");
    await bot.movement.pathTo(target);
  }

  // Step 1: Store all current items in chest (bulk transfer)

  if (currentInventory.length > 0) {
    console.log("📤 Storing all current items in chest...");
    // Build bulk transfer array: [fromSlot, toSlot, amount]
    const transfers: [number, number, number][] = [];

    // Get available slots in chest
    const chestInventory = bot.state.chestInventory;
    let chestSlotIndex = 0;

    for (
      let playerSlot = 0;
      playerSlot < currentInventory.length;
      playerSlot++
    ) {
      const item = currentInventory[playerSlot];
      if (item.amount > 0) {
        console.log(
          `  Preparing to store ${item.amount}x ${getItemName(item.type)}`
        );

        // Find available chest slot
        while (
          chestSlotIndex < 40 &&
          chestInventory[chestSlotIndex] &&
          chestInventory[chestSlotIndex].amount > 0
        ) {
          chestSlotIndex++;
        }

        if (chestSlotIndex < 40) {
          transfers.push([playerSlot, chestSlotIndex, item.amount]);
          chestSlotIndex++;
        }
      }
    }

    if (transfers.length > 0) {
      console.log(
        `📦 Executing bulk transfer of ${transfers.length} item stacks to chest...`
      );
      await bot.inventory.transfer(
        bot.player.characterEntityId,
        config.entities.chests?.rightChest,
        transfers
      );
      console.log("✅ Bulk transfer to chest completed");
    }
  }

  // Step 2: Retrieve exactly 1 axe (prefer higher tier)
  if (currentAxes < 1) {
    console.log("\n📥 Retrieving exactly 1 axe...");
    const axePriority = [
      { name: "DiamondAxe", id: getObjectIdByName("DiamondAxe") },
      { name: "IronAxe", id: getObjectIdByName("IronAxe") },
      { name: "StoneAxe", id: getObjectIdByName("StoneAxe") },
      { name: "WoodenAxe", id: getObjectIdByName("WoodenAxe") },
    ];

    let axeRetrieved = false;
    for (const axe of axePriority) {
      try {
        console.log(`  Trying to get 1x ${axe.name}...`);
        await bot.inventory.transferExactAmount(
          config.entities.chests?.rightChest,
          bot.player.characterEntityId,
          axe.id!,
          1
        );
        console.log(`  ✅ Retrieved 1x ${axe.name}`);
        axeRetrieved = true;
        break;
      } catch (error) {
        console.log(`  ❌ No ${axe.name} available in chest`);
      }
    }
    if (!axeRetrieved) {
      throw new Error(
        "No axes available in chest! Cannot proceed with energize."
      );
    }
  }

  if (currentOakSaplings < 1) {
    // Step 3: Retrieve oak saplings (at least 1, up to 99)
    console.log("📥 Retrieving oak saplings (at least 1, up to 99)...");
    console.log("oakSaplingId", oakSaplingId);
    try {
      await bot.inventory.transferUpToAmount(
        config.entities.chests?.rightChest,
        bot.player.characterEntityId,
        oakSaplingId!,
        99
      );
      console.log("  ✅ Retrieved Oak Saplings");
    } catch (error) {
      throw new Error(
        "No Oak Saplings available in chest! Oak Saplings are required for energize mode"
      );
    }
  }

  console.log("🎯 Energize inventory setup completed!");
}

// Helper function to get item name from ID
function getItemName(itemId: number): string {
  const objectType = ObjectTypes[itemId];
  return objectType ? objectType.name : `Unknown_${itemId}`;
}
