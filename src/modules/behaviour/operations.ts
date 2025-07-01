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
} from "./state.js";

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

  // Water plots one by one until we run out of water or plots
  for (const plot of farmPlots) {
    // console.log("checking plot", plot);

    const plotType = await bot.world.getBlockType(plot);
    if (plotType !== getObjectIdByName("Farmland")!) {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${ObjectTypes[plotType].name}`
      );
      continue; // Skip already watered or non-farmland plots
    }

    const inventory = await bot.inventory.getInventory(
      bot.player.characterEntityId
    );

    const waterBucketId = getObjectIdByName("WaterBucket")!;
    const waterBucketCount = inventory.filter(
      (item) => item.type === waterBucketId
    ).length;

    if (waterBucketCount === 0) {
      console.log("🪣 Out of water buckets - stopping watering");
      break;
    }

    try {
      await bot.farming.wetFarmland(plot);
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

  for (const plot of farmPlots) {
    const plotType = await bot.world.getBlockType({
      x: plot.x,
      y: plot.y + 1,
      z: plot.z,
    });

    if (
      plotType === getObjectIdByName("WheatSeed")! &&
      (await bot.farming.isPlantReadyToGrow({
        x: plot.x,
        y: plot.y + 1,
        z: plot.z,
      }))
    ) {
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
