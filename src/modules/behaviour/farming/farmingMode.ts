import { DustBot } from "../../../index.js";
import {
  EntityId,
  Vec3,
  BotState,
  UtilityAction,
} from "../../../types/base.js";
import { getObjectIdByName } from "../../../types/objectTypes.js";
import { BaseBehaviorMode } from "../behaviorMode.js";
import {
  fillBuckets,
  walkToHouse,
  walkToCoast,
  walkToFarmCenter,
  generateFarmPlots,
  waterFarmPlots,
  seedFarmPlots,
  harvestFarmPlots,
  growSeededFarmPlots,
  transferToFromChest,
} from "./farmingOperations.js";
import { getOperationalConfig } from "../../../config/loader.js";
import {
  InventoryManager,
  InventoryManagementConfig,
} from "../shared/inventoryManager.js";

// Farming-specific constants
export const MAX_ENERGY: number = 817600000000000000;
export const DEFAULT_OPERATION_DELAY = 4000; // milliseconds

/**
 * Get farming areas from configuration
 */
export function getFarmingAreas() {
  const config = getOperationalConfig();
  const farming = config.areas.farming;

  return {
    coastPosition: farming.coastPosition,
    waterPosition: farming.waterSource,
    farmCenter: farming.farmCenter,
    housePosition: farming.housePosition,
    farmCorner1: farming.farmBounds.corner1,
    farmCorner2: farming.farmBounds.corner2,
  };
}

/**
 * Get entity IDs from configuration
 */
export function getEntityIds() {
  const config = getOperationalConfig();
  return {
    rightChestEntityId: config.entities.chests.rightChest,
    leftChestEntityId: config.entities.chests.leftChest,
  };
}

/**
 * Get farming parameters from configuration
 */
export function getFarmingParameters() {
  const config = getOperationalConfig();
  return {
    locationThreshold: config.parameters.locationThreshold,
    targetBuckets: config.parameters.farming.targetBuckets,
    targetSeeds: config.parameters.farming.targetSeeds,
    targetWheat: config.parameters.farming.targetWheat,
    lowEnergyThreshold: config.parameters.farming.lowEnergyThreshold,
  };
}

/**
 * Get farming inventory management configuration
 */
export function getFarmingInventoryConfig(): InventoryManagementConfig {
  const params = getFarmingParameters();
  const bucketId = getObjectIdByName("Bucket")!;
  const waterBucketId = getObjectIdByName("WaterBucket")!;
  const wheatSeedId = getObjectIdByName("WheatSeed")!;
  const wheatId = getObjectIdByName("Wheat")!;
  const slopId = getObjectIdByName("WheatSlop")!;

  return {
    allowedItems: [bucketId, waterBucketId, wheatSeedId, wheatId, slopId, 0], // 0 for empty slots
    requiredItems: [
      { type: bucketId, min: 1 }, // Need at least 1 bucket
    ],
    targetItems: [
      { type: bucketId, target: params.targetBuckets },
      { type: wheatSeedId, target: params.targetSeeds },
      { type: wheatId, target: params.targetWheat },
      { type: slopId, target: 0, max: 0 }, // Always store slop in chest
    ],
  };
}

// Legacy exports for backward compatibility (deprecated)
/** @deprecated Use getFarmingAreas().coastPosition instead */
export const coastPosition: Vec3 = { x: -443, y: 63, z: 489 };
/** @deprecated Use getFarmingAreas().waterPosition instead */
export const waterPosition: Vec3 = { x: -444, y: 62, z: 489 };
/** @deprecated Use getFarmingAreas().farmCenter instead */
export const farmCenter: Vec3 = { x: -401, y: 72, z: 483 }; // Also chest position
/** @deprecated Use getFarmingAreas().housePosition instead */
export const housePosition: Vec3 = { x: -401, y: 72, z: 489 };
/** @deprecated Use getFarmingAreas().farmCorner1 instead */
export const farmCorner1: Vec3 = { x: -405, y: 72, z: 479 };
/** @deprecated Use getFarmingAreas().farmCorner2 instead */
export const farmCorner2: Vec3 = { x: -398, y: 72, z: 486 };
/** @deprecated Use getFarmingParameters().locationThreshold instead */
export const LOCATION_THRESHOLD = 1; // blocks

