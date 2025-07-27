import { DustBot } from "../../index.js";
import { BotState, UtilityAction } from "../../types/base.js";
import { IBehaviorMode } from "./behaviorMode.js";

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
 * Modern behavior mode decision engine
 * Selects the best behavior mode based on availability and priority
 */
export async function selectBestBehaviorMode(
  bot: DustBot,
  availableModes: IBehaviorMode[]
): Promise<IBehaviorMode | null> {
  const viableModes: Array<{ mode: IBehaviorMode; priority: number }> = [];

  if (availableModes.length > 1) {
    for (const mode of availableModes) {
      const isAvailable = await mode.isAvailable(bot);
      if (isAvailable) {
        viableModes.push({
          mode,
          priority: mode.getPriority(),
        });
        console.log(
          `  ✅ ${mode.name} is available (priority: ${mode.getPriority()})`
        );
      } else {
        console.log(`  ❌ ${mode.name} is not available`);
      }
    }
  } else {
    console.log("mode:", availableModes[0].name);
    return availableModes[0];
  }

  if (viableModes.length === 0) {
    console.log("  ⚠️ No viable behavior modes available");
    return null;
  }

  // Sort by priority (highest first)
  viableModes.sort((a, b) => b.priority - a.priority);

  const selectedMode = viableModes[0].mode;
  console.log(`  🎯 Selected behavior mode: ${selectedMode.name}`);

  return selectedMode;
}

/**
 * Execute a complete behavior cycle: mode selection -> state assessment -> action selection -> execution
 */
export async function executeBehaviorCycle(
  bot: DustBot,
  availableModes: IBehaviorMode[]
): Promise<boolean> {
  try {
    // Select best behavior mode
    const selectedMode = await selectBestBehaviorMode(bot, availableModes);

    if (!selectedMode) {
      throw new Error("No behavior mode selected");
    }

    // Assess state for the selected mode
    const assessStart = Date.now();
    const state = await selectedMode.assessState(bot);
    const assessTime = Date.now() - assessStart;
    console.log(`⏱️ assessState took ${assessTime}ms for ${selectedMode.name}`);

    // Update bot.state with fresh assessment for use in action execution
    bot.state = state;

    // Select and execute action
    console.log(
      "=".repeat(30) +
        " Selecting action for mode: " +
        selectedMode.name +
        " ".repeat(30)
    );
    const action = await selectedMode.selectAction(state);

    console.log(
      "=".repeat(30) + " Executing action: " + action.name + " ".repeat(30)
    );
    await selectedMode.execute(bot, action);

    return true;
  } catch (error) {
    console.error("❌ Error in behavior cycle:", error);
    return false;
  }
}
