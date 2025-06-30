import { DustBot } from "../../index.js";
import { EntityId, Vec3, BotState } from "../../types/base.js";
import { getObjectIdByName } from "../../types/objectTypes.js";
import { generateFarmPlots } from "./operations.js";

// Configurable delay constants
export const DEFAULT_OPERATION_DELAY = 4000; // milliseconds

// Define key locations
export const coastPosition: Vec3 = { x: -443, y: 63, z: 489 };
export const waterPosition: Vec3 = { x: -444, y: 62, z: 489 };
export const farmCenter: Vec3 = { x: -401, y: 72, z: 483 }; // Also chest position
export const rightChestEntityId: EntityId =
  "0x03fffffe7300000049000001e300000000000000000000000000000000000000";
export const housePosition: Vec3 = { x: -401, y: 72, z: 489 };
export const farmCorner1: Vec3 = { x: -405, y: 72, z: 479 };
export const farmCorner2: Vec3 = { x: -398, y: 72, z: 486 };

// Thresholds
export const LOCATION_THRESHOLD = 10; // blocks

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

  const distances = [
    { location: "coast" as const, distance: distanceToCoast },
    { location: "house" as const, distance: distanceToHouse },
    { location: "farm" as const, distance: distanceToFarm },
  ];

  console.log("distances", distances);

  const closest = distances.reduce((min, current) =>
    current.distance < min.distance ? current : min
  );

  if (closest.distance <= LOCATION_THRESHOLD) return closest.location;

  return "unknown";
}

export async function assessCurrentState(bot: DustBot): Promise<BotState> {
  const inventory = await bot.inventory.getInventory(
    bot.player.characterEntityId
  );
  console.log("inventory", inventory);
  const position = await bot.player.getCurrentPosition();

  const emptyBuckets = inventory.filter(
    (item) => item.type === getObjectIdByName("Bucket")!
  ).length;

  const waterBuckets = inventory.filter(
    (item) => item.type === getObjectIdByName("WaterBucket")!
  ).length;

  const wheatSeeds = inventory
    .filter((item) => item.type === getObjectIdByName("WheatSeed")!)
    .reduce((acc, item) => acc + item.amount, 0);

  const wheat = inventory
    .filter((item) => item.type === getObjectIdByName("Wheat")!)
    .reduce((acc, item) => acc + item.amount, 0);

  const slop = inventory
    .filter((item) => item.type === getObjectIdByName("WheatSlop")!)
    .reduce((acc, item) => acc + item.amount, 0);

  // Generate farm plots to count unwatered
  const farmPlots = await generateFarmPlots();
  let unwateredPlots = 0;
  let unseededPlots = 0;
  let ungrownPlots = 0;
  let unharvestedPlots = 0;
  for (const plot of farmPlots) {
    const type = await bot.world.getBlockType(plot);
    const typeAbove = await bot.world.getBlockType({
      x: plot.x,
      y: plot.y + 1,
      z: plot.z,
    });
    if (type === getObjectIdByName("Farmland")!) {
      unwateredPlots++;
      if (typeAbove === getObjectIdByName("Wheat")!) {
        unharvestedPlots++;
      }
    } else if (type === getObjectIdByName("WetFarmland")!) {
      if (typeAbove === getObjectIdByName("Air")!) {
        unseededPlots++;
      } else if (typeAbove === getObjectIdByName("WheatSeed")!) {
        const isReadyToGrow = await bot.farming.isPlantReadyToGrow({
          x: plot.x,
          y: plot.y + 1,
          z: plot.z,
        });
        if (isReadyToGrow) {
          ungrownPlots++;
        }
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
    ungrownPlots,
    unharvestedPlots,
    totalPlots: farmPlots.length,
  };
}

export async function logCurrentState(state: BotState): Promise<void> {
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
  console.log(`  Ungrown Plots: ${state.ungrownPlots}/${state.totalPlots}`);
  console.log(
    `  Unharvested Plots: ${state.unharvestedPlots}/${state.totalPlots}`
  );
}
