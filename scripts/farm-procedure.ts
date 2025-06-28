#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { EntityId, Vec3 } from "../src/types.js";
import { PlayerState } from "../src/core/base.js";
import { getObjectIdByName, ObjectTypes } from "../src/types/objectTypes.js";

// Load environment variables
dotenv.config();

// Configurable delay constants
export const DEFAULT_OPERATION_DELAY = 4000; // milliseconds

// Define key locations
const coastPosition: Vec3 = { x: -443, y: 63, z: 489 };
const waterPosition: Vec3 = { x: -444, y: 62, z: 489 };
const farmCenter: Vec3 = { x: -401, y: 72, z: 483 }; // Also chest position
const rightChestEntityId: EntityId =
  "0x03fffffe7300000049000001e300000000000000000000000000000000000000";
const housePosition: Vec3 = { x: -401, y: 72, z: 489 };
const farmCorner1: Vec3 = { x: -405, y: 72, z: 479 };
const farmCorner2: Vec3 = { x: -398, y: 72, z: 486 };

// Utility System Types
interface BotState {
  location: "coast" | "house" | "farm" | "unknown";
  position: Vec3;
  emptyBuckets: number;
  waterBuckets: number;
  wheatSeeds: number;
  wheat: number;
  slop: number;
  unwateredPlots: number;
  unseededPlots: number;
  unharvestedPlots: number;
  totalPlots: number;
}

interface UtilityAction {
  name: string;
  calculateScore(state: BotState): number;
  execute(bot: DustBot): Promise<void>;
  canExecute(state: BotState): boolean;
}

// Utility Functions
function calculateDistance(pos1: Vec3, pos2: Vec3): number {
  return Math.sqrt(
    Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.y - pos2.y, 2) +
      Math.pow(pos1.z - pos2.z, 2)
  );
}

function determineLocation(
  position: Vec3
): "coast" | "house" | "farm" | "unknown" {
  const distanceToCoast = calculateDistance(position, coastPosition);
  const distanceToHouse = calculateDistance(position, housePosition);
  const distanceToFarm = calculateDistance(position, farmCenter);

  const threshold = 10; // blocks

  const distances = [
    { location: "coast" as const, distance: distanceToCoast },
    { location: "house" as const, distance: distanceToHouse },
    { location: "farm" as const, distance: distanceToFarm },
  ];

  console.log("distances", distances);

  const closest = distances.reduce((min, current) =>
    current.distance < min.distance ? current : min
  );

  if (closest.distance <= threshold) return closest.location;

  return "unknown";
}

async function assessCurrentState(bot: DustBot): Promise<BotState> {
  const inventory = await bot.inventory.getInventory();
  console.log("inventory", inventory);
  const position = await bot.player.getCurrentPosition();

  const emptyBuckets = inventory.filter(
    (item) => item.type === getObjectIdByName("Bucket")!
  ).length;

  const waterBuckets = inventory.filter(
    (item) => item.type === getObjectIdByName("WaterBucket")!
  ).length;

  const wheatSeeds = inventory.filter(
    (item) => item.type === getObjectIdByName("WheatSeed")!
  ).length;

  const wheat = inventory.filter(
    (item) => item.type === getObjectIdByName("Wheat")!
  ).length;

  const slop = inventory.filter(
    (item) => item.type === getObjectIdByName("WheatSlop")!
  ).length;

  // Generate farm plots to count unwatered
  const farmPlots = await generateFarmPlots();
  let unwateredPlots = 0;
  let unharvestedPlots = 0;
  let unseededPlots = 0;
  for (const plot of farmPlots) {
    const type = await bot.world.getBlockType(plot);
    if (type === getObjectIdByName("Farmland")!) {
      unwateredPlots++;
    } else if (type === getObjectIdByName("WetFarmland")!) {
      // unharvestedPlots++;
      const typeAbove = await bot.world.getBlockType({
        x: plot.x,
        y: plot.y + 1,
        z: plot.z,
      });
      if (typeAbove === getObjectIdByName("Air")!) {
        unseededPlots++;
      } else if (typeAbove === getObjectIdByName("WheatSeed")!) {
        unharvestedPlots++;
      }
    }
  }

  return {
    location: determineLocation(position),
    position,
    emptyBuckets,
    waterBuckets,
    wheatSeeds,
    wheat,
    slop,
    unwateredPlots,
    unseededPlots,
    unharvestedPlots,
    totalPlots: farmPlots.length,
  };
}

