import { BotState, UtilityAction } from "../../types/base.js";
import { utilityActions } from "./actions.js";

// Decision Engine
export async function selectBestAction(
  state: BotState
): Promise<UtilityAction> {
  const scoredActions = utilityActions
    .map((action) => ({
      action,
      score: action.calculateScore(state),
    }))
    .sort((a, b) => b.score - a.score);

  console.log("\n🤖 Action Scores:");
  scoredActions.forEach((item) =>
    console.log(`  ${item.action.name}: ${item.score.toFixed(1)}`)
  );

  if (scoredActions.length === 0) {
    throw new Error("No valid actions available!");
  }

  return scoredActions[0].action;
}
