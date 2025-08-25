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

  // Cache for action execution results to avoid duplicate calls
  private actionExecutionCache: Map<string, boolean> = new Map();

  protected actions: UtilityAction[] = [
    {
      name: "RESTORE_ENERGY",
      canExecute: (state) => {
        const energyPercentage = calculateEnergyPercentage(BigInt(state.energy.toString()));
        const lowEnergy = hasLowEnergy(energyPercentage);
        const slopInInventory = getSlopCount(state.inventory);
        const slopInChest = getSlopCount(state.chestInventory);
        const hasSlop = slopInInventory > 0 || slopInChest > 0;
        
        const canExecute = lowEnergy && hasSlop;
        
        if (typeof global !== 'undefined' && global.debugLog) {
          global.debugLog(`RESTORE_ENERGY: energy=${state.energy} (${energyPercentage.toFixed(1)}%), lowEnergy=${lowEnergy} (threshold=${LOW_ENERGY_THRESHOLD}%), slopInInventory=${slopInInventory}, slopInChest=${slopInChest}, hasSlop=${hasSlop} → canExecute=${canExecute}`);
        }
        
        return canExecute;
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
    
    const available = executableActions.length > 0;
    
    console.log(
      `${available? '✅' : '❌'} SURVIVAL: executableActions=[${executableActions.join(', ')}]`
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
      console.log("⚠️ No executable actions found in SURVIVAL mode");
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

    for (const { action, score } of scoredActions.slice(0, 3)) {
      console.log(`  ${action.name}: ${score}`);
    }

    return scoredActions[0].action;
  }

  async assessState(bot: DustBot): Promise<Partial<BotState>> {
    // Get chest inventory to check for resources
    const config = getOperationalConfig();
    const chestInventory = await bot.inventory.getInventory(
      config.entities.chests?.rightChest
    );

    const state = {
      chestInventory,
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
