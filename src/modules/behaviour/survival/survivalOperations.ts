import { getOperationalConfig } from "../../../config/loader.js";
import { DustBot } from "../../../index.js";
import { EntityId, Vec3 } from "../../../types/base.js";
import { getObjectIdByName } from "../../../types/objectTypes.js";
import { getItemCount } from "../../../utils.js";

// Survival constants
export const MAX_ENERGY = 817600000000000000n; // From Constants.sol
export const LOW_ENERGY_THRESHOLD = 0.15; // 15%
export const TARGET_ENERGY_THRESHOLD = 0.80; // 80%
export const SLOP_ENERGY_VALUE = 68800000000000000n; // Energy restored per slop

/**
 * Checks current energy percentage
 */
export function calculateEnergyPercentage(currentEnergy: bigint): number {
  return Number(currentEnergy * 100n / MAX_ENERGY) / 100;
}

/**
 * Checks if player has low energy (below threshold)
 */
export function hasLowEnergy(energyPercentage: number): boolean {
  return energyPercentage < LOW_ENERGY_THRESHOLD;
}

/**
 * Calculates how much slop is needed to reach target energy
 */
export function calculateSlopNeeded(currentEnergy: bigint): number {
  const targetEnergy = BigInt(Math.floor(Number(MAX_ENERGY) * TARGET_ENERGY_THRESHOLD));
  const energyNeeded = targetEnergy - currentEnergy;
  return Math.ceil(Number(energyNeeded) / Number(SLOP_ENERGY_VALUE));
}

/**
 * Gets the count of slop in inventory
 */
export function getSlopCount(inventory: { type: number; amount: number }[]): number {
  return getItemCount(getObjectIdByName("WheatSlop"), inventory);
}

/**
 * Gets all slots containing slop
 */
export async function getSlopSlots(
  bot: DustBot,
  entityId: EntityId
): Promise<[number, number][]> {
  return await bot.inventory.getAllSlotsForItemType(getObjectIdByName("WheatSlop"), entityId);
}

/**
 * Eats slop from inventory until target energy is reached
 */
export async function eatSlopFromInventory(
  bot: DustBot,
  slopNeeded: number,
  slopSlots: [number, number][]
): Promise<void> {
  let slopEaten = 0;

  console.log(`🍽️ Starting to eat ${slopNeeded} slop to restore energy`);

  for (const [slotIndex, amount] of slopSlots) {
    if (slopEaten >= slopNeeded) break;

    const toEat = Math.min(amount, slopNeeded - slopEaten);
    
    for (let i = 0; i < toEat; i++) {
      console.log(`🍽️ Eating slop from slot ${slotIndex} (${slopEaten + 1}/${slopNeeded})`);
      await bot.inventory.eat(slotIndex);
      slopEaten++;
      
      if (slopEaten >= slopNeeded) break;
    }
  }

  // Re-fetch energy only after eating to verify the result
  const currentEnergyStr = await bot.player.getPlayerEnergy();
  const currentEnergy = BigInt(currentEnergyStr);
  const energyPercentage = calculateEnergyPercentage(currentEnergy);
  
  console.log(`✅ Energy restored to ${energyPercentage.toFixed(1)}% after eating ${slopEaten} slop`);
}

/**
 * Gets slop from the right chest
 */
export async function getSlopFromChest(
  bot: DustBot,
  slopNeeded: number
): Promise<number> {
  const config = getOperationalConfig();
  const rightChestEntity = config.entities.chests.rightChest as EntityId;

  const chestSlopCount = getItemCount(getObjectIdByName("WheatSlop"), bot.state.chestInventory);

  console.log(`🗃️ Chest has ${chestSlopCount} slop`);

  if (chestSlopCount === 0) {
    console.log(`❌ No slop available in chest`);
    return 0;
  }

  // Calculate how much slop to take from chest
  const slopToTake = Math.min(slopNeeded, chestSlopCount);
  
  if (slopToTake > 0) {
    console.log(`🏠 Traveling to chest to get ${slopToTake} slop`);
    
    // Travel to chest
    const chestPosition = await bot.world.getPositionOfEntity(rightChestEntity);
    await bot.movement.pathTo(chestPosition);
    
    // Take slop from chest
    await bot.inventory.transferExactAmount(
      rightChestEntity,
      bot.player.characterEntityId,
      getObjectIdByName("WheatSlop"),
      slopToTake
    );

    console.log(`📦 Transferred ${slopToTake} slop from chest to player`);
  }

  return slopToTake;
}

/**
 * Main energy management operation - checks and restores energy when low
 */
export async function checkAndRestoreEnergy(bot: DustBot): Promise<boolean> {
  try {
    // Use pre-fetched energy from bot.state
    const currentEnergy = BigInt(bot.state.energy);
    const energyPercentage = calculateEnergyPercentage(currentEnergy);

    console.log(`🔋 Current energy: ${energyPercentage.toFixed(1)}%`);

    // Check if energy is above threshold
    if (!hasLowEnergy(energyPercentage)) {
      return false; // No energy management needed
    }

    console.log(`🚨 Low energy detected (${energyPercentage.toFixed(1)}% < ${(LOW_ENERGY_THRESHOLD * 100).toFixed(0)}%) - starting energy management`);

    // Calculate how much energy we need
    const slopNeeded = calculateSlopNeeded(currentEnergy);
    console.log(`🎯 Target: ${(TARGET_ENERGY_THRESHOLD * 100).toFixed(0)}% energy, need ${slopNeeded} slop`);

    // Use pre-fetched player inventory
    const playerInventory = bot.state.inventory;
    const playerSlopCount = getItemCount(getObjectIdByName("WheatSlop"), playerInventory);

    console.log(`📦 Player has ${playerSlopCount} slop in inventory`);

    if (playerSlopCount >= slopNeeded) {
      // Player has enough slop, eat it
      const playerSlots = await getSlopSlots(bot, bot.player.characterEntityId);
      await eatSlopFromInventory(bot, slopNeeded, playerSlots);
      return true;
    }

    // Need to get slop from chest
    const slopFromChest = await getSlopFromChest(bot, slopNeeded - playerSlopCount);
    
    if (slopFromChest === 0 && playerSlopCount === 0) {
      console.log(`❌ No slop available anywhere - cannot restore energy`);
      return false;
    }

    // Eat slop until target energy
    const updatedPlayerSlots = await getSlopSlots(bot, bot.player.characterEntityId);
    await eatSlopFromInventory(bot, slopNeeded, updatedPlayerSlots);

    return true;

  } catch (error) {
    console.log(`❌ Energy management failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Utility function to check if survival actions are needed
 * @deprecated Use hasLowEnergy(calculateEnergyPercentage(state.energy)) directly
 */
export async function needsSurvivalAction(bot: DustBot): Promise<boolean> {
  try {
    const currentEnergyStr = await bot.player.getPlayerEnergy();
    const currentEnergy = BigInt(currentEnergyStr);
    const energyPercentage = calculateEnergyPercentage(currentEnergy);

    return hasLowEnergy(energyPercentage);
  } catch (error) {
    console.log(`⚠️ Failed to check survival needs: ${error}`);
    return false;
  }
}
