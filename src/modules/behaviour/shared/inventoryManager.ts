import { DustBot } from "../../../index.js";
import { Vec3 } from "../../../types/base.js";
import { getOperationalConfig } from "../../../config/loader.js";

export interface InventoryRequirement {
  type: number;
  min?: number;
  max?: number;
  target?: number;
}

export interface InventoryManagementConfig {
  allowedItems: number[]; // Item type IDs that are allowed in inventory
  requiredItems: InventoryRequirement[]; // Items we must have minimum amounts of
  targetItems: InventoryRequirement[]; // Items we want specific amounts of
  chestLocation?: Vec3; // Override default chest location
}

/**
 * Shared inventory management utility for behavior modes
 */
export class InventoryManager {
  private static async getChestLocation(): Promise<Vec3> {
    const config = getOperationalConfig();
    const farmCenter = config.areas.farming?.farmCenter;
    if (!farmCenter) {
      throw new Error("Farm center not configured for inventory management");
    }
    return farmCenter;
  }

  private static async getChestEntityId(): Promise<string> {
    const config = getOperationalConfig();
    const chestId = config.entities.chests?.rightChest;
    if (!chestId) {
      throw new Error("Right chest entity ID not configured");
    }
    return chestId;
  }

  /**
   * Check if inventory needs management based on configuration
   */
  static async needsInventoryManagement(
    bot: DustBot,
    config: InventoryManagementConfig
  ): Promise<boolean> {
    const inventory = await bot.inventory.getInventory(
      bot.player.characterEntityId
    );
    const chestInventory = await bot.inventory.getInventory(
      await this.getChestEntityId()
    );

    // Check for non-allowed items
    const hasNonAllowedItems = inventory.some(
      (item) => item.amount > 0 && !config.allowedItems.includes(item.type)
    );

    // Check if we're missing required items that are available in chest
    const missingRequiredItems = config.requiredItems.some((req) => {
      const currentAmount = inventory
        .filter((item) => item.type === req.type)
        .reduce((acc, item) => acc + item.amount, 0);

      const availableInChest = chestInventory
        .filter((item) => item.type === req.type)
        .reduce((acc, item) => acc + item.amount, 0);

      return currentAmount < (req.min || 0) && availableInChest > 0;
    });

    // Check if we need to adjust target amounts
    const needsTargetAdjustment = config.targetItems.some((req) => {
      const currentAmount = inventory
        .filter((item) => item.type === req.type)
        .reduce((acc, item) => acc + item.amount, 0);

      const availableInChest = chestInventory
        .filter((item) => item.type === req.type)
        .reduce((acc, item) => acc + item.amount, 0);

      const target = req.target || 0;
      return (
        (currentAmount < target && availableInChest > 0) ||
        (currentAmount > target &&
          req.max !== undefined &&
          currentAmount > req.max)
      );
    });

    return hasNonAllowedItems || missingRequiredItems || needsTargetAdjustment;
  }

