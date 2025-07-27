import { DustBot } from "../../../index.js";
import { BotState, UtilityAction } from "../../../types/base.js";
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
} from "./energizeOperations.js";

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

  constructor() {
    super();
    this.treesModule = new TreesModule();
    this.pathfindingModule = new PathfindingModule();
  }

  protected actions: UtilityAction[] = [
    {
      name: "SETUP_INVENTORY",
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
            `    📦 SETUP_INVENTORY: Perfect inventory already (${axeCount} axes, ${oakSaplingCount} saplings, ${otherItemCount} other)`
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
          `    📦 SETUP_INVENTORY: need setup=${needsSetup}, chest has ${axesInChest} axes & ${saplingsInChest} saplings - canSetup=${canSetup}`
        );

        return canSetup;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 10000; // Highest priority - must setup inventory first
      },
      execute: async (bot) => {
        await setupEnergizeInventory(bot);
      },
    },

    {
      name: "MINE_TREE_FARM",
      canExecute: (state) => {
        const inTreeFarm = isInTreeFarm(state.position);
        const playerHasAxe = hasAxe(state.inventory);
        const hasTreeBlocks = (state as any).nearbyTreeBlocks > 0;
        console.log(
          `    🪓 MINE_TREE_FARM: inTreeFarm=${inTreeFarm}, hasAxe=${playerHasAxe}, treeBlocks=${
            (state as any).nearbyTreeBlocks
          }`
        );
        return inTreeFarm && playerHasAxe && hasTreeBlocks;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9999; // High priority when in tree farm with axe and tree blocks
      },
      execute: async (bot) => {
        await mineTreeFarmVolume(bot);
      },
    },

    {
      name: "WALK_TO_TREE_FARM",
      canExecute: (state) => {
        const notInTreeFarm = !isInTreeFarm(state.position);
        console.log(
          `    🚶 WALK_TO_TREE_FARM: location=${state.location} (notInTreeFarm=${notInTreeFarm})`
        );
        return notInTreeFarm;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 5000; // Medium priority - movement action
      },
      execute: async (bot) => {
        await walkToTreeFarm(bot);
      },
    },

    {
      name: "PLANT_SAPLINGS",
      canExecute: (state) => {
        const inTreeFarm = isInTreeFarm(state.position);
        const hasOakSaplings = state.inventory.some(
          (item) =>
            item.type === getObjectIdByName("OakSapling") && item.amount > 0
        );
        console.log(
          `    🌱 PLANT_SAPLINGS: inTreeFarm=${inTreeFarm}, hasOakSaplings=${hasOakSaplings}`
        );
        return inTreeFarm && hasOakSaplings;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 3000; // Lower priority - maintenance action
      },
      execute: async (bot) => {
        await plantSaplings(bot);
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

    // Scan for tree blocks using operations function
    let nearbyTreeBlocks = false;
    try {
      console.log("🔍 Checking for tree blocks...");
      const start = Date.now();
      nearbyTreeBlocks = await hasAvailableTreeBlocks(bot);
      const end = Date.now();
      console.log(`🔍 hasAvailableTreeBlocks took ${end - start}ms`);
    } catch (error) {
      console.log("⚠️ Error scanning for tree blocks:", error);
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
    } as BotState & {
      nearbyTreeBlocks: boolean;
      axes: number;
      oakSaplings: number;
      otherItems: number;
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
}
