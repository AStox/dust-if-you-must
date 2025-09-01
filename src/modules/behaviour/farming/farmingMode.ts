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
} from "./farmingOperations.js";
import { getOperationalConfig } from "../../../config/loader.js";
import {
  InventoryManager,
  InventoryManagementConfig,
} from "../shared/inventoryManager.js";
import { distance, getItemCount } from "../../../utils.js";
import { get } from "http";

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
        const emptyBucketCount = getItemCount(getObjectIdByName("Bucket"), state.inventory);
        const hasEmptyBuckets = emptyBucketCount > 0;
        
        const canExecute = hasEmptyBuckets;
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`FILL_BUCKETS: emptyBuckets=${emptyBucketCount}, hasEmptyBuckets=${hasEmptyBuckets} → canExecute=${canExecute}`);
        }
        
        return canExecute;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9999; // High priority when at coast with empty buckets
      },
      execute: async (bot, state) => {
        const areas = getFarmingAreas();
        await bot.movement.pathTo(areas.coastPosition);
        await fillBuckets(bot)
      },
    },

    {
      name: "WATER_PLOTS",
      canExecute: (state) => {
        const bucketCount = getItemCount(getObjectIdByName("WaterBucket"), state.inventory);
        const hasBuckets = bucketCount > 0;
        const unwateredPlots = state.unwateredPlots || 0;
        const hasUnwateredPlots = unwateredPlots > 0;
        
        const canExecute = hasBuckets && hasUnwateredPlots;
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`WATER_PLOTS: WaterBuckets=${bucketCount}, hasBuckets=${hasBuckets}, unwateredPlots=${unwateredPlots}, hasUnwateredPlots=${hasUnwateredPlots} → canExecute=${canExecute}`);
        }
        
        return canExecute;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9996; // High priority when at farm with water and unwatered plots
      },
      execute: async (bot, state) => {
        const areas = getFarmingAreas();
        await bot.movement.pathTo(areas.farmCenter);
        const farmPlots = await generateFarmPlots();
        await waterFarmPlots(bot, farmPlots, getItemCount(getObjectIdByName("WaterBucket"), state.inventory));
      },
    },

    {
      name: "SEED_PLOTS",
      canExecute: (state) => {
        const unseededPlots = state.unseededPlots || 0;
        const hasUnseededPlots = unseededPlots > 0;
        const seedCount = getItemCount(getObjectIdByName("WheatSeed"), state.inventory);
        const hasSeeds = seedCount > 0;
        
        const canExecute = hasUnseededPlots && hasSeeds;
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`SEED_PLOTS: unseededPlots=${unseededPlots}, hasUnseededPlots=${hasUnseededPlots}, seeds=${seedCount}, hasSeeds=${hasSeeds} → canExecute=${canExecute}`);
        }
        
        return canExecute;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9997; // High priority when at farm with seeds and unseeded plots
      },
      execute: async (bot, state) => {
        const areas = getFarmingAreas();
        await bot.movement.pathTo(areas.farmCenter);
        const farmPlots = await generateFarmPlots();
        await seedFarmPlots(bot, farmPlots, state.inventory);
      },
    },

    {
      name: "GROW_SEEDED_PLOTS",
      canExecute: (state) => {
        const ungrownPlots = state.ungrownPlots || 0;
        const hasUngrownPlots = ungrownPlots > 0;
        
        const canExecute = hasUngrownPlots;
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`GROW_SEEDED_PLOTS: ungrownPlots=${ungrownPlots}, hasUngrownPlots=${hasUngrownPlots} → canExecute=${canExecute}`);
        }
        
        return canExecute;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9998; // High priority for growing
      },
      execute: async (bot, state) => {
        const areas = getFarmingAreas();
        await bot.movement.pathTo(areas.farmCenter);
        const farmPlots = await generateFarmPlots();
        await growSeededFarmPlots(bot, farmPlots);
      },
    },

    {
      name: "HARVEST_PLOTS",
      canExecute: (state) => {
        const unharvestedPlots = state.unharvestedPlots || 0;
        const hasUnharvestedPlots = unharvestedPlots > 0;
        
        const canExecute = hasUnharvestedPlots;
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`HARVEST_PLOTS: unharvestedPlots=${unharvestedPlots}, hasUnharvestedPlots=${hasUnharvestedPlots} → canExecute=${canExecute}`);
        }
        
        return canExecute;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9999; // Highest priority - harvest when ready
      },
      execute: async (bot, state) => {
        const areas = getFarmingAreas();
        await bot.movement.pathTo(areas.farmCenter);
        const farmPlots = await generateFarmPlots();
        await harvestFarmPlots(bot, farmPlots);
      },
    },

    {
      name: "MANAGE_INVENTORY",
      canExecute: (state) => {
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

        const nonFarmingItems = state.inventory.filter(
          (item) => !allowedItems.has(item.type) && item.amount > 0
        );
        const hasNonFarmingItems = nonFarmingItems.length > 0;

        // Check if we need items from chest
        const bucketsInChest = getItemCount(bucketId, state.chestInventory);
        const waterBucketsInChest = getItemCount(waterBucketId, state.chestInventory);
        const seedsInChest = getItemCount(wheatSeedId, state.chestInventory);
        const wheatInChest = getItemCount(wheatId, state.chestInventory);

        const currentBuckets = getItemCount(bucketId, state.inventory) + getItemCount(waterBucketId, state.inventory);
        const needBuckets =
          currentBuckets < params.targetBuckets &&
          (bucketsInChest + waterBucketsInChest) > 0;
        const currentSeedsInInventory = getItemCount(wheatSeedId, state.inventory);
        const needSeeds =
          currentSeedsInInventory < params.targetSeeds && seedsInChest > 0;
        const currentWheatInInventory = getItemCount(wheatId, state.inventory);
        const needWheat =
          currentWheatInInventory < params.targetWheat && wheatInChest >= 16;

        const shouldManage =
          hasNonFarmingItems ||
          needBuckets ||
          needSeeds ||
          needWheat;

        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`MANAGE_INVENTORY: hasNonFarmingItems=${hasNonFarmingItems} (${nonFarmingItems.length} items), currentBuckets=${currentBuckets}/${params.targetBuckets}, needBuckets=${needBuckets} (chest: ${bucketsInChest + waterBucketsInChest}), currentSeeds=${currentSeedsInInventory}/${params.targetSeeds}, needSeeds=${needSeeds} (chest: ${seedsInChest}), currentWheat=${currentWheatInInventory}/${params.targetWheat}, needWheat=${needWheat} (chest: ${wheatInChest}) → canExecute=${shouldManage}`);
        }

        return shouldManage;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;

        // High priority for inventory management - farming needs proper setup
        let score = 5000;

        // Higher priority if we have slop (cleanup)
        if (getItemCount(getObjectIdByName("WheatSlop"), state.inventory) > 0) {
          score += 1000;
        }

        return score;
      },
      execute: async (bot, state) => {
        const areas = getFarmingAreas();
        bot.movement.pathTo(areas.farmCenter);
        const config = getFarmingInventoryConfig();
        await InventoryManager.manageInventory(bot, config);
      },
    },

    {
      name: "CRAFT_SLOP",
      canExecute: (state) => {
        const wheatCount = getItemCount(getObjectIdByName("Wheat"), state.inventory);
        const hasEnoughWheat = wheatCount >= 16;
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`CRAFT_SLOP: wheatCount=${wheatCount}, hasEnoughWheat=${hasEnoughWheat} (need >= 16) → canExecute=${hasEnoughWheat}`);
        }
        
        return hasEnoughWheat;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9999; // High priority when have enough wheat
      },
      execute: async (bot, state) => {
        const wheatSlot = await bot.inventory.getSlotForItemType(
          getObjectIdByName("Wheat")!
        );
        await bot.crafting.craft(bot.crafting.recipes["WheatSlop"].id, [
          [wheatSlot[0], 16],
        ]);
      },
    },

    // {
    //   name: "MOVE_TO_COAST",
    //   canExecute: (state) => {
    //     const location = determineFarmingLocation(state.position);
    //     const notAtCoast = location !== "coast";
    //     const emptyBucketCount = getItemCount(getObjectIdByName("Bucket"), state.inventory);
    //     const hasEmptyBuckets = emptyBucketCount > 0;
        
    //     const canExecute = notAtCoast && hasEmptyBuckets;
        
    //     if (typeof global !== 'undefined' && global.debugLog) {
    //       global.debugLog(`MOVE_TO_COAST: location=${location}, notAtCoast=${notAtCoast}, emptyBuckets=${emptyBucketCount}, hasEmptyBuckets=${hasEmptyBuckets} → canExecute=${canExecute}`);
    //     }
        
    //     return canExecute;
    //   },
    //   calculateScore: function (state) {
    //     if (!this.canExecute(state)) return 0;
    //     let score = 15;
    //     const areas = getFarmingAreas();
    //     const distanceFromCoast = distance(
    //       state.position,
    //       areas.coastPosition
    //     );

    //     // Higher priority if we're out of water entirely
    //     if (getItemCount(getObjectIdByName("Bucket"), state.inventory) === 0 && state.unwateredPlots > 0) score += 20;
    //     return score;
    //   },
    //   execute: async (bot, state) => {
    //     const areas = getFarmingAreas();
    //     await bot.movement.pathTo(areas.coastPosition);
    //   },
    // },

    // {
    //   name: "MOVE_TO_FARM",
    //   canExecute: (state) => {
    //     const notAtFarm = determineFarmingLocation(state.position) !== "farm";
    //     const waterBuckets = getItemCount(getObjectIdByName("WaterBucket"), state.inventory);
    //     const hasWaterBuckets = waterBuckets > 0;
        
    //     const canExecute = notAtFarm && hasWaterBuckets;
        
    //     if (typeof global !== 'undefined' && global.debugLog) {
    //       global.debugLog(`MOVE_TO_FARM: location=${determineFarmingLocation(state.position)}, notAtFarm=${notAtFarm}, waterBuckets=${waterBuckets}, hasWaterBuckets=${hasWaterBuckets} → canExecute=${canExecute}`);
    //     }
        
    //     return canExecute;
    //   },
    //   calculateScore: function (state) {
    //     if (!this.canExecute(state)) return 0;
    //     let score = 0;
    //     const areas = getFarmingAreas();
    //     const distanceFromFarm = distance(
    //       state.position,
    //       areas.farmCenter
    //     );
    //     score -= distanceFromFarm * 0.1; // Prefer shorter trips
    //     score += state.waterBuckets * 2; // Higher priority with more water
    //     return score;
    //   },
    //   execute: async (bot, state) => {
    //     await walkToHouse(bot);
    //     await walkToFarmCenter(bot);
    //   },
    // },
    // {
    //   name: "GET_TO_KNOWN_LOCATION",
    //   canExecute: (state) => {
    //     const location = determineFarmingLocation(state.position);
    //     const isUnknownLocation = location === "unknown";
        
    //     if (typeof global !== 'undefined' && global.debugLog) {
    //       global.debugLog(`GET_TO_KNOWN_LOCATION: location=${location}, isUnknownLocation=${isUnknownLocation} → canExecute=${isUnknownLocation}`);
    //     }
        
    //     return isUnknownLocation;
    //   },
    //   calculateScore: function (state) {
    //     if (!this.canExecute(state)) return 0;
    //     return 500; // Medium-high priority - important to get to a known location
    //   },
    //   execute: async (bot, state) => {
    //     const areas = getFarmingAreas();
    //     console.log(
    //       `🎯 Navigating to farm center: (${areas.farmCenter.x}, ${areas.farmCenter.z})`
    //     );

    //     try {
    //       console.log("🔄 Starting pathfinding to farm center");
    //       await bot.movement.pathTo({
    //         x: areas.farmCenter.x,
    //         y: areas.farmCenter.y,
    //         z: areas.farmCenter.z,
    //       });
    //       console.log("✅ Successfully reached farm center area");
    //     } catch (error) {
    //       console.error("❌ Failed to reach farm center:", error);
    //       throw error;
    //     }
    //   },
    // },
  ];

  async isAvailable(state: BotState): Promise<boolean> {
    // Clear cache for fresh evaluation
    this.actionExecutionCache.clear();
    
    // Check if any action can execute and cache the results
    const executableActions = [];
    for (const action of this.actions) {
      const canExecute = action.canExecute(state);
      this.actionExecutionCache.set(action.name, canExecute);
      if (canExecute) {
        executableActions.push(action.name);
      }
    }
    
    // Filter out MANAGE_INVENTORY for availability check - it's always available but not real work
    const productiveActions = executableActions.filter(name => name !== "MANAGE_INVENTORY");
    const available = productiveActions.length > 0;
    
    console.log(
      `${available? '✅' : '❌'} FARMING: executableActions=[${executableActions.join(', ')}], productive=[${productiveActions.join(', ')}]`
    );

    return available;
  }

  // Override selectAction to use cached results and prioritize non-inventory actions
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

    // Prioritize non-inventory actions - if any are available, exclude MANAGE_INVENTORY
    const nonInventoryActions = executableActions.filter(action => action.name !== "MANAGE_INVENTORY");
    const actionsToScore = nonInventoryActions.length > 0 ? nonInventoryActions : executableActions;

    console.log(`📋 Considering ${actionsToScore.length} actions: [${actionsToScore.map(a => a.name).join(', ')}]`);
    if (nonInventoryActions.length > 0 && executableActions.length > nonInventoryActions.length) {
      console.log(`🎯 Prioritizing non-inventory actions (found ${nonInventoryActions.length})`);
    }

    // Calculate scores for selected actions
    const scoredActions = actionsToScore.map(action => ({
      action,
      score: action.calculateScore(state)
    }));

    // Sort by score descending
    scoredActions.sort((a, b) => b.score - a.score);

    for (const { action, score } of scoredActions.slice(0, 3)) {
      console.log(`  ${action.name}: ${score}`);
    }

    return scoredActions[0].action;
  }

  async assessState(bot: DustBot): Promise<Partial<BotState>> {

    // Generate farm plots to count unwatered
    const farmPlots = await generateFarmPlots();

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

    const state = {
      unwateredPlots,
      unseededPlots,
      ungrownPlots,
      unharvestedPlots,
      totalPlots: farmPlots.length,
    };

    return state;
  }
}