import { DustBot } from "../../index.js";
import { getObjectIdByName } from "../../types/objectTypes.js";
import { UtilityAction, BotState } from "../../types/base.js";
import {
  coastPosition,
  farmCenter,
  farmCorner1,
  farmCorner2,
  MAX_ENERGY,
  rightChestEntityId,
} from "./state.js";
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
} from "./operations.js";
import { assessCurrentState } from "./state.js";

// Utility Functions
function calculateDistance(
  pos1: { x: number; y: number; z: number },
  pos2: { x: number; y: number; z: number }
): number {
  return Math.sqrt(
    Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.y - pos2.y, 2) +
      Math.pow(pos1.z - pos2.z, 2)
  );
}

export const utilityActions: UtilityAction[] = [
  {
    name: "FILL_BUCKETS",
    canExecute: (state) => state.location === "coast" && state.emptyBuckets > 0,
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      // Basically if we're at the coast and have empty buckets, fill them.
      let score = 9999;

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

      let score = 9996; // Basically if we're at the farm and have water buckets, water the plots.

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
      let score = 9997;

      return score;
    },
    execute: async (bot) => {
      const farmPlots = await generateFarmPlots();
      await seedFarmPlots(bot, farmPlots);
    },
  },

  {
    name: "GROW_SEEDED_PLOTS",
    canExecute: (state) => state.location === "farm" && state.ungrownPlots > 0,
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      let score = 9998;

      return score;
    },
    execute: async (bot) => {
      const farmCornerTopLeft = farmCorner1;
      const farmCornerBotRight = farmCorner2;
      const farmCornerBotLeft = {
        x: farmCornerTopLeft.x,
        y: farmCornerTopLeft.y,
        z: farmCornerBotRight.z,
      };
      const farmCornerTopRight = {
        x: farmCornerBotRight.x,
        y: farmCornerTopLeft.y,
        z: farmCornerTopLeft.z,
      };
      console.log("topLeft", farmCornerTopLeft);
      console.log("botRight", farmCornerBotRight);
      console.log("botLeft", farmCornerBotLeft);
      console.log("topRight", farmCornerTopRight);
      await bot.world.commitChunk(farmCornerTopLeft);
      await bot.world.commitChunk(farmCornerBotRight);
      await bot.world.commitChunk(farmCornerBotLeft);
      await bot.world.commitChunk(farmCornerTopRight);

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

      let score = 9999; // Basically if we're at the farm and there's unharvested plots, harvest the plots.

      return score;
    },
    execute: async (bot) => {
      const farmCornerTopLeft = farmCorner1;
      const farmCornerBotRight = farmCorner2;
      const farmCornerBotLeft = {
        x: farmCornerTopLeft.x,
        y: farmCornerTopLeft.y,
        z: farmCornerBotRight.z,
      };
      const farmCornerTopRight = {
        x: farmCornerBotRight.x,
        y: farmCornerTopLeft.y,
        z: farmCornerTopLeft.z,
      };
      console.log("topLeft", farmCornerTopLeft);
      console.log("botRight", farmCornerBotRight);
      console.log("botLeft", farmCornerBotLeft);
      console.log("topRight", farmCornerTopRight);
      await bot.world.commitChunk(farmCornerTopLeft);
      await bot.world.commitChunk(farmCornerBotRight);
      await bot.world.commitChunk(farmCornerBotLeft);
      await bot.world.commitChunk(farmCornerTopRight);
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
      await transferToFromChest(bot);
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
        [wheatSlot[0], 16],
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

  {
    name: "WAIT",
    canExecute: () => true, // Can always wait
    calculateScore: function (state) {
      // Very low priority - only when nothing else to do
      return 1;
    },
    execute: async () => {
      console.log("⏰ Waiting for 1 minute...");
      await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute
    },
  },

  {
    name: "EAT",
    canExecute: (state) => state.slop > 0 && state.energy / MAX_ENERGY < 0.25,
    calculateScore: function (state) {
      if (!this.canExecute(state)) return 0;

      let score = 10000;

      return score;
    },
    execute: async (bot) => {
      await bot.inventory.eat(
        (
          await bot.inventory.getSlotForItemType(
            getObjectIdByName("WheatSlop")!
          )
        )[0]
      );
    },
  },
];
