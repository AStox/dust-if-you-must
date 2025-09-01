import { DustBot } from "../../index.js";
import { BotState, UtilityAction } from "../../types/base.js";
import { IBehaviorMode } from "./behaviorMode.js";
import { assessBaseState } from "./state.js";
import { ObjectTypes } from "../../types/objectTypes.js";
import { InventorySimulator } from "./shared/inventorySimulator.js";

interface ModeEvaluation {
  mode: IBehaviorMode;
  priority: number;
  immediateActions: string[];
  hasNonInventoryImmediateActions: boolean;
  actionsAfterInventoryManagement: string[];
  hasNonInventoryAfterInventory: boolean;
}

interface ModeSelectionResult {
  mode: IBehaviorMode;
  needsInventoryFirst: boolean;
}

/**
 * Check if a mode has inventory management functionality
 */
function hasInventoryManagement(mode: IBehaviorMode): boolean {
  // Check if the mode name suggests it might have inventory management
  // This is a simple heuristic - could be made more sophisticated
  return mode.name === "FARMING" || mode.name === "ENERGIZE";
}

/**
 * Get inventory management configuration for a mode
 */
function getInventoryConfigForMode(mode: IBehaviorMode): any {
  try {
    if (mode.name === "FARMING") {
      // Import the config function dynamically to avoid circular deps
      const { getFarmingInventoryConfig } = require("./farming/farmingMode.js");
      return getFarmingInventoryConfig();
    } else if (mode.name === "ENERGIZE") {
      // Import the energize config function
      const { getEnergizeInventoryConfig } = require("./energize/energizeOperations.js");
      return getEnergizeInventoryConfig();
    }
    // Add other modes as needed
    return null;
  } catch (error) {
    console.warn(`⚠️ Failed to get inventory config for ${mode.name}:`, error);
    return null;
  }
}

/**
 * Simulate inventory management for a mode and return updated state
 */
function simulateInventoryForMode(mode: IBehaviorMode, state: BotState): BotState {
  if (!hasInventoryManagement(mode)) {
    return state;
  }

  const config = getInventoryConfigForMode(mode);
  if (!config) {
    return state;
  }

  try {
    const simulated = InventorySimulator.simulateInventoryManagement(state, config);
    return {
      ...state,
      inventory: simulated.inventory,
      chestInventory: simulated.chestInventory
    };
  } catch (error) {
    console.warn(`⚠️ Failed to simulate inventory management for ${mode.name}:`, error);
    return state;
  }
}

/**
 * Get available actions for a mode, excluding inventory management
 * Uses the mode's caching mechanism if available for consistency
 */
function getNonInventoryActions(mode: IBehaviorMode, state: BotState): string[] {
  try {
    // For farming and energize modes that use caching, use their approach
    if (mode.name === "FARMING" || mode.name === "ENERGIZE") {
      const modeWithCache = mode as any;
      
      // Clear and rebuild cache for the given state
      if (modeWithCache.actionExecutionCache) {
        modeWithCache.actionExecutionCache.clear();
      } else {
        modeWithCache.actionExecutionCache = new Map();
      }
      
      const executableActions = [];
      if ('actions' in mode && Array.isArray(modeWithCache.actions)) {
        for (const action of modeWithCache.actions) {
          const canExecute = action.canExecute(state);
          modeWithCache.actionExecutionCache.set(action.name, canExecute);
          if (canExecute && action.name !== "MANAGE_INVENTORY") {
            executableActions.push(action.name);
          }
        }
      }
      
      return executableActions;
    }
    
    // Fallback for other modes
    if ('actions' in mode) {
      const actions = (mode as any).actions;
      if (Array.isArray(actions)) {
        return actions
          .filter((action: any) => 
            action && 
            typeof action.name === 'string' && 
            action.name !== "MANAGE_INVENTORY" && 
            typeof action.canExecute === 'function' &&
            action.canExecute(state)
          )
          .map((action: any) => action.name);
      }
    }
    return [];
  } catch (error) {
    console.warn(`⚠️ Failed to get non-inventory actions for ${mode.name}:`, error);
    return [];
  }
}

/**
 * Legacy decision engine for backward compatibility with old action-based system
 * @deprecated Use behavior modes instead
 */
export async function selectBestAction(
  state: BotState,
  actions?: UtilityAction[]
): Promise<UtilityAction> {
  if (!actions || actions.length === 0) {
    throw new Error("No actions provided to legacy decision engine!");
  }

  const availableActions = actions.filter((action) => action.canExecute(state));

  if (availableActions.length === 0) {
    throw new Error("No valid actions available!");
  }

  const scoredActions = availableActions
    .map((action) => ({
      action,
      score: action.calculateScore(state),
    }))
    .sort((a, b) => b.score - a.score);

  console.log("\n🤖 Legacy Action Scores:");
  scoredActions.forEach((item) =>
    console.log(`  ${item.action.name}: ${item.score.toFixed(1)}`)
  );

  return scoredActions[0].action;
}

/**
 * Log all keys and values in bot state for debugging
 */
function logBotState(state: BotState): void {
  const MAX_ENERGY = 817600000000000000;
  
  // Calculate maximum key length for alignment
  const maxKeyLength = Math.max(...Object.keys(state).map(k => k.length)) + 2;
  
  for (const [key, value] of Object.entries(state)) {
    const paddedKey = (key + ":").padEnd(maxKeyLength);
    
    if (key === 'inventory' || key === 'chestInventory') {
      // Handle inventory arrays specially
      if (Array.isArray(value)) {
        const nonEmptySlots = value
          .map((item, index) => ({ ...item, slot: index }))
          .filter(item => item.type !== 0 && item.amount > 0);
        
        console.log(`  ${paddedKey}`);
        console.log(`    ┌─────┬──────────────────────┬────────┐`);
        console.log(`    │ Slot│ Item Name (ID)       │ Amount │`);
        console.log(`    ├─────┼──────────────────────┼────────┤`);
        nonEmptySlots.forEach(item => {
          const slot = item.slot.toString().padStart(4);
          const itemName = ObjectTypes[item.type]?.name || "Unknown";
          const itemDisplay = `${itemName} (${item.type})`.padEnd(21);
          const amount = item.amount.toString().padStart(6);
          console.log(`    │ ${slot}│ ${itemDisplay}│ ${amount} │`);
        });
        console.log(`    └─────┴──────────────────────┴────────┘`);
      }
    } else if (key === 'energy') {
      const percentage = ((Number(value) / MAX_ENERGY) * 100).toFixed(1);
      console.log(`  ${paddedKey} ${percentage}% (${value})`);
    } else if (key === 'position' && typeof value === 'object' && value !== null) {
      const pos = value as { x: number; y: number; z: number };
      console.log(`  ${paddedKey} (${pos.x}, ${pos.y}, ${pos.z})`);
    } else if (typeof value === 'object' && value !== null) {
      console.log(`  ${paddedKey} ${JSON.stringify(value)}`);
    } else {
      console.log(`  ${paddedKey} ${value}`);
    }
  }
}

/**
 * Modern behavior mode decision engine with two-phase evaluation
 * Selects the best behavior mode based on priority, considering inventory management effects
 */
export async function selectBestBehaviorMode(
  bot: DustBot,
  availableModes: IBehaviorMode[]
): Promise<ModeSelectionResult | null> {
  console.log("\nMODE SELECTION (Two-Phase)");
  console.log("─".repeat(50));
  
  if (availableModes.length === 0) {
    console.log("  ⚠️ No modes provided");
    return null;
  }

  if (availableModes.length === 1) {
    console.log(`  🎯 Only one mode available: ${availableModes[0].name}`);
    return { mode: availableModes[0], needsInventoryFirst: false };
  }

  // Evaluate all modes with two-phase approach
  const evaluations: ModeEvaluation[] = [];
  
  for (const mode of availableModes) {
    console.log(`\n🔍 Evaluating ${mode.name}:`);
    
    // Phase 1: Check immediate actions
    const immediateActions = getNonInventoryActions(mode, bot.state);
    const hasNonInventoryImmediateActions = immediateActions.length > 0;
    
    console.log(`  📋 Immediate actions: [${immediateActions.join(', ')}]`);
    
    // Phase 2: Simulate inventory management and check again
    let actionsAfterInventoryManagement: string[] = [];
    let hasNonInventoryAfterInventory = false;
    
    if (hasInventoryManagement(mode)) {
      const simulatedState = simulateInventoryForMode(mode, bot.state);
      actionsAfterInventoryManagement = getNonInventoryActions(mode, simulatedState);
      hasNonInventoryAfterInventory = actionsAfterInventoryManagement.length > 0;
      
      console.log(`  📋 Actions after inventory mgmt: [${actionsAfterInventoryManagement.join(', ')}]`);
    }
    
    evaluations.push({
      mode,
      priority: mode.getPriority(),
      immediateActions,
      hasNonInventoryImmediateActions,
      actionsAfterInventoryManagement,
      hasNonInventoryAfterInventory
    });
  }

  // Sort by priority (highest first)
  evaluations.sort((a, b) => b.priority - a.priority);
  
  console.log(`\n📊 Priority-ordered evaluation:`);
  evaluations.forEach(evaluation => {
    console.log(`  ${evaluation.mode.name} (priority ${evaluation.priority}): immediate=${evaluation.hasNonInventoryImmediateActions}, afterInventory=${evaluation.hasNonInventoryAfterInventory}`);
  });

  // Select the best mode using priority-respecting logic
  for (const evaluation of evaluations) {
    if (evaluation.hasNonInventoryImmediateActions) {
      console.log(`\n✅ Selected ${evaluation.mode.name}: has immediate non-inventory actions`);
      return { mode: evaluation.mode, needsInventoryFirst: false };
    }
    
    if (evaluation.hasNonInventoryAfterInventory) {
      console.log(`\n✅ Selected ${evaluation.mode.name}: will have actions after inventory management`);
      return { mode: evaluation.mode, needsInventoryFirst: true };
    }
  }

  console.log("  ⚠️ No viable behavior modes found");
  return null;
}

/**
 * Execute a complete behavior cycle: activation check -> mode selection -> state assessment -> action selection -> execution
 */
export async function executeBehaviorCycle(
  bot: DustBot,
  availableModes: IBehaviorMode[]
): Promise<boolean> {
  try {
    // Assess state for ALL available modes at the beginning of the cycle
    console.log(`\n📊 STATE ASSESSMENT PHASE`);
    console.log("─".repeat(50));
    
    // Assess base state that all modes need (inventory, energy, position, chest)
    const baseState = await assessBaseState(bot);
    
    // Run all mode state assessments in parallel since they're independent
    const modeStatePromises = availableModes.map(mode => mode.assessState(bot));
    const modeStates = await Promise.all(modeStatePromises);
    
    // Combine base state with all mode states
    let combinedState = baseState;
    for (const modeState of modeStates) {
      combinedState = { ...combinedState, ...modeState };
    }

    // Check if bot is alive and activate if needed at the beginning of every cycle
    await bot.player.checkStatusAndActivate(bot);

    // Update bot.state with combined assessment for use throughout the entire cycle
    bot.state = combinedState as BotState;

    // Log the complete state after all assessments
    logBotState(bot.state);

    // Select best behavior mode
    const selectionResult = await selectBestBehaviorMode(bot, availableModes);

    if (!selectionResult) {
      throw new Error("No behavior mode selected");
    }

    const { mode: selectedMode, needsInventoryFirst } = selectionResult;

    // If the mode needs inventory management first, run it
    if (needsInventoryFirst && hasInventoryManagement(selectedMode)) {
      console.log(`\n🔄 Running inventory management first for ${selectedMode.name}`);
      const config = getInventoryConfigForMode(selectedMode);
      if (config) {
        const { InventoryManager } = await import("./shared/inventoryManager.js");
        await InventoryManager.manageInventory(bot, config);
        
        // Refresh state after inventory management
        const baseState = await assessBaseState(bot);
        const modeStatePromises = availableModes.map(mode => mode.assessState(bot));
        const modeStates = await Promise.all(modeStatePromises);
        
        let combinedState = baseState;
        for (const modeState of modeStates) {
          combinedState = { ...combinedState, ...modeState };
        }
        bot.state = combinedState as BotState;
      }
    }

    // Select and execute action
    console.log(`\nACTION SELECTION - ${selectedMode.name.toUpperCase()}`);
    console.log("─".repeat(50));
    const action = await selectedMode.selectAction(bot.state);

    console.log("\n" + "=".repeat(50));
    console.log(" ".repeat(15) + `✅ ${action.name}`);
    console.log("=".repeat(50));
    await selectedMode.execute(bot, action);

    // Invalidate caches after action execution since game state has changed
    for (const mode of availableModes) {
      if ('actionExecutionCache' in mode) {
        (mode as any).actionExecutionCache?.clear();
      }
    }

    return true;
  } catch (error) {
    console.error("❌ Error in behavior cycle:", error);
    return false;
  }
}