// Utility Functions
function calculateDistance(pos1: Vec3, pos2: Vec3): number {
  return Math.sqrt(
    Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.y - pos2.y, 2) +
      Math.pow(pos1.z - pos2.z, 2)
  );
}

function determineFarmingLocation(
  position: Vec3
): "coast" | "house" | "farm" | "unknown" {
  const areas = getFarmingAreas();
  const params = getFarmingParameters();

  const distanceToCoast = calculateDistance(position, areas.coastPosition);
  const distanceToHouse = calculateDistance(position, areas.housePosition);
  const distanceToFarm = calculateDistance(position, areas.farmCenter);

  const distances = [
    { location: "coast" as const, distance: distanceToCoast },
    { location: "house" as const, distance: distanceToHouse },
    { location: "farm" as const, distance: distanceToFarm },
  ];

  const closest = distances.reduce((min, current) =>
    current.distance < min.distance ? current : min
  );

  if (closest.distance <= params.locationThreshold) return closest.location;

  return "unknown";
}

/**
 * Farming behavior mode implementation
 */
export class FarmingMode extends BaseBehaviorMode {
  readonly name = "FARMING";
  protected priority = 100; // High priority - farming is primary mode

  // Cache for action execution results to avoid duplicate calls
  private actionExecutionCache: Map<string, boolean> = new Map();

  protected actions: UtilityAction[] = [
    {
      name: "FILL_BUCKETS",
      canExecute: (state) => {
        const atCoast = state.location === "coast";
        const hasEmptyBuckets = state.emptyBuckets > 0;
        return atCoast && hasEmptyBuckets;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9999; // High priority when at coast with empty buckets
      },
      execute: async (bot, state) => await fillBuckets(bot),
    },

    {
      name: "WATER_PLOTS",
      canExecute: (state) =>
        state.location === "farm" &&
        state.waterBuckets > 0 &&
        state.unwateredPlots > 0,
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9996; // High priority when at farm with water and unwatered plots
      },
      execute: async (bot, state) => {
        const farmPlots = await generateFarmPlots();
        await waterFarmPlots(bot, farmPlots, state.waterBuckets);
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
        return 9997; // High priority when at farm with seeds and unseeded plots
      },
      execute: async (bot, state) => {
        const farmPlots = await generateFarmPlots();
        await seedFarmPlots(bot, farmPlots, state.wheatSeeds, state.inventory);
      },
    },

