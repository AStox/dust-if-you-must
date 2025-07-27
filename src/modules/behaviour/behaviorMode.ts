import { DustBot } from "../../index.js";
import { BotState, UtilityAction } from "../../types/base.js";

/**
 * Core interface that all behavior modes must implement
 */
export interface IBehaviorMode {
  /**
   * Unique identifier for this behavior mode
   */
  readonly name: string;

  /**
   * Assess the current game state and determine if this mode is available/viable
   * @param bot - The bot instance
   * @returns Promise<boolean> - true if this mode can operate in current conditions
   */
  isAvailable(bot: DustBot): Promise<boolean>;

  /**
   * Assess the current state relevant to this behavior mode
   * @param bot - The bot instance
   * @returns Promise<BotState> - Current state assessment
   */
  assessState(bot: DustBot): Promise<BotState>;

  /**
   * Select the best action for this behavior mode given the current state
   * @param state - Current bot state
   * @returns Promise<UtilityAction> - The selected action to execute
   */
  selectAction(state: BotState): Promise<UtilityAction>;

  /**
   * Execute the selected action
   * @param bot - The bot instance
   * @param action - The action to execute
   * @returns Promise<void>
   */
  execute(bot: DustBot, action: UtilityAction): Promise<void>;

  /**
   * Get the priority of this behavior mode (higher = more important)
   * @returns number - Priority value
   */
  getPriority(): number;

  /**
   * Get all available actions for this behavior mode
   * @returns UtilityAction[] - Array of actions this mode can perform
   */
  getActions(): UtilityAction[];
}

/**
 * Abstract base class that provides common behavior mode functionality
 */
export abstract class BaseBehaviorMode implements IBehaviorMode {
  abstract readonly name: string;
  protected abstract actions: UtilityAction[];
  protected abstract priority: number;

  abstract isAvailable(bot: DustBot): Promise<boolean>;
  abstract assessState(bot: DustBot): Promise<BotState>;

  async selectAction(state: BotState): Promise<UtilityAction> {
    // Calculate scores for all actions
    const actionDetails = this.actions.map((action) => {
      const canExecute = action.canExecute(state);
      const score = canExecute ? action.calculateScore(state) : 0;
      return {
        action,
        canExecute,
        score,
      };
    });

    const availableActions = actionDetails.filter(
      (detail) => detail.canExecute
    );

    if (availableActions.length === 0) {
      console.log(`\n❌ ${this.name}: No actions can execute!`);
      actionDetails.forEach((detail) => {
        console.log(
          `  ${detail.action.name}: ${detail.canExecute ? "✅" : "❌"}`
        );
      });
      throw new Error(`No valid actions available for ${this.name} mode!`);
    }

    const sortedActions = availableActions.sort((a, b) => b.score - a.score);

    // Clean decision logging - just scores and final choice
    console.log(
      `${"-".repeat(30)} ${this.name} Action Scores: ${"-".repeat(30)}`
    );
    sortedActions.forEach((item) =>
      console.log(`  ${item.action.name}: ${item.score.toFixed(1)}`)
    );

    const selectedAction = sortedActions[0].action;
    console.log(`\n✅ Executing: ${selectedAction.name}`);

    return selectedAction;
  }

  async execute(bot: DustBot, action: UtilityAction): Promise<void> {
    await action.execute(bot);
  }

  getPriority(): number {
    return this.priority;
  }

  getActions(): UtilityAction[] {
    return this.actions;
  }
}

/**
 * Configuration interface for behavior modes
 */
export interface BehaviorModeConfig {
  [key: string]: any;
}
