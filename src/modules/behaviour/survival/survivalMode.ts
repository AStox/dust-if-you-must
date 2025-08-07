import { DustBot } from "../../../index.js";
import { BotState, UtilityAction } from "../../../types/base.js";
import { BaseBehaviorMode } from "../behaviorMode.js";
import { getOperationalConfig } from "../../../config/loader.js";
import {
  checkAndRestoreEnergy,
  needsSurvivalAction,
  calculateEnergyPercentage,
  hasLowEnergy,
  getSlopCount,
  MAX_ENERGY,
  LOW_ENERGY_THRESHOLD,
  TARGET_ENERGY_THRESHOLD,
} from "./survivalOperations.js";

/**
 * Survival behavior mode implementation
 * Handles critical survival needs like energy management
 * Has the highest priority and executes before all other modes
 */
export class SurvivalMode extends BaseBehaviorMode {
  readonly name = "SURVIVAL";
  protected priority = 1000; // Highest priority - survival takes precedence over everything

  protected actions: UtilityAction[] = [
    {
      name: "RESTORE_ENERGY",
      canExecute: (state) => {
        const energyPercentage = calculateEnergyPercentage(BigInt(state.energy.toString()));
        const lowEnergy = hasLowEnergy(energyPercentage);
        const hasSlop = getSlopCount(state.inventory) > 0 || getSlopCount(state.chestInventory) > 0;
        
        console.log(
          `    🔋 RESTORE_ENERGY: energy=${energyPercentage.toFixed(1)}% (low=${lowEnergy}), hasSlop=${hasSlop}`
        );
        
        return lowEnergy && hasSlop;
      },
      calculateScore: function (state) {
        if (!this.canExecute(state)) return 0;
        
        const energyPercentage = calculateEnergyPercentage(BigInt(state.energy.toString()));
        
        // Score increases as energy gets lower (more urgent)
        // Energy at 15% = score 10000, energy at 10% = score 15000, etc.
        const baseScore = 10000;
        const urgencyMultiplier = (LOW_ENERGY_THRESHOLD - energyPercentage) * 100000;
        
        return baseScore + urgencyMultiplier;
      },
      execute: async (bot, state) => {
        console.log("🚨 Executing critical energy restoration");
        await checkAndRestoreEnergy(bot);
      },
    },
  ];

  async isAvailable(bot: DustBot): Promise<boolean> {
    // Survival mode is available when survival actions are needed AND can be executed
    const needsSurvival = await needsSurvivalAction(bot);
    
    if (!needsSurvival) {
      return false;
    }
    
    // Check if we actually have executable actions
    const energy = Number(await bot.player.getPlayerEnergy());
    const inventory = await bot.inventory.getInventory(bot.player.characterEntityId);
    const config = getOperationalConfig();
    const chestInventory = await bot.inventory.getInventory(config.entities.chests?.rightChest);
    
    const energyPercentage = calculateEnergyPercentage(BigInt(energy));
    const hasSlop = getSlopCount(inventory) > 0 || getSlopCount(chestInventory) > 0;
    
    console.log(`🔍 SURVIVAL isAvailable debug:`);
    console.log(`  needsSurvival=${needsSurvival} (energy=${energyPercentage.toFixed(1)}% < ${LOW_ENERGY_THRESHOLD * 100}%)`);
    console.log(`  hasSlop=${hasSlop} (player=${getSlopCount(inventory)}, chest=${getSlopCount(chestInventory)})`);
    console.log(`  RESTORE_ENERGY can execute: ${hasSlop}`);
    
    // Only available if we need survival AND have the resources to do something about it
    return needsSurvival && hasSlop;
  }

  async assessState(bot: DustBot): Promise<BotState> {
    console.log("\n🚨 === SURVIVAL STATE ASSESSMENT ===");

    const inventory = await bot.inventory.getInventory(bot.player.characterEntityId);
    const energy = Number(await bot.player.getPlayerEnergy());
    const position = await bot.player.getCurrentPosition();

    // Get chest inventory to check for resources
    const config = getOperationalConfig();
    const chestInventory = await bot.inventory.getInventory(
      config.entities.chests?.rightChest
    );

    const energyPercentage = calculateEnergyPercentage(BigInt(energy));
    const playerSlopCount = getSlopCount(inventory);
    const chestSlopCount = getSlopCount(chestInventory);

    console.log(`🔋 Energy: ${energyPercentage.toFixed(1)}%`);
    console.log(`🍽️ Player slop: ${playerSlopCount}`);
    console.log(`🗃️ Chest slop: ${chestSlopCount}`);

    // Create a minimal state for survival mode
    // Use defaults for farming-specific fields since survival doesn't care about them
    const state = {
      location: "unknown" as const,
      position,
      energy,
      inventory,
      chestInventory,
      // Default values for farming fields (not relevant for survival)
      emptyBuckets: 0,
      waterBuckets: 0,
      wheatSeeds: 0,
      wheat: 0,
      slop: playerSlopCount,
      unwateredPlots: 0,
      unseededPlots: 0,
      ungrownPlots: 0,
      unharvestedPlots: 0,
      totalPlots: 0,
    };

    console.log("✅ Survival state assessment complete");
    return state;
  }

  getPriority(): number {
    return this.priority;
  }

  getActions(): UtilityAction[] {
    return this.actions;
  }
}

export async function logSurvivalState(
  state: BotState
): Promise<void> {
  const energyPercentage = calculateEnergyPercentage(BigInt(state.energy.toString()));
  const playerSlopCount = getSlopCount(state.inventory);
  const chestSlopCount = getSlopCount(state.chestInventory);

  console.log("\n🚨 Survival Mode State:");
  console.log(`  Position: (${state.position.x}, ${state.position.y}, ${state.position.z})`);
  console.log(`  Energy: ${state.energy} (${energyPercentage.toFixed(1)}%)`);
  console.log(`  Low Energy Threshold: ${(LOW_ENERGY_THRESHOLD * 100).toFixed(0)}%`);
  console.log(`  Target Energy: ${(TARGET_ENERGY_THRESHOLD * 100).toFixed(0)}%`);
  console.log(`  Player Slop: ${playerSlopCount}`);
  console.log(`  Chest Slop: ${chestSlopCount}`);
  console.log(`  Critical Action Needed: ${hasLowEnergy(energyPercentage) && (playerSlopCount > 0 || chestSlopCount > 0)}`);
}
