import { DustBot } from "../../index.js";
import { EntityId, Vec3, BotState, InventoryItem } from "../../types/base.js";
import { getObjectIdByName } from "../../types/objectTypes.js";
import { getOperationalConfig } from "../../config/loader.js";

// Generic constants that can be used by any mode
export const DEFAULT_OPERATION_DELAY = 4000; // milliseconds
export const MAX_ENERGY: number = 817600000000000000;
export const LOCATION_THRESHOLD = 1; // blocks

/**
 * Assess the base state that all behavior modes need
 * Fetches core data: inventory, energy, position, chest inventory
 */
export async function assessBaseState(bot: DustBot): Promise<Partial<BotState>> {
  const config = getOperationalConfig();
  
  // Fetch core state in parallel for efficiency
  const [inventory, energy, position] = await Promise.all([
    bot.inventory.getInventory(bot.player.characterEntityId),
    bot.player.getPlayerEnergy().then(Number),
    bot.player.getCurrentPosition(),
  ]);

  return {
    inventory,
    energy,
    position,
  };
}

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