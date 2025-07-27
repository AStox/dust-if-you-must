import { DustBot } from "../../index.js";
import { EntityId, Vec3, BotState, InventoryItem } from "../../types/base.js";
import { getObjectIdByName } from "../../types/objectTypes.js";

// Generic constants that can be used by any mode
export const DEFAULT_OPERATION_DELAY = 4000; // milliseconds
export const MAX_ENERGY: number = 817600000000000000;
export const LOCATION_THRESHOLD = 1; // blocks

/**
 * Generic location definition interface
 */
export interface LocationDefinition {
  name: string;
  position: Vec3;
  threshold?: number;
}

/**
 * Mode-agnostic utility functions for state assessment
 */

/**
 * Calculate distance between two 3D positions
 */
export function calculateDistance(pos1: Vec3, pos2: Vec3): number {
  return Math.sqrt(
    Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.y - pos2.y, 2) +
      Math.pow(pos1.z - pos2.z, 2)
  );
}

/**
 * Determine the closest location from a set of defined locations
 * @param position - Current position
 * @param locations - Array of location definitions
 * @returns string - Name of closest location or "unknown"
 */
export function determineClosestLocation(
  position: Vec3,
  locations: LocationDefinition[]
): string {
  if (locations.length === 0) return "unknown";

  const distances = locations.map((location) => ({
    name: location.name,
    distance: calculateDistance(position, location.position),
    threshold: location.threshold ?? LOCATION_THRESHOLD,
  }));

  const closest = distances.reduce((min, current) =>
    current.distance < min.distance ? current : min
  );

  if (closest.distance <= closest.threshold) return closest.name;
  return "unknown";
}

/**
 * Get inventory count for a specific item type
 * @param inventory - Player inventory
 * @param itemName - Name of the item to count
 * @returns number - Total count of the item
 */
export function getInventoryItemCount(
  inventory: InventoryItem[],
  itemName: string
): number {
  const objectId = getObjectIdByName(itemName);
  if (!objectId) return 0;

  return inventory
    .filter((item) => item.type === objectId)
    .reduce((acc, item) => acc + item.amount, 0);
}

/**
 * Get inventory count for multiple item types
 * @param inventory - Player inventory
 * @param itemNames - Array of item names to count
 * @returns Record<string, number> - Object with item counts
 */
export function getInventoryItemCounts(
  inventory: InventoryItem[],
  itemNames: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const itemName of itemNames) {
    counts[itemName] = getInventoryItemCount(inventory, itemName);
  }

  return counts;
}

/**
 * Generic state assessment that can be extended by behavior modes
 * @param bot - The bot instance
 * @param locations - Optional array of location definitions
 * @returns Promise<Partial<BotState>> - Basic state information
 */
export async function assessBaseState(
  bot: DustBot,
  locations: LocationDefinition[] = []
): Promise<{
  position: Vec3;
  energy: number;
  inventory: InventoryItem[];
  location: string;
}> {
  const inventory = await bot.inventory.getInventory(
    bot.player.characterEntityId
  );
  const energy = Number(await bot.player.getPlayerEnergy());
  const position = await bot.player.getCurrentPosition();
  const location = determineClosestLocation(position, locations);

  console.log("Base state assessment - inventory count:", inventory.length);

  return {
    position,
    energy,
    inventory,
    location,
  };
}

/**
 * Legacy farming-specific state assessment for backward compatibility
 * @deprecated Use behavior mode specific assessment instead
 */
