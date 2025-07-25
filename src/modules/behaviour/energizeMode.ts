import { DustBot } from "../../index.js";
import { EntityId, Vec3, BotState, UtilityAction } from "../../types/base.js";
import { getObjectIdByName, ObjectTypes } from "../../types/objectTypes.js";
import { BaseBehaviorMode } from "./behaviorMode.js";
import { TreesModule } from "../trees.js";
import { PathfindingModule } from "../pathfinding.js";
import { getOperationalConfig } from "../../config/loader.js";

// Energize-specific constants
export const MAX_ENERGY: number = 817600000000000000;
export const DEFAULT_OPERATION_DELAY = 2000; // milliseconds

// Utility Functions
function calculateDistance(pos1: Vec3, pos2: Vec3): number {
  return Math.sqrt(
    Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.y - pos2.y, 2) +
      Math.pow(pos1.z - pos2.z, 2)
  );
}

function isInTreeFarm(position: Vec3): boolean {
  const config = getOperationalConfig();
  try {
    return (
      position.x >=
        Math.min(
          config.areas.energize!.treeFarmBounds.corner1.x,
          config.areas.energize!.treeFarmBounds.corner2.x
        ) &&
      position.x <=
        Math.max(
          config.areas.energize!.treeFarmBounds.corner1.x,
          config.areas.energize!.treeFarmBounds.corner2.x
        ) &&
      position.z >=
        Math.min(
          config.areas.energize!.treeFarmBounds.corner1.z,
          config.areas.energize!.treeFarmBounds.corner2.z
        ) &&
      position.z <=
        Math.max(
          config.areas.energize!.treeFarmBounds.corner1.z,
          config.areas.energize!.treeFarmBounds.corner2.z
        )
    );
  } catch (error) {
    return false;
  }
}

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
        const excludedTypes = [
          getObjectIdByName("OakLog"),
          getObjectIdByName("BirchLog"),
          getObjectIdByName("SpruceLog"),
          getObjectIdByName("OakLeaf"),
          getObjectIdByName("BirchLeaf"),
          getObjectIdByName("SpruceLeaf"),
          getObjectIdByName("Battery"),
        ].filter((id) => id !== undefined);

        for (const item of state.inventory) {
          if (
            item.type === getObjectIdByName("WoodenAxe") ||
            item.type === getObjectIdByName("StoneAxe") ||
            item.type === getObjectIdByName("IronAxe") ||
            item.type === getObjectIdByName("DiamondAxe")
          ) {
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
        const axeTypes = [
          getObjectIdByName("WoodenAxe"),
          getObjectIdByName("StoneAxe"),
          getObjectIdByName("IronAxe"),
          getObjectIdByName("DiamondAxe"),
        ];
        const oakSaplingId = getObjectIdByName("OakSapling");

        const axesInChest = state.chestInventory
          .filter((item) => axeTypes.includes(item.type))
          .reduce((acc, item) => acc + item.amount, 0);

        const saplingsInChest = state.chestInventory
          .filter((item) => item.type === oakSaplingId)
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
        const { setupEnergizeInventory } = await import("./operations.js");
        await setupEnergizeInventory(bot);
      },
    },

    {
      name: "CHOP_TREES",
      canExecute: (state) => {
        const inTreeFarm = isInTreeFarm(state.position);
        const hasAxe = state.inventory.some(
          (item) =>
            item.type === getObjectIdByName("WoodenAxe") ||
            item.type === getObjectIdByName("StoneAxe") ||
            item.type === getObjectIdByName("IronAxe") ||
            item.type === getObjectIdByName("DiamondAxe")
        );
        const hasNearbyTrees = (state as any).nearbyTrees > 0;
        console.log(
          `    🪓 CHOP_TREES: inTreeFarm=${inTreeFarm}, hasAxe=${hasAxe}, nearbyTrees=${
            (state as any).nearbyTrees
          }`
        );
        return inTreeFarm && hasAxe && hasNearbyTrees;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9999; // High priority when in tree farm with axe and trees
      },
      execute: async (bot) => {
        const config = getOperationalConfig();
        console.log("🪓 Starting tree chopping...");

        // Find trees
        const trees = await this.treesModule.scanForTrees(
          config.areas.energize!.treeFarmBounds.corner1,
          config.areas.energize!.treeFarmBounds.corner2
        );
        if (trees.length > 0) {
          const nearestTree = trees[0]; // Already sorted by distance

          // // Check if tree still exists before moving to it
          // try {
          //   const blockType = await bot.world.getBlockType(
          //     nearestTree.position
          //   );
          //   const treeType = this.treesModule.getTreeTypeByObjectId(blockType);

          //   if (!treeType || treeType.log !== blockType) {
          //     console.log(
          //       `🚫 Tree at (${nearestTree.position.x}, ${nearestTree.position.y}, ${nearestTree.position.z}) no longer exists, skipping`
          //     );
          //     return;
          //   }
          // } catch (error) {
          //   console.log(
          //     `🚫 Cannot verify tree at (${nearestTree.position.x}, ${nearestTree.position.y}, ${nearestTree.position.z}), skipping: ${error}`
          //   );
          //   return;
          // }

          // Move right next to the tree before chopping
          console.log(
            `🚶 Moving to tree at (${nearestTree.position.x}, ${nearestTree.position.y}, ${nearestTree.position.z})`
          );
          await bot.movement.pathTo({
            x: nearestTree.position.x,
            y: nearestTree.position.y,
            z: nearestTree.position.z + 1, // Position next to the tree
          });

          // Scan and chop the tree
          const tree = await this.treesModule.scanTree(nearestTree.position);
          const treePosition = tree.position;
          const treeType = this.treesModule.getTreeTypeByObjectId(
            await bot.world.getBlockType(treePosition)
          );

          await this.treesModule.chopTree(tree);

          // Plant a new sapling at the same location
          if (treeType) {
            console.log(
              `🌱 Planting ${treeType.name} sapling at chopped tree location (${treePosition.x}, ${treePosition.y}, ${treePosition.z})`
            );
            await this.treesModule.plantSapling(treePosition, treeType.sapling);
          }
        }
      },
    },

    {
      name: "PLANT_SAPLINGS",
      canExecute: (state) => {
        const inTreeFarm = isInTreeFarm(state.position);
        const hasOakSaplings = state.inventory.some(
          (item) => item.type === getObjectIdByName("OakSapling")
        );
        console.log(
          `    🌱 PLANT_SAPLINGS: inTreeFarm=${inTreeFarm}, hasOakSaplings=${hasOakSaplings}`
        );
        return inTreeFarm && hasOakSaplings;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9998; // High priority when in tree farm with oak saplings
      },
      execute: async (bot) => {
        console.log("🌱 Starting oak sapling planting...");
        const currentPos = await bot.player.getCurrentPosition();

        // Find suitable planting spots and plant oak saplings only
        const inventory = await bot.inventory.getInventory(
          bot.player.characterEntityId
        );
        const oakSaplings = inventory.filter(
          (item: any) => item.type === getObjectIdByName("OakSapling")
        );

        if (oakSaplings.length > 0) {
          // Plant one oak sapling at a time near current position
          await this.treesModule.plantSapling(
            currentPos,
            getObjectIdByName("OakSapling")!
          );
        }
      },
    },

    {
      name: "MINE_GROWN_SAPLINGS",
      canExecute: (state) => {
        const inTreeFarm = isInTreeFarm(state.position);
        const hasNearbySaplings = (state as any).nearbySaplings > 0;
        console.log(
          `    ⛏️ MINE_GROWN_SAPLINGS: inTreeFarm=${inTreeFarm}, nearbySaplings=${
            (state as any).nearbySaplings
          }`
        );
        return inTreeFarm && hasNearbySaplings;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        return 9997; // High priority when in tree farm with grown saplings to mine
      },
      execute: async (bot) => {
        console.log("⛏️ Starting grown sapling mining...");
        const config = getOperationalConfig();

        // Find grown saplings within tree farm area
        const saplings = await this.treesModule.scanForSaplings(
          config.areas.energize!.treeFarmBounds.corner1,
          config.areas.energize!.treeFarmBounds.corner2
        );

        // Filter for only fully grown saplings that can be mined
        const grownSaplings = saplings.filter(
          (sapling) => sapling.isReadyToGrow
        );

        if (grownSaplings.length > 0) {
          const nearestGrownSapling = grownSaplings[0];
          console.log(
            `⛏️ Mining grown sapling at (${nearestGrownSapling.position.x}, ${nearestGrownSapling.position.y}, ${nearestGrownSapling.position.z})`
          );

          // Move next to the sapling and mine it
          await bot.movement.pathTo({
            x: nearestGrownSapling.position.x,
            y: nearestGrownSapling.position.y,
            z: nearestGrownSapling.position.z,
          });
          await bot.world.mine(nearestGrownSapling.position);
        }
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
        console.log("🚶 Walking to tree farm...");
        const config = getOperationalConfig();
        // Walk to corner1 of the tree farm
        await bot.movement.pathTo({
          x: config.areas.energize!.treeFarmBounds.corner1.x,
          y: config.areas.energize!.treeFarmBounds.corner1.y,
          z: config.areas.energize!.treeFarmBounds.corner1.z,
        });
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

    for (const item of inventory) {
      if (axeTypes.some((axe) => item.type === getObjectIdByName(axe))) {
        axes += item.amount;
      } else if (item.type === oakSaplingId) {
        oakSaplings += item.amount;
      } else if (!excludedTypes.includes(item.type)) {
        otherItems += item.amount;
      }
    }

    // Scan for trees and saplings
    let nearbyTrees = 0;
    let nearbySaplings = 0;

    try {
      const config = getOperationalConfig();
      if (!config.areas.energize?.treeFarmBounds) {
        throw new Error("Tree farm bounds not configured");
      }

      const corner1 = config.areas.energize!.treeFarmBounds.corner1;
      const corner2 = config.areas.energize!.treeFarmBounds.corner2;

      // Preload tree farm area using pathfinding cache before scanning
      // This reuses the intelligent caching from pathfinding module
      await this.pathfindingModule.getChunksInBoundingBox(corner1, corner2);

      const trees = await this.treesModule.scanForTrees(corner1, corner2);
      const saplingsNearby = await this.treesModule.scanForSaplings(
        corner1,
        corner2
      );

      nearbyTrees = trees.length;
      nearbySaplings = saplingsNearby.length;
    } catch (error) {
      console.log("⚠️ Error scanning for trees/saplings:", error);
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
      nearbyTrees,
      nearbySaplings,
      axes,
      oakSaplings,
      otherItems,
    } as BotState & {
      nearbyTrees: number;
      nearbySaplings: number;
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
    nearbyTrees?: number;
    nearbySaplings?: number;
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
  console.log(`  Nearby Trees: ${state.nearbyTrees || 0}`);
  console.log(`  Nearby Saplings: ${state.nearbySaplings || 0}`);
}