// Utility Actions
const utilityActions: UtilityAction[] = [
  {
    name: "FILL_BUCKETS",
    canExecute: (state) => state.location === "coast" && state.emptyBuckets > 0,
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      // Basically if we're at the coast and have empty buckets, fill them.
      let score = 0;
      if (state.location === "coast") score += 9999;

      return score;
    },
    execute: async (bot) => await fillBuckets(bot),
  },

  {
    name: "WATER_PLOTS",
    canExecute: (state) =>
      state.location === "farm" &&
      state.waterBuckets > 0 &&
      state.unwateredPlots > 0,
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      let score = 0;
      if (state.location === "farm") score += 9999; // Basically if we're at the farm and have water buckets, water the plots.

      return score;
    },
    execute: async (bot) => {
      const farmPlots = await generateFarmPlots();
      await waterFarmPlots(bot, farmPlots);
    },
  },

  {
    name: "SEED_PLOTS",
    canExecute: (state) =>
      state.location === "farm" &&
      state.unseededPlots > 0 &&
      state.wheatSeeds > 0,
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      // Basically if we're at the farm, everything is watered, and we have seeds, seed the plots.
      let score = 9999;

      return score;
    },
    execute: async (bot) => {
      const farmPlots = await generateFarmPlots();
      await seedFarmPlots(bot, farmPlots);
    },
  },

  {
    name: "HARVEST_PLOTS",
    canExecute: (state) =>
      state.location === "farm" && state.unharvestedPlots > 0,
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      let score = 9999; // Basically if we're at the farm and there's unharvested plots, harvest the plots.

      return score;
    },
    execute: async (bot) => {
      const farmPlots = await generateFarmPlots();
      await harvestFarmPlots(bot, farmPlots);
    },
  },

  {
    name: "TRANSFER",
    canExecute: (state) => state.location === "farm",
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      let score = 0;
      score += 99 - state.wheatSeeds;
      // score += state.wheat;
      score += state.slop * 10;

      return score;
    },
    execute: async (bot) => {
      const currentState = await assessCurrentState(bot);
      if (currentState.wheatSeeds < 99) {
        const slot = await bot.inventory.getSlotForItemType(
          getObjectIdByName("WheatSeed")!
        );
        await bot.inventory.transferAmount(
          bot.player.characterEntityId,
          bot.player.characterEntityId,
          [[slot, 99 - currentState.wheatSeeds]]
        );
      }
      if (currentState.slop > 0) {
        const slot = await bot.inventory.getSlotForItemType(
          getObjectIdByName("WheatSlop")!
        );
        await bot.inventory.transferAmount(
          bot.player.characterEntityId,
          rightChestEntityId,
          [[slot, currentState.slop]]
        );
      }
    },
  },

  {
    name: "CRAFT_SLOP",
    canExecute: (state) => state.wheat >= 16,
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      let score = 9999;

      return score;
    },
    execute: async (bot) => {
      const wheatSlot = await bot.inventory.getSlotForItemType(
        getObjectIdByName("Wheat")!
      );
      await bot.crafting.craft(bot.crafting.recipes["WheatSlop"].id, [
        [wheatSlot, 16],
      ]);
    },
  },

  {
    name: "MOVE_TO_COAST",
    canExecute: (state) => state.location !== "coast" && state.emptyBuckets > 0,
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      let score = 15;

      const distanceFromCoast = calculateDistance(
        state.position,
        coastPosition
      );
      score -= distanceFromCoast * 0.1; // Prefer shorter trips

      // Higher priority if we're out of water entirely
      if (state.waterBuckets === 0 && state.unwateredPlots > 0) score += 20;

      return score;
    },
    execute: async (bot) => {
      await walkToHouse(bot);
      await walkToCoast(bot);
    },
  },

  {
    name: "MOVE_TO_FARM",
    canExecute: (state) => state.location !== "farm" && state.waterBuckets > 0,
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      let score = 0; // Base movement value
      const distanceFromFarm = calculateDistance(state.position, farmCenter);
      score -= distanceFromFarm * 0.1; // Prefer shorter trips

      // Higher priority if we have lots of water
      score += state.waterBuckets * 2;

      return score;
    },
    execute: async (bot) => {
      await walkToHouse(bot);
      await walkToFarmCenter(bot);
    },
  },
];

// Decision Engine
async function selectBestAction(state: BotState): Promise<UtilityAction> {
  const scoredActions = utilityActions
    .map((action) => ({
      action,
      score: action.calculateScore(state),
    }))
    .sort((a, b) => b.score - a.score);

  console.log("\n🤖 Action Scores:");
  scoredActions.forEach((item) =>
    console.log(`  ${item.action.name}: ${item.score.toFixed(1)}`)
  );

  if (scoredActions.length === 0) {
    throw new Error("No valid actions available!");
  }

  return scoredActions[0].action;
}

async function logCurrentState(state: BotState): Promise<void> {
  console.log("\n📊 Current State:");
  console.log(`  Location: ${state.location}`);
  console.log(
    `  Position: (${state.position.x}, ${state.position.y}, ${state.position.z})`
  );
  console.log(`  Empty Buckets: ${state.emptyBuckets}`);
  console.log(`  Water Buckets: ${state.waterBuckets}`);
  console.log(`  Wheat: ${state.wheat}`);
  console.log(`  Slop: ${state.slop}`);
  console.log(`  Wheat Seeds: ${state.wheatSeeds}`);
  console.log(`  Unwatered Plots: ${state.unwateredPlots}/${state.totalPlots}`);
  console.log(`  Unseeded Plots: ${state.unseededPlots}/${state.totalPlots}`);
  console.log(
    `  Unharvested Plots: ${state.unharvestedPlots}/${state.totalPlots}`
  );
}

