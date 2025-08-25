import { DustBot } from "../../../index.js";
import { BotState, UtilityAction, Vec3 } from "../../../types/base.js";
import { getObjectIdByName, ObjectTypes } from "../../../types/objectTypes.js";
import { BaseBehaviorMode } from "../behaviorMode.js";
import { TreesModule } from "../../trees.js";
import { PathfindingModule } from "../../pathfinding.js";
import { getOperationalConfig } from "../../../config/loader.js";
import {
  isInTreeFarm,
  hasAxe,
  getAxeTypeIds,
  getExcludedItemTypeIds,
  mineTreeFarmVolume,
  walkToTreeFarm,
  setupEnergizeInventory,
  hasAvailableTreeBlocks,
  plantSaplings,
  hasExcessTreeMaterials,
  craftBatteriesAtPowerstone,
  hasPlantablePositions,
  mineTreeFarmChunk,
  plantSaplingsInChunk,
  hasAvailableTreeBlocksInChunk,
  hasPlantablePositionsInChunk,
  getEnergizeInventoryConfig,
} from "./energizeOperations.js";
import { InventoryManager } from "../shared/inventoryManager.js";
import { getItemCount } from "../../../utils.js";

// Energize-specific constants
export const MAX_ENERGY: number = 817600000000000000;
export const DEFAULT_OPERATION_DELAY = 2000; // milliseconds

/**
 * Energize behavior mode implementation
 */
export class EnergizeMode extends BaseBehaviorMode {
  readonly name = "ENERGIZE";
  protected priority = 80; // Medium priority - secondary to farming

  // Cache for action execution results to avoid duplicate calls
  private actionExecutionCache: Map<string, boolean> = new Map();

  private treesModule: TreesModule;
  private pathfindingModule: PathfindingModule;
  private currentChunk: number = 0; // Current chunk index (0-based)
  private totalChunks: number = 0; // Total number of chunks

  constructor() {
    super();
    this.treesModule = new TreesModule();
    this.pathfindingModule = new PathfindingModule();
    // Defer calculation until config is available
  }

  private calculateTotalChunks(): void {
    const config = getOperationalConfig();
    const chunkSize = config.areas.energize?.chunkSize || 25;
    if (!config.areas.energize?.treeFarmBounds) {
      this.totalChunks = 1;
      return;
    }

    const corner1 = config.areas.energize.treeFarmBounds.corner1;
    const corner2 = config.areas.energize.treeFarmBounds.corner2;

    const farmWidth = Math.abs(corner2.x - corner1.x) + 1;
    const farmDepth = Math.abs(corner2.z - corner1.z) + 1;

    const chunksX = Math.ceil(farmWidth / chunkSize);
    const chunksZ = Math.ceil(farmDepth / chunkSize);

    this.totalChunks = chunksX * chunksZ;
  }

  private getChunkBounds(chunkIndex: number): { corner1: Vec3; corner2: Vec3 } {
    const config = getOperationalConfig();
    const chunkSize = config.areas.energize?.chunkSize || 25;
    const farmCorner1 = config.areas.energize!.treeFarmBounds.corner1;
    const farmCorner2 = config.areas.energize!.treeFarmBounds.corner2;

    const farmMinX = Math.min(farmCorner1.x, farmCorner2.x);
    const farmMinZ = Math.min(farmCorner1.z, farmCorner2.z);
    const farmMaxX = Math.max(farmCorner1.x, farmCorner2.x);
    const farmMaxZ = Math.max(farmCorner1.z, farmCorner2.z);

    const farmWidth = farmMaxX - farmMinX + 1;
    const farmDepth = farmMaxZ - farmMinZ + 1;

    const chunksX = Math.ceil(farmWidth / chunkSize);
    const chunksZ = Math.ceil(farmDepth / chunkSize);

    const chunkX = chunkIndex % chunksX;
    const chunkZ = Math.floor(chunkIndex / chunksX);

    const chunkMinX = farmMinX + chunkX * chunkSize;
    const chunkMinZ = farmMinZ + chunkZ * chunkSize;
    const chunkMaxX = Math.min(chunkMinX + chunkSize - 1, farmMaxX);
    const chunkMaxZ = Math.min(chunkMinZ + chunkSize - 1, farmMaxZ);

    return {
      corner1: { x: chunkMinX, y: farmCorner1.y, z: chunkMinZ },
      corner2: { x: chunkMaxX, y: farmCorner2.y, z: chunkMaxZ },
    };
  }