  /**
   * Manage inventory according to configuration using optimized batch transfers
   */
  static async manageInventory(
    bot: DustBot,
    config: InventoryManagementConfig
  ): Promise<void> {
    console.log("📦 Starting inventory management...");
    console.log(
      `  🔍 Config - RequiredItems: ${JSON.stringify(config.requiredItems)}`
    );
    console.log(
      `  🔍 Config - TargetItems: ${JSON.stringify(config.targetItems)}`
    );

    // Move to chest location
    const chestLocation =
      config.chestLocation || (await this.getChestLocation());
    console.log(
      `🚶 Moving to chest at (${chestLocation.x}, ${chestLocation.y}, ${chestLocation.z})`
    );

    await bot.movement.pathTo(chestLocation);

    const chestEntityId = await this.getChestEntityId();

    // Get current inventories
    const inventory = await bot.inventory.getInventory(
      bot.player.characterEntityId
    );
    const chestInventory = await bot.inventory.getInventory(chestEntityId);

    // Debug both inventories
    console.log("📦 Player inventory contents:");
    inventory.forEach((item, index) => {
      if (item.amount > 0) {
        console.log(`  Slot ${index}: type=${item.type}, amount=${item.amount}`);
      }
    });

    console.log("📦 Chest inventory contents:");
    chestInventory.forEach((item, index) => {
      if (item.amount > 0) {
        console.log(`  Slot ${index}: type=${item.type}, amount=${item.amount}`);
      }
    });

    // Create copies for virtual planning
    const virtualPlayerInventory = [...inventory];
    const virtualChestInventory = [...chestInventory];

    // Collect all transfers in batches
    const toChestTransfers: [number, number, number][] = [];
    const fromChestTransfers: [number, number, number][] = [];

    // Step 1: Plan storage of non-allowed items
    console.log("📦 Planning storage of non-allowed items...");
    this.planStoreNonAllowedItems(
      config.allowedItems,
      virtualPlayerInventory,
      virtualChestInventory,
      toChestTransfers
    );

    // Step 2: Plan getting required items
    console.log("📦 Planning required items transfers...");
    for (const req of config.requiredItems) {
      this.planGetRequiredItems(
        req,
        virtualPlayerInventory,
        virtualChestInventory,
        fromChestTransfers
      );
    }

    // Step 3: Plan target amount adjustments
    console.log("📦 Planning target amount adjustments...");
    for (const req of config.targetItems) {
      this.planTargetAdjustments(
        req,
        virtualPlayerInventory,
        virtualChestInventory,
        toChestTransfers,
        fromChestTransfers
      );
    }

    // Execute all transfers in batches
    if (toChestTransfers.length > 0) {
      console.log("📦 Executing batch transfer TO chest...");
      console.log(`  📦 Transferring ${toChestTransfers.length} item stacks in one transaction`);
      await bot.inventory.transfer(bot.player.characterEntityId, chestEntityId, toChestTransfers);
      console.log("  ✅ Batch transfer to chest completed!");
    }

    if (fromChestTransfers.length > 0) {
      console.log("📦 Executing batch transfer FROM chest...");
      console.log(`  📦 Transferring ${fromChestTransfers.length} item stacks in one transaction`);
      await bot.inventory.transfer(chestEntityId, bot.player.characterEntityId, fromChestTransfers);
      console.log("  ✅ Batch transfer from chest completed!");
    }

    if (toChestTransfers.length === 0 && fromChestTransfers.length === 0) {
      console.log("📦 No transfers needed - inventory already optimal!");
    }

    console.log("✅ Inventory management completed!");
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
          transfers.push([playerSlot, emptyChestSlot, item.amount]);
          console.log(`  📦 Planned: Store ${item.amount}x type ${item.type} from player slot ${playerSlot} to chest slot ${emptyChestSlot}`);
          
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
      console.log(`  🔄 Need ${needed} more of type ${req.type} (current: ${currentAmount}, min: ${req.min})`);
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

    console.log(`  🔍 Target item type ${req.type}: current=${currentAmount}, target=${target}, needed=${needed}`);

    if (needed > 0) {
      // Need more - plan transfers from chest
      this.planItemTransfersFromChest(req.type, needed, chestInventory, playerInventory, fromChestTransfers);
    } else if (needed < 0 && req.max !== undefined && currentAmount > req.max) {
      // Have too many - plan transfers to chest
      const excess = currentAmount - target;
      console.log(`  🔄 Planning to store ${excess}x type ${req.type}`);
      
      let remaining = excess;
      for (let playerSlot = 0; playerSlot < playerInventory.length && remaining > 0; playerSlot++) {
        const item = playerInventory[playerSlot];
        if (item.type === req.type && item.amount > 0) {
          const toTransfer = Math.min(remaining, item.amount);
          const emptyChestSlot = chestInventory.findIndex(slot => slot.amount === 0);
          if (emptyChestSlot !== -1) {
            toChestTransfers.push([playerSlot, emptyChestSlot, toTransfer]);
            console.log(`  📦 Planned: Store ${toTransfer}x type ${req.type} from player slot ${playerSlot} to chest slot ${emptyChestSlot}`);
            
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
                  transfers.push([chestSlot, nextPlayerSlot, 1]);
                  console.log(`  📦 Planned: Take 1x type ${targetType} (bucket) from chest slot ${chestSlot} to player slot ${nextPlayerSlot}`);
                  
                  // Update virtual states
                  chestInventory[chestSlot].amount -= 1;
                  playerInventory[nextPlayerSlot] = { type: targetType, amount: 1 };
                  remaining -= 1;
                }
              }
            } else {
              // Regular items can stack
              transfers.push([chestSlot, playerSlot, toTake]);
              console.log(`  📦 Planned: Take ${toTake}x type ${targetType} from chest slot ${chestSlot} to player slot ${playerSlot}`);
              
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
    
    if (remaining > 0) {
      console.log(`  ⚠️ Could not plan transfer for ${remaining}x type ${itemType} - not enough in chest or no space`);
      console.log(`    🔍 Searched for types: ${targetTypes.join(', ')}`);
      console.log(`    📦 Available in chest:`);
      targetTypes.forEach(type => {
        const available = chestInventory.filter(item => item.type === type && item.amount > 0);
        if (available.length > 0) {
          available.forEach((item, idx) => {
            const slotIndex = chestInventory.findIndex(slot => slot === item);
            console.log(`      Slot ${slotIndex}: ${item.amount}x type ${type}`);
          });
        } else {
          console.log(`      No type ${type} found in chest`);
        }
      });
    }
  }
}
