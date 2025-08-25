import { BotState } from "../../../types/base.js";
import { InventoryManagementConfig, InventoryRequirement } from "./inventoryManager.js";

export interface SimulatedInventoryState {
  inventory: Array<{ type: number; amount: number }>;
  chestInventory: Array<{ type: number; amount: number }>;
}

/**
 * Simulates the effect of running inventory management without side effects
 */
export class InventorySimulator {
  /**
   * Simulate the inventory management operation and return projected inventory state
   */
  static simulateInventoryManagement(
    state: BotState,
    config: InventoryManagementConfig
  ): SimulatedInventoryState {
    // Create deep copies of inventories to avoid side effects
    const simulatedPlayerInventory = state.inventory.map(item => ({ ...item }));
    const simulatedChestInventory = state.chestInventory.map(item => ({ ...item }));

    // Simulate the same logic as InventoryManager.manageInventory()
    const toChestTransfers: [number, number, number][] = [];
    const fromChestTransfers: [number, number, number][] = [];

    // Step 1: Plan storage of non-allowed items
    this.planStoreNonAllowedItems(
      config.allowedItems,
      simulatedPlayerInventory,
      simulatedChestInventory,
      toChestTransfers
    );

    // Step 2: Plan getting required items
    for (const req of config.requiredItems) {
      this.planGetRequiredItems(
        req,
        simulatedPlayerInventory,
        simulatedChestInventory,
        fromChestTransfers
      );
    }

    // Step 3: Plan target amount adjustments
    for (const req of config.targetItems) {
      this.planTargetAdjustments(
        req,
        simulatedPlayerInventory,
        simulatedChestInventory,
        toChestTransfers,
        fromChestTransfers
      );
    }

    return {
      inventory: simulatedPlayerInventory,
      chestInventory: simulatedChestInventory
    };
  }

  /**
   * Plan transfers to store non-allowed items in chest
   */
  private static planStoreNonAllowedItems(
    allowedItems: number[],
    playerInventory: any[],
    chestInventory: any[],
    transfers: [number, number, number][]
  ): void {
    for (let playerSlot = 0; playerSlot < playerInventory.length; playerSlot++) {
      const item = playerInventory[playerSlot];
      if (item.amount > 0 && !allowedItems.includes(item.type)) {
        const emptyChestSlot = chestInventory.findIndex(slot => slot.amount === 0);
        if (emptyChestSlot !== -1) {
          // Update virtual inventories
          chestInventory[emptyChestSlot] = { type: item.type, amount: item.amount };
          playerInventory[playerSlot] = { type: 0, amount: 0 };
        }
      }
    }
  }

  /**
   * Plan transfers to get required items from chest
   */
  private static planGetRequiredItems(
    req: InventoryRequirement,
    playerInventory: any[],
    chestInventory: any[],
    transfers: [number, number, number][]
  ): void {
    const currentAmount = playerInventory
      .filter((item) => item.type === req.type)
      .reduce((acc, item) => acc + item.amount, 0);

    const needed = (req.min || 0) - currentAmount;
    if (needed > 0) {
      this.planItemTransfersFromChest(req.type, needed, chestInventory, playerInventory, transfers);
    }
  }

  /**
   * Plan transfers for target amount adjustments
   */
  private static planTargetAdjustments(
    req: InventoryRequirement,
    playerInventory: any[],
    chestInventory: any[],
    toChestTransfers: [number, number, number][],
    fromChestTransfers: [number, number, number][]
  ): void {
    let currentAmount: number;
    
    // Special handling for buckets - count both empty and water buckets
    if (req.type === 32788) {
      const emptyBuckets = playerInventory
        .filter((item) => item.type === 32788)
        .reduce((acc, item) => acc + item.amount, 0);
      const waterBuckets = playerInventory
        .filter((item) => item.type === 32789)
        .reduce((acc, item) => acc + item.amount, 0);
      currentAmount = emptyBuckets + waterBuckets;
    } else {
      currentAmount = playerInventory
        .filter((item) => item.type === req.type)
        .reduce((acc, item) => acc + item.amount, 0);
    }

    const target = req.target || 0;
    const needed = target - currentAmount;

    if (needed > 0) {
      // Need more - plan transfers from chest
      this.planItemTransfersFromChest(req.type, needed, chestInventory, playerInventory, fromChestTransfers);
    } else if (needed < 0 && req.max !== undefined && currentAmount > req.max) {
      // Have too many - plan transfers to chest
      const excess = currentAmount - target;
      
      let remaining = excess;
      for (let playerSlot = 0; playerSlot < playerInventory.length && remaining > 0; playerSlot++) {
        const item = playerInventory[playerSlot];
        if (item.type === req.type && item.amount > 0) {
          const toTransfer = Math.min(remaining, item.amount);
          const emptyChestSlot = chestInventory.findIndex(slot => slot.amount === 0);
          if (emptyChestSlot !== -1) {
            // Update virtual states
            chestInventory[emptyChestSlot] = { type: req.type, amount: toTransfer };
            playerInventory[playerSlot].amount -= toTransfer;
            remaining -= toTransfer;
          }
        }
      }
    }
  }

  /**
   * Helper method to plan transfers from chest to player inventory
   */
  private static planItemTransfersFromChest(
    itemType: number,
    needed: number,
    chestInventory: any[],
    playerInventory: any[],
    transfers: [number, number, number][]
  ): void {
    let remaining = needed;
    
    // Special handling for buckets - look for water buckets first, then empty buckets
    const targetTypes = itemType === 32788 ? [32789, 32788] : [itemType];
    
    for (const targetType of targetTypes) {
      for (let chestSlot = 0; chestSlot < chestInventory.length && remaining > 0; chestSlot++) {
        const chestItem = chestInventory[chestSlot];
        if (chestItem.type === targetType && chestItem.amount > 0) {
          const toTake = Math.min(remaining, chestItem.amount);
          
          // Find empty player slot (buckets have max stack size of 1)
          const playerSlot = playerInventory.findIndex(item => item.amount === 0);
          
          if (playerSlot !== -1) {
            // For buckets (max stack 1), transfer them one by one
            if (targetType === 32788 || targetType === 32789) {
              for (let i = 0; i < toTake && remaining > 0; i++) {
                const nextPlayerSlot = playerInventory.findIndex((item, idx) => idx >= playerSlot && item.amount === 0);
                if (nextPlayerSlot !== -1) {
                  // Update virtual states
                  chestInventory[chestSlot].amount -= 1;
                  playerInventory[nextPlayerSlot] = { type: targetType, amount: 1 };
                  remaining -= 1;
                }
              }
            } else {
              // Regular items can stack
              // Update virtual states
              chestInventory[chestSlot].amount -= toTake;
              playerInventory[playerSlot] = { type: targetType, amount: toTake };
              remaining -= toTake;
            }
          }
        }
      }
      
      if (remaining === 0) break;
    }
  }
}