export async function assessCurrentState(bot: DustBot): Promise<BotState> {
  console.warn(
    "⚠️ Using deprecated assessCurrentState - consider using behavior mode specific assessment"
  );

  // Import farming locations for backward compatibility
  const { coastPosition, farmCenter, housePosition } = await import(
    "./farming/farmingMode.js"
  );

  const { generateFarmPlots } = await import("./farmingOperations.js");

  const locations: LocationDefinition[] = [
    { name: "coast", position: coastPosition },
    { name: "house", position: housePosition },
    { name: "farm", position: farmCenter },
  ];

  const baseState = await assessBaseState(bot, locations);

  // Get farming-specific inventory counts
  const itemCounts = getInventoryItemCounts(baseState.inventory, [
    "Bucket",
    "WaterBucket",
    "WheatSeed",
    "Wheat",
    "WheatSlop",
  ]);

  // Generate farm plots assessment (farming-specific)
  const farmPlots = await generateFarmPlots();
  let unwateredPlots = 0;
  let unseededPlots = 0;
  let ungrownPlots = 0;
  let unharvestedPlots = 0;

  // TODO: do each plot in parallel
  // Process all plots in parallel
  const plotPromises = farmPlots.map(async (plot) => {
    const type = await bot.world.getBlockType(plot);
    const typeAbove = await bot.world.getBlockType({
      x: plot.x,
      y: plot.y + 1,
      z: plot.z,
    });

    const result = {
      unwateredPlots: 0,
      unharvestedPlots: 0,
      unseededPlots: 0,
      ungrownPlots: 0,
    };

    if (type === getObjectIdByName("Farmland")!) {
      result.unwateredPlots++;
      if (typeAbove === getObjectIdByName("Wheat")!) {
        result.unharvestedPlots++;
      }
    } else if (type === getObjectIdByName("WetFarmland")!) {
      if (typeAbove === getObjectIdByName("Air")!) {
        result.unseededPlots++;
      } else if (typeAbove === getObjectIdByName("WheatSeed")!) {
        const isReadyToGrow = await bot.farming.isPlantReadyToGrow({
          x: plot.x,
          y: plot.y + 1,
          z: plot.z,
        });
        if (isReadyToGrow) {
          result.ungrownPlots++;
        }
      }
    }

    return result;
  });

  const plotResults = await Promise.all(plotPromises);

  // Aggregate results
  for (const result of plotResults) {
    unwateredPlots += result.unwateredPlots;
    unharvestedPlots += result.unharvestedPlots;
    unseededPlots += result.unseededPlots;
    ungrownPlots += result.ungrownPlots;
  }

  return {
    location: baseState.location as "coast" | "house" | "farm" | "unknown",
    position: baseState.position,
    energy: baseState.energy,
    emptyBuckets: itemCounts.Bucket || 0,
    waterBuckets: itemCounts.WaterBucket || 0,
    wheatSeeds: itemCounts.WheatSeed || 0,
    wheat: itemCounts.Wheat || 0,
    slop: itemCounts.WheatSlop || 0,
    unwateredPlots,
    unseededPlots,
    ungrownPlots,
    unharvestedPlots,
    totalPlots: farmPlots.length,
    inventory: baseState.inventory,
    chestInventory: baseState.inventory,
  };
}

/**
 * Generic state logging that can be customized
 * @param state - State object to log
 * @param title - Optional title for the log
 * @param customFields - Optional custom fields to log
 */
export async function logState(
  state: any,
  title: string = "Current State",
  customFields: Record<string, any> = {}
): Promise<void> {
  console.log(`\n📊 ${title}:`);

  // Log common fields if they exist
  if (state.location) console.log(`  Location: ${state.location}`);
  if (state.position) {
    console.log(
      `  Position: (${state.position.x}, ${state.position.y}, ${state.position.z})`
    );
  }
  if (state.energy !== undefined) {
    console.log(
      `  Energy: ${state.energy} (${((state.energy / MAX_ENERGY) * 100).toFixed(
        1
      )}%)`
    );
  }

  // Log custom fields
  for (const [key, value] of Object.entries(customFields)) {
    console.log(`  ${key}: ${value}`);
  }

  // Log inventory summary if available
  if (state.inventory) {
    console.log(`  Inventory slots used: ${state.inventory.length}`);
  }
}

/**
 * Legacy state logging for backward compatibility
 * @deprecated Use logState instead
 */
export async function logCurrentState(state: BotState): Promise<void> {
  console.warn(
    "⚠️ Using deprecated logCurrentState - consider using logState instead"
  );

  const customFields = {
    "Empty Buckets": state.emptyBuckets,
    "Water Buckets": state.waterBuckets,
    Wheat: state.wheat,
    Slop: state.slop,
    "Wheat Seeds": state.wheatSeeds,
    "Unwatered Plots": `${state.unwateredPlots}/${state.totalPlots}`,
    "Unseeded Plots": `${state.unseededPlots}/${state.totalPlots}`,
    "Ungrown Plots": `${state.ungrownPlots}/${state.totalPlots}`,
    "Unharvested Plots": `${state.unharvestedPlots}/${state.totalPlots}`,
  };

  await logState(state, "Farming State", customFields);
}