    {
      name: "GROW_SEEDED_PLOTS",
      canExecute: (state) =>
        state.location === "farm" && state.ungrownPlots > 0,
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9998; // High priority for growing
      },
      execute: async (bot, state) => {
        const farmPlots = await generateFarmPlots();
        await growSeededFarmPlots(bot, farmPlots);
      },
    },

    {
      name: "HARVEST_PLOTS",
      canExecute: (state) =>
        state.location === "farm" && state.unharvestedPlots > 0,
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9999; // Highest priority - harvest when ready
      },
      execute: async (bot, state) => {
        const farmPlots = await generateFarmPlots();
        await harvestFarmPlots(bot, farmPlots);
      },
    },

    {
      name: "MANAGE_INVENTORY",
      canExecute: (state) => {
        if (state.location !== "farm") return false;

        const params = getFarmingParameters();
        const bucketId = getObjectIdByName("Bucket")!;
        const wheatSeedId = getObjectIdByName("WheatSeed")!;
        const wheatId = getObjectIdByName("Wheat")!;
        const waterBucketId = getObjectIdByName("WaterBucket")!;

        // Check for non-farming items that need to be stored
        const allowedItems = new Set([
          bucketId,
          waterBucketId,
          wheatSeedId,
          wheatId,
          0, // Empty slots
        ]);

        const hasNonFarmingItems = state.inventory.some(
          (item) => !allowedItems.has(item.type) && item.amount > 0
        );

        // Check if we need items from chest
        const bucketsInChest = state.chestInventory
          .filter(
            (item) => item.type === bucketId || item.type === waterBucketId
          )
          .reduce((acc, item) => acc + item.amount, 0);
        const seedsInChest = state.chestInventory
          .filter((item) => item.type === wheatSeedId)
          .reduce((acc, item) => acc + item.amount, 0);
        const wheatInChest = state.chestInventory
          .filter((item) => item.type === wheatId)
          .reduce((acc, item) => acc + item.amount, 0);

        const needBuckets =
          state.emptyBuckets + state.waterBuckets < params.targetBuckets &&
          bucketsInChest > 0;
        const needSeeds =
          state.wheatSeeds < params.targetSeeds && seedsInChest > 0;
        const needWheat =
          state.wheat < params.targetWheat && wheatInChest >= 16;
        const hasSlop = state.slop > 0;

        const shouldManage =
          hasNonFarmingItems ||
          needBuckets ||
          needSeeds ||
          needWheat ||
          hasSlop;

        return shouldManage;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;

        // High priority for inventory management - farming needs proper setup
        let score = 5000;

        // Higher priority if we have slop (cleanup)
        if (state.slop > 0) {
          score += state.slop * 100;
        }

        return score;
      },
      execute: async (bot, state) => {
        const config = getFarmingInventoryConfig();
        await InventoryManager.manageInventory(bot, config);
      },
    },

    {
      name: "CRAFT_SLOP",
      canExecute: (state) => state.wheat >= 16, // Need exactly 16 wheat for slop recipe
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9999; // High priority when have enough wheat
      },
      execute: async (bot, state) => {
        if (state.wheat < 16) {
          console.log(
            `⚠️ Not enough wheat to craft slop (have ${state.wheat}, need 16)`
          );
          return;
        }

        const wheatSlot = await bot.inventory.getSlotForItemType(
          getObjectIdByName("Wheat")!
        );
        await bot.crafting.craft(bot.crafting.recipes["WheatSlop"].id, [
          [wheatSlot[0], 16],
        ]);
      },
    },

    {
      name: "MOVE_TO_COAST",
      canExecute: (state) => {
        const notAtCoast = state.location !== "coast";
        const hasEmptyBuckets = state.emptyBuckets > 0;
        return notAtCoast && hasEmptyBuckets;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        let score = 15;
        const areas = getFarmingAreas();
        const distanceFromCoast = calculateDistance(
          state.position,
          areas.coastPosition
        );
        score -= distanceFromCoast * 0.1; // Prefer shorter trips

        // Higher priority if we're out of water entirely
        if (state.waterBuckets === 0 && state.unwateredPlots > 0) score += 20;
        return score;
      },
      execute: async (bot, state) => {
        await walkToHouse(bot);
        await walkToCoast(bot);
      },
    },

    {
      name: "MOVE_TO_FARM",
      canExecute: (state) =>
        state.location !== "farm" && state.waterBuckets > 0,
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        let score = 0;
        const areas = getFarmingAreas();
        const distanceFromFarm = calculateDistance(
          state.position,
          areas.farmCenter
        );
        score -= distanceFromFarm * 0.1; // Prefer shorter trips
        score += state.waterBuckets * 2; // Higher priority with more water
        return score;
      },
      execute: async (bot, state) => {
        await walkToHouse(bot);
        await walkToFarmCenter(bot);
      },
    },
    {
      name: "GET_TO_KNOWN_LOCATION",
      canExecute: (state) => {
        const isUnknownLocation = state.location === "unknown";
        return isUnknownLocation;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 500; // Medium-high priority - important to get to a known location
      },
      execute: async (bot, state) => {
        const areas = getFarmingAreas();
        console.log(
          `🎯 Navigating to farm center: (${areas.farmCenter.x}, ${areas.farmCenter.z})`
        );

        try {
          await bot.movement.pathTo({
            x: areas.farmCenter.x,
            y: areas.farmCenter.y,
            z: areas.farmCenter.z,
          });
          console.log("✅ Successfully reached farm center area");
        } catch (error) {
          console.error("❌ Failed to reach farm center:", error);
          throw error;
        }
      },
    },
  ];

  async isAvailable(bot: DustBot): Promise<boolean> {
    // Clear cache for fresh evaluation
    this.actionExecutionCache.clear();
    
    // Get current state
    const state = await this.assessState(bot);
    
    // Check if any action can execute and cache the results
    const executableActions = [];
    for (const action of this.actions) {
      const canExecute = action.canExecute(state);
      this.actionExecutionCache.set(action.name, canExecute);
      if (canExecute) {
        executableActions.push(action.name);
      }
    }
    
    const available = executableActions.length > 0;
    
    console.log(
      `🔍 FARMING isAvailable: executableActions=[${executableActions.join(', ')}] → ${available}`
    );

    return available;
  }

  // Override selectAction to use cached results
  async selectAction(state: BotState): Promise<UtilityAction> {
    // If cache is empty, rebuild it
    if (this.actionExecutionCache.size === 0) {
      for (const action of this.actions) {
        const canExecute = action.canExecute(state);
        this.actionExecutionCache.set(action.name, canExecute);
      }
    }

    // Filter to only executable actions using cache
    const executableActions = this.actions.filter(action => 
      this.actionExecutionCache.get(action.name) === true
    );

    if (executableActions.length === 0) {
      console.log("⚠️ No executable actions found in FARMING mode");
      // Fall back to base class behavior which will throw an error
      return super.selectAction(state);
    }

    // Calculate scores for executable actions
    const scoredActions = executableActions.map(action => ({
      action,
      score: action.calculateScore(state)
    }));

    // Sort by score descending
    scoredActions.sort((a, b) => b.score - a.score);

    console.log("\n🎯 FARMING Action Selection:");
    for (const { action, score } of scoredActions.slice(0, 3)) {
      console.log(`  ${action.name}: ${score}`);
    }

    return scoredActions[0].action;
  }

  async assessState(bot: DustBot): Promise<BotState> {
    console.log("\n🔍 === FARMING STATE ASSESSMENT ===");

    const inventory = await bot.inventory.getInventory(
      bot.player.characterEntityId
    );
    const energy = Number(await bot.player.getPlayerEnergy());
    const position = await bot.player.getCurrentPosition();

    const bucketId = getObjectIdByName("Bucket");
    const waterBucketId = getObjectIdByName("WaterBucket");
    const wheatSeedId = getObjectIdByName("WheatSeed");
    const wheatId = getObjectIdByName("Wheat");
    const slopId = getObjectIdByName("WheatSlop");

    const emptyBuckets = inventory.filter(
      (item) => item.type === bucketId
    ).length;

    const waterBuckets = inventory.filter(
      (item) => item.type === waterBucketId
    ).length;

    const wheatSeeds = inventory
      .filter((item) => item.type === wheatSeedId)
      .reduce((acc, item) => acc + item.amount, 0);

    const wheat = inventory
      .filter((item) => item.type === wheatId)
      .reduce((acc, item) => acc + item.amount, 0);

    const slop = inventory
      .filter((item) => item.type === slopId)
      .reduce((acc, item) => acc + item.amount, 0);

    console.log("\n📊 Parsed inventory counts:");
    console.log(`  Empty Buckets: ${emptyBuckets}`);
    console.log(`  Water Buckets: ${waterBuckets}`);
    console.log(`  Wheat Seeds: ${wheatSeeds}`);
    console.log(`  Wheat: ${wheat}`);
    console.log(`  Slop: ${slop}`);

    console.log("\n📍 Position and location:");
    console.log(
      `  Raw position: (${position.x}, ${position.y}, ${position.z})`
    );
    const location = determineFarmingLocation(position);
    console.log(`  Determined location: ${location}`);

    console.log("\n🚰 Energy status:");
    console.log(
      `  Energy: ${energy} (${((energy / MAX_ENERGY) * 100).toFixed(1)}%)`
    );

    // Fetch chest inventory for better action decisions
    console.log("\n📦 Checking chest inventory...");
    const entityIds = getEntityIds();
    const chestInventory = await bot.inventory.getInventory(
      entityIds.rightChestEntityId
    );

    const bucketsInChest = chestInventory
      .filter((item) => item.type === bucketId || item.type === waterBucketId)
      .reduce((acc, item) => acc + item.amount, 0);

    const seedsInChest = chestInventory
      .filter((item) => item.type === wheatSeedId)
      .reduce((acc, item) => acc + item.amount, 0);

    const wheatInChest = chestInventory
      .filter((item) => item.type === wheatId)
      .reduce((acc, item) => acc + item.amount, 0);

    console.log(`  Chest buckets: ${bucketsInChest}`);
    console.log(`  Chest seeds: ${seedsInChest}`);
    console.log(`  Chest wheat: ${wheatInChest}`);

    // Generate farm plots to count unwatered
    console.log("\n🌾 Analyzing farm plots...");
    const farmPlots = await generateFarmPlots();
    console.log(`  Total farm plots to check: ${farmPlots.length}`);

    let unwateredPlots = 0;
    let unseededPlots = 0;
    let ungrownPlots = 0;
    let unharvestedPlots = 0;

    const plotAnalyses = await Promise.all(
      farmPlots.map(async (plot) => {
        const type = await bot.world.getBlockType(plot);
        const typeAbove = await bot.world.getBlockType({
          x: plot.x,
          y: plot.y + 1,
          z: plot.z,
        });

        const result = {
          unwatered: false,
          unseeded: false,
          ungrown: false,
          unharvested: false,
        };

        if (type === getObjectIdByName("Farmland")!) {
          result.unwatered = true;
          if (typeAbove === getObjectIdByName("Wheat")!) {
            result.unharvested = true;
          }
        } else if (type === getObjectIdByName("WetFarmland")!) {
          if (typeAbove === getObjectIdByName("Air")!) {
            result.unseeded = true;
          } else if (typeAbove === getObjectIdByName("WheatSeed")!) {
            const isReadyToGrow = await bot.farming.isPlantReadyToGrow({
              x: plot.x,
              y: plot.y + 1,
              z: plot.z,
            });
            if (isReadyToGrow) {
              result.ungrown = true;
            }
          }
        }

        return result;
      })
    );

    // Aggregate results
    for (const analysis of plotAnalyses) {
      if (analysis.unwatered) unwateredPlots++;
      if (analysis.unseeded) unseededPlots++;
      if (analysis.ungrown) ungrownPlots++;
      if (analysis.unharvested) unharvestedPlots++;
    }

    console.log("\n🏡 Farm plot analysis:");
    console.log(`  Unwatered plots: ${unwateredPlots}/${farmPlots.length}`);
    console.log(`  Unseeded plots: ${unseededPlots}/${farmPlots.length}`);
    console.log(`  Ungrown plots: ${ungrownPlots}/${farmPlots.length}`);
    console.log(`  Unharvested plots: ${unharvestedPlots}/${farmPlots.length}`);

    const state = {
      location: location as "coast" | "house" | "farm" | "unknown",
      position,
      energy,
      emptyBuckets,
      waterBuckets,
      wheatSeeds,
      wheat,
      slop,
      unwateredPlots,
      unseededPlots,
      ungrownPlots,
      unharvestedPlots,
      totalPlots: farmPlots.length,
      inventory,
      chestInventory,
    };

    console.log("\n✅ State assessment complete");
    return state;
  }
}

export async function logFarmingState(state: BotState): Promise<void> {
  console.log("\n📊 Farming Mode State:");
  console.log(`  Location: ${state.location}`);
  console.log(
    `  Position: (${state.position.x}, ${state.position.y}, ${state.position.z})`
  );
  console.log(
    `  Energy: ${state.energy} (${(state.energy / MAX_ENERGY) * 100}%)`
  );
  console.log(`  Empty Buckets: ${state.emptyBuckets}`);
  console.log(`  Water Buckets: ${state.waterBuckets}`);
  console.log(`  Wheat: ${state.wheat}`);
  console.log(`  Slop: ${state.slop}`);
  console.log(`  Wheat Seeds: ${state.wheatSeeds}`);
  console.log(`  Unwatered Plots: ${state.unwateredPlots}/${state.totalPlots}`);
  console.log(`  Unseeded Plots: ${state.unseededPlots}/${state.totalPlots}`);
  console.log(`  Ungrown Plots: ${state.ungrownPlots}/${state.totalPlots}`);
  console.log(
    `  Unharvested Plots: ${state.unharvestedPlots}/${state.totalPlots}`
  );
}
