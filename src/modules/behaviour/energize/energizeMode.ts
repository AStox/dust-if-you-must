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

// Energize-specific constants
export const MAX_ENERGY: number = 817600000000000000;
export const DEFAULT_OPERATION_DELAY = 2000; // milliseconds

/**
 * Energize behavior mode implementation
 */
export class EnergizeMode extends BaseBehaviorMode {
  readonly name = "ENERGIZE";
  protected priority = 80; // Medium priority - secondary to farming

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
    console.log(
      `🔢 Tree farm divided into ${this.totalChunks} chunks (${chunksX}x${chunksZ})`
    );
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
          console.log(
            `    📦 MANAGE_INVENTORY: Perfect inventory already (${axeCount} axes, ${oakSaplingCount} saplings, ${otherItemCount} other)`
          );
          return false;
        }

        // Check if chest has required items
        const axesInChest = state.chestInventory
          .filter((item) => axeTypeIds.includes(item.type))
          .reduce((acc, item) => acc + item.amount, 0);

        const saplingsInChest = state.chestInventory
          .filter((item) => item.type === getObjectIdByName("OakSapling"))
          .reduce((acc, item) => acc + item.amount, 0);

        const canSetup =
          (axeCount < 1 && axesInChest > 0) ||
          (oakSaplingCount < 1 && saplingsInChest > 0) ||
          otherItemCount > 0;

        console.log(
          `    📦 MANAGE_INVENTORY: need setup=${needsSetup}, chest has ${axesInChest} axes & ${saplingsInChest} saplings - canSetup=${canSetup}`
        );

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
        const hasTreeBlocks = (state as any).nearbyTreeBlocks;
        console.log(
          `    🪓 MINE_TREE_FARM: hasAxe=${playerHasAxe}, treeBlocks=${hasTreeBlocks}, chunk=${
            this.currentChunk + 1
          }/${this.totalChunks}`
        );
        return playerHasAxe && hasTreeBlocks;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9999; // High priority when in chunk with axe and tree blocks
      },
      execute: async (bot, state) => {
        const chunkBounds = this.getChunkBounds(this.currentChunk);
        console.log(
          `🪓 Mining chunk ${this.currentChunk + 1}/${this.totalChunks}: (${
            chunkBounds.corner1.x
          },${chunkBounds.corner1.z}) to (${chunkBounds.corner2.x},${
            chunkBounds.corner2.z
          })`
        );

        await mineTreeFarmChunk(bot, chunkBounds);
      },
    },
    {
      name: "PLANT_SAPLINGS",
      canExecute: (state) => {
        const hasOakSaplings = state.inventory.some(
          (item) =>
            item.type === getObjectIdByName("OakSapling") && item.amount > 0
        );
        const hasPlantable = (state as any).hasPlantablePositions;
        console.log(
          `    🌱 PLANT_SAPLINGS:  hasOakSaplings=${hasOakSaplings}, hasPlantable=${hasPlantable}, chunk=${
            this.currentChunk + 1
          }/${this.totalChunks}`
        );
        return hasOakSaplings && hasPlantable;
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
        console.log(
          `    🔋 CRAFT_BATTERIES: hasExcessMaterials=${hasExcessMaterials}`
        );
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
        const hasTreeBlocks = (state as any).nearbyTreeBlocks;
        const hasPlantable = (state as any).hasPlantablePositions;
        const hasOakSaplings = state.inventory.some(
          (item) =>
            item.type === getObjectIdByName("OakSapling") && item.amount > 0
        );

        const noMoreActions =
          !hasTreeBlocks && (!hasPlantable || !hasOakSaplings);
        console.log(
          `    ➡️ ADVANCE_CHUNK: noTreeBlocks=${!hasTreeBlocks}, noPlantable=${
            !hasPlantable || !hasOakSaplings
          }, chunk=${this.currentChunk + 1}/${this.totalChunks}`
        );
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

  async isAvailable(bot: DustBot): Promise<boolean> {
    // Energize mode is available if we have any axes/saplings OR there's tree work to do
    const inventory = await bot.inventory.getInventory(
      bot.player.characterEntityId
    );

    // Count axes and oak saplings
    let axeCount = 0;
    let oakSaplingCount = 0;

    for (const item of inventory) {
      if (
        item.type === getObjectIdByName("WoodenAxe") ||
        item.type === getObjectIdByName("StoneAxe") ||
        item.type === getObjectIdByName("IronAxe") ||
        item.type === getObjectIdByName("DiamondAxe")
      ) {
        axeCount += item.amount;
      } else if (item.type === getObjectIdByName("OakSapling")) {
        oakSaplingCount += item.amount;
      }
    }

    // Check if there are trees or saplings to work with
    const config = getOperationalConfig();

    try {
      const trees = await this.treesModule.scanForTrees(
        config.areas.energize!.treeFarmBounds.corner1,
        config.areas.energize!.treeFarmBounds.corner2
      );
      const saplings = await this.treesModule.scanForSaplings(
        config.areas.energize!.treeFarmBounds.corner1,
        config.areas.energize!.treeFarmBounds.corner2
      );

      const hasWork = trees.length > 0 || saplings.length > 0;

      // Available if we have any axes, or any saplings, or there's tree work to do
      return axeCount > 0 || oakSaplingCount > 0 || hasWork;
    } catch (error) {
      console.log("⚠️ Error checking for tree work:", error);
      // No fallbacks - throw the error to fail properly
      throw error;
    }
  }

  async assessState(bot: DustBot): Promise<BotState> {
    // Initialize total chunks if not done yet
    if (this.totalChunks === 0) {
      this.calculateTotalChunks();
    }

    const config = getOperationalConfig();
    //TODO: Why do we have 3 caches?
    this.pathfindingModule.clearCache();
    bot.world.clearCache();
    this.treesModule.clearCache();

    const inventory = await bot.inventory.getInventory(
      bot.player.characterEntityId
    );
    console.log(
      "📦 Player inventory:",
      inventory
        .filter((item) => item.amount > 0)
        .map((item) => `${ObjectTypes[item.type].name} x${item.amount}`)
        .join(", ") || "empty"
    );
    const chestInventory = await bot.inventory.getInventory(
      config.entities.chests?.rightChest
    );
    console.log(
      "📦 Right Chest Inventory",
      chestInventory
        .filter((item) => item.amount > 0)
        .map((item) => `${ObjectTypes[item.type].name} x${item.amount}`)
        .join(", ") || "empty"
    );

    const energy = Number(await bot.player.getPlayerEnergy());
    const position = await bot.player.getCurrentPosition();

    const axeTypes = ["WoodenAxe", "StoneAxe", "IronAxe", "DiamondAxe"];
    const oakSaplingId = getObjectIdByName("OakSapling");

    // Count items in inventory (only axes and oak saplings for energize mode)
    let axes = 0;
    let oakSaplings = 0;
    let otherItems = 0;

    // Use helper functions from operations
    const excludedTypes = getExcludedItemTypeIds();
    const axeTypeIds = getAxeTypeIds();

    for (const item of inventory) {
      if (axeTypeIds.includes(item.type)) {
        axes += item.amount;
      } else if (item.type === oakSaplingId) {
        oakSaplings += item.amount;
      } else if (!excludedTypes.includes(item.type)) {
        otherItems += item.amount;
      }
    }

    // // Scan for tree blocks using operations function
    // let nearbyTreeBlocks = false;
    // try {
    //   console.log("🔍 Checking for tree blocks...");
    //   const start = Date.now();
    //   nearbyTreeBlocks = await hasAvailableTreeBlocks(bot);
    //   const end = Date.now();
    //   console.log(`🔍 hasAvailableTreeBlocks took ${end - start}ms`);
    // } catch (error) {
    //   console.log("⚠️ Error scanning for tree blocks:", error);
    // }

    // // Check for plantable positions
    // let hasPlantable = false;
    // try {
    //   console.log("🔍 Checking for plantable positions...");
    //   const start = Date.now();
    //   hasPlantable = await hasPlantablePositions(bot);
    //   const end = Date.now();
    //   console.log(`🔍 hasPlantablePositions took ${end - start}ms`);
    // } catch (error) {
    //   console.log("⚠️ Error checking plantable positions:", error);
    // }

    // Check chunk-specific conditions
    const chunkBounds = this.getChunkBounds(this.currentChunk);
    console.log(
      `chunkBounds: ${chunkBounds.corner1.x}, ${chunkBounds.corner1.z} to ${chunkBounds.corner2.x}, ${chunkBounds.corner2.z}`
    );
    let nearbyTreeBlocks = false;
    let hasPlantable = false;

    try {
      console.log(
        `🔍 Checking chunk ${this.currentChunk + 1}/${
          this.totalChunks
        } for tree blocks...`
      );
      const start = Date.now();
      nearbyTreeBlocks = await hasAvailableTreeBlocksInChunk(bot, chunkBounds);
      const end = Date.now();
      console.log(`🔍 hasAvailableTreeBlocksInChunk took ${end - start}ms`);
    } catch (error) {
      console.log("⚠️ Error scanning chunk for tree blocks:", error);
    }

    try {
      console.log(
        `🔍 Checking chunk ${this.currentChunk + 1}/${
          this.totalChunks
        } for plantable positions...`
      );
      const start = Date.now();
      hasPlantable = await hasPlantablePositionsInChunk(bot, chunkBounds);
      const end = Date.now();
      console.log(`🔍 hasPlantablePositionsInChunk took ${end - start}ms, result: ${hasPlantable}`);
    } catch (error) {
      console.log("⚠️ Error checking chunk plantable positions:", error);
    }

    const state = {
      location: "unknown",
      position,
      energy,
      inventory,
      chestInventory,
      // Standard BotState fields (using defaults for farming-specific fields)
      emptyBuckets: 0,
      waterBuckets: 0,
      wheatSeeds: 0,
      wheat: 0,
      slop: 0,
      unwateredPlots: 0,
      unseededPlots: 0,
      ungrownPlots: 0,
      unharvestedPlots: 0,
      totalPlots: 0,
      // Extended state for energize mode
      nearbyTreeBlocks,
      axes,
      oakSaplings,
      otherItems,
      hasPlantablePositions: hasPlantable,
    } as BotState & {
      nearbyTreeBlocks: boolean;
      axes: number;
      oakSaplings: number;
      otherItems: number;
      hasPlantablePositions: boolean;
    };

    return state;
  }

  getPriority(): number {
    return this.priority;
  }

  getActions(): UtilityAction[] {
    return this.actions;
  }
}

export async function logEnergizeState(
  state: BotState & {
    nearbyTreeBlocks?: number;
    axes?: number;
    oakSaplings?: number;
    otherItems?: number;
    hasPlantablePositions?: boolean;
  }
): Promise<void> {
  console.log("\n📊 Energize Mode State:");
  console.log(`  Location: ${state.location}`);
  console.log(
    `  Position: (${state.position.x}, ${state.position.y}, ${state.position.z})`
  );
  console.log(
    `  Energy: ${state.energy} (${(state.energy / MAX_ENERGY) * 100}%)`
  );
  console.log(`  Axes: ${state.axes || 0}`);
  console.log(`  Oak Saplings: ${state.oakSaplings || 0}`);
  console.log(`  Other Items: ${state.otherItems || 0}`);
  console.log(`  Nearby Tree Blocks: ${state.nearbyTreeBlocks || 0}`);
  console.log(
    `  Has Plantable Positions: ${state.hasPlantablePositions || false}`
  );
}