// Function declarations (keeping existing atomic functions)
async function walkToCoast(bot: DustBot) {
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

async function fillBuckets(bot: DustBot) {
  console.log("=".repeat(60));
  console.log("🪣 FILLING BUCKETS WITH WATER");
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

async function walkToFarmCenter(bot: DustBot) {
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

  // Water plots one by one until we run out of water or plots
  for (const plot of farmPlots) {
    console.log("watering plot", plot);
    const inventory = await bot.inventory.getInventory();
    console.log("got inventory");

    const waterBucketId = getObjectIdByName("WaterBucket")!;
    const waterBucketCount = inventory.filter(
      (item) => item.type === waterBucketId
    ).length;

    if (waterBucketCount === 0) {
      console.log("🪣 Out of water buckets - stopping watering");
      break;
    }

    const plotType = await bot.world.getBlockType(plot);
    if (plotType !== getObjectIdByName("Farmland")!) {
      continue; // Skip already watered or non-farmland plots
    }

    try {
      await bot.farming.wetFarmland(plot);
      console.log(
        `✅ Successfully watered plot at (${plot.x}, ${plot.y}, ${plot.z})`
      );
    } catch (error) {
      console.log(
        `⚠️ Failed to water plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  }
}

async function seedFarmPlots(bot: DustBot, farmPlots: Vec3[]) {
  console.log("=".repeat(60));
  console.log("🚜 SEEDING FARM PLOTS");
  console.log("=".repeat(60));

  // Water plots one by one until we run out of water or plots
  for (const plot of farmPlots) {
    console.log("seeding plot", plot);
    const inventory = await bot.inventory.getInventory();

    const seedId = getObjectIdByName("WheatSeed")!;
    const seedCount = inventory.filter((item) => item.type === seedId).length;

    if (seedCount === 0) {
      console.log("🪣 Out of seeds - stopping seeding");
      break;
    }

    const plotType = await bot.world.getBlockType(plot);
    if (plotType !== getObjectIdByName("WetFarmland")!) {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - not wet farmland`
      );
      continue; // Skip can only seed on wet farmland
    }

    const plotType2 = await bot.world.getBlockType({
      x: plot.x,
      y: plot.y + 1,
      z: plot.z,
    });
    console.log("plotType2", ObjectTypes[plotType2]);
    if (plotType2 === getObjectIdByName("WheatSeed")!) {
      console.log(
        `⚠️ Skipping plot at (${plot.x}, ${plot.y}, ${plot.z}) - already has wheat`
      );
      continue; // Skip can only seed where these isnt wheat already
    }

    try {
      await bot.farming.plantSeedType(plot, seedId);
      console.log(
        `✅ Successfully seeded plot at (${plot.x}, ${plot.y}, ${plot.z})`
      );
    } catch (error) {
      console.log(
        `⚠️ Failed to seed plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  }
}

async function harvestFarmPlots(bot: DustBot, farmPlots: Vec3[]) {
  console.log("=".repeat(60));
  console.log("🚜 HARVESTING FARM PLOTS");
  console.log("=".repeat(60));

  // Harvest plots one by one until we run out of plots
  for (const plot of farmPlots) {
    try {
      await bot.farming.harvest(plot);
      console.log(
        `✅ Successfully harvested plot at (${plot.x}, ${plot.y}, ${plot.z})`
      );
    } catch (error) {
      console.log(
        `⚠️ Failed to harvest plot at (${plot.x}, ${plot.y}, ${plot.z}) - ${error}`
      );
    }
  }
}

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

  // Utility-based main loop

  let loopCount = 0;
  const maxLoops = 50; // Safety limit

  while (loopCount < maxLoops) {
    loopCount++;

    // Assess current state
    const state = await assessCurrentState(bot);
    await logCurrentState(state);

    // Check if we're done
    // if (state.unwateredPlots === 0) {
    //   const completeAction = utilityActions.find((a) => a.name === "COMPLETE")!;
    //   await completeAction.execute(bot);
    //   break;
    // }

    // Select and execute best action
    const bestAction = await selectBestAction(state);
    console.log(`\n🎯 Executing: ${bestAction.name}`);

    try {
      await bestAction.execute(bot);
      console.log(`✅ Completed: ${bestAction.name}`);
    } catch (error) {
      console.error(`❌ Failed to execute ${bestAction.name}:`, error);
      throw error;
    }
  }

  if (loopCount >= maxLoops) {
    console.error("❌ Loop limit reached - something may be wrong!");
  }
}

// Run the demo
main().catch(console.error);