  private nextChunk(): void {
    this.currentChunk = (this.currentChunk + 1) % this.totalChunks;
    console.log(
      `➡️ Advanced to chunk ${this.currentChunk + 1}/${this.totalChunks}`
    );
  }

  protected actions: UtilityAction[] = [
    {
      name: "MANAGE_INVENTORY",
      canExecute: (state) => {
        // Check if inventory needs setup (not exactly 1 axe, < 1 oak sapling, or other items)
        let axeCount = 0;
        let oakSaplingCount = 0;
        let otherItemCount = 0;

        // Items to exclude from "other items" count
        const excludedTypes = getExcludedItemTypeIds();
        const axeTypeIds = getAxeTypeIds();

        for (const item of state.inventory) {
          if (axeTypeIds.includes(item.type)) {
            axeCount += item.amount;
          } else if (item.type === getObjectIdByName("OakSapling")) {
            oakSaplingCount += item.amount;
          } else if (!excludedTypes.includes(item.type)) {
            otherItemCount += item.amount;
          }
        }
        const needsSetup =
          axeCount !== 1 || oakSaplingCount < 1 || otherItemCount > 0;

        if (!needsSetup) {
          if (typeof global !== 'undefined' && global.debugLog) {
            global.debugLog(`MANAGE_INVENTORY: axeCount=${axeCount} (need=1), oakSaplings=${oakSaplingCount} (need>=1), otherItems=${otherItemCount} (need=0), needsSetup=${needsSetup} → canExecute=false`);
          }
          return false;
        }

        // Check if chest has required items
        const axesInChest = getItemCount(getObjectIdByName("WoodenAxe"), state.chestInventory) +
          getItemCount(getObjectIdByName("CopperAxe"), state.chestInventory) +
          getItemCount(getObjectIdByName("IronAxe"), state.chestInventory) +
          getItemCount(getObjectIdByName("DiamondAxe"), state.chestInventory) +
          getItemCount(getObjectIdByName("NeptuniumAxe"), state.chestInventory)

        const saplingsInChest = getItemCount(getObjectIdByName("OakSapling"), state.chestInventory);

        const canSetup =
          (axeCount < 1 && axesInChest > 0) ||
          (oakSaplingCount < 1 && saplingsInChest > 0) ||
          otherItemCount > 0;

        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`MANAGE_INVENTORY: axeCount=${axeCount} (need=1), oakSaplings=${oakSaplingCount} (need>=1), otherItems=${otherItemCount} (need=0), needsSetup=${needsSetup}, axesInChest=${axesInChest}, saplingsInChest=${saplingsInChest}, canSetup=${canSetup} → canExecute=${canSetup}`);
        }

        return canSetup;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 10000; // Highest priority - must setup inventory first
      },
      execute: async (bot, state) => {
        const config = getEnergizeInventoryConfig();
        await InventoryManager.manageInventory(bot, config);
      },
    },

    {
      name: "MINE_TREE_FARM",
      canExecute: (state) => {
        const playerHasAxe = hasAxe(state.inventory);
        const hasTreeBlocks = state.nearbyTreeBlocks || false;
        const canExecute = playerHasAxe && hasTreeBlocks;
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`MINE_TREE_FARM: playerHasAxe=${playerHasAxe}, hasTreeBlocks=${hasTreeBlocks} → canExecute=${canExecute}`);
        }
        
        return canExecute;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9999; // High priority when in chunk with axe and tree blocks
      },
      execute: async (bot, state) => {
        const chunkBounds = this.getChunkBounds(this.currentChunk);
        await mineTreeFarmChunk(bot, chunkBounds);
      },
    },
    {
      name: "PLANT_SAPLINGS",
      canExecute: (state) => {
        const saplingItem = state.inventory.find(
          (item) =>
            item.type === getObjectIdByName("OakSapling") && item.amount > 0
        );
        const hasOakSaplings = !!saplingItem;
        const saplingCount = saplingItem?.amount || 0;
        const hasPlantable = state.hasPlantablePositions || false;
        const canExecute = hasOakSaplings && hasPlantable;
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`PLANT_SAPLINGS: oakSaplings=${saplingCount}, hasOakSaplings=${hasOakSaplings}, hasPlantablePositions=${hasPlantable} → canExecute=${canExecute}`);
        }
        
        return canExecute;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 3000; // Lower priority - maintenance action
      },
      execute: async (bot, state) => {
        const chunkBounds = this.getChunkBounds(this.currentChunk);
        await plantSaplingsInChunk(bot, chunkBounds);
      },
    },

    {
      name: "CRAFT_BATTERIES",
      canExecute: (state) => {
        const hasExcessMaterials = hasExcessTreeMaterials(state.inventory);
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`CRAFT_BATTERIES: hasExcessMaterials=${hasExcessMaterials} → canExecute=${hasExcessMaterials}`);
        }
        
        return hasExcessMaterials;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 1000; // Lowest priority - only when nothing else to do
      },
      execute: async (bot, state) => {
        await craftBatteriesAtPowerstone(bot);
      },
    },

    {
      name: "ADVANCE_CHUNK",
      canExecute: (state) => {
        // Check if current chunk has no more actions available
        const hasTreeBlocks = state.nearbyTreeBlocks || false;
        const hasPlantable = state.hasPlantablePositions || false;
        const saplingItem = state.inventory.find(
          (item) =>
            item.type === getObjectIdByName("OakSapling") && item.amount > 0
        );
        const hasOakSaplings = !!saplingItem;
        const saplingCount = saplingItem?.amount || 0;

        const noMoreActions =
          !hasTreeBlocks && (!hasPlantable || !hasOakSaplings);
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`ADVANCE_CHUNK: hasTreeBlocks=${hasTreeBlocks}, hasPlantable=${hasPlantable}, oakSaplings=${saplingCount}, hasOakSaplings=${hasOakSaplings}, noMoreActions=${noMoreActions} → canExecute=${noMoreActions}`);
        }
        
        return noMoreActions;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 500; // Lower priority - only when no other actions possible
      },
      execute: async (bot, state) => {
        console.log(
          `✅ Chunk ${this.currentChunk + 1} completed, advancing to next chunk`
        );
        this.nextChunk();
      },
    },
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
      `${available? '✅' : '❌'} ENERGIZE: executableActions=[${executableActions.join(', ')}], productive=[${productiveActions.join(', ')}]`
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
      console.log("⚠️ No executable actions found in ENERGIZE mode");
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
    // Initialize total chunks if not done yet
    if (this.totalChunks === 0) {
      this.calculateTotalChunks();
    }

    // Check chunk-specific conditions
    const chunkBounds = this.getChunkBounds(this.currentChunk);
    const nearbyTreeBlocks = await hasAvailableTreeBlocksInChunk(bot, chunkBounds);
    const hasPlantable = await hasPlantablePositionsInChunk(bot, chunkBounds);

    const state = {
      nearbyTreeBlocks,
      hasPlantablePositions: hasPlantable,
    } as Partial<BotState>;
    return state;
  }

  getPriority(): number {
    return this.priority;
  }

  getActions(): UtilityAction[] {
    return this.actions;
  }
}