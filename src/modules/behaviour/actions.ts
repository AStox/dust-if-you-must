import { DustBot } from "../../index.js";
import { UtilityAction, BotState } from "../../types/base.js";

/**
 * Generic utility actions that can be used by multiple behavior modes
 * Behavior mode-specific actions should be defined in their respective mode classes
 */

export const genericActions: UtilityAction[] = [
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
];

/**
 * Utility function to calculate distance between two positions
 * Can be used by different behavior modes
 */
export function calculateDistance(
  pos1: { x: number; y: number; z: number },
  pos2: { x: number; y: number; z: number }
): number {
  return Math.sqrt(
    Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.y - pos2.y, 2) +
      Math.pow(pos1.z - pos2.z, 2)
  );
}

// Legacy export for backward compatibility - will be removed in future versions
export const utilityActions = genericActions;
