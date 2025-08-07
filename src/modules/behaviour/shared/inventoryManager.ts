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
   * Manage inventory according to configuration
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
    let inventory = await bot.inventory.getInventory(
      bot.player.characterEntityId
    );
    let chestInventory = await bot.inventory.getInventory(chestEntityId);

    // Debug chest inventory
    console.log("📦 Chest inventory contents:");
    chestInventory.forEach((item, index) => {
      if (item.amount > 0) {
        console.log(`  Slot ${index}: type=${item.type}, amount=${item.amount}`);
      }
    });

    // Step 1: Store non-allowed items in chest
    console.log("📦 Storing non-allowed items...");
    const storeTransfers: [number, number, number][] = [];
    let chestSlotIndex = 0;

    for (let i = 0; i < inventory.length; i++) {
      const item = inventory[i];
      if (item.amount > 0 && !config.allowedItems.includes(item.type)) {
        // Find available chest slot
        while (
          chestSlotIndex < 40 &&
          chestInventory[chestSlotIndex] &&
          chestInventory[chestSlotIndex].amount > 0
        ) {
          chestSlotIndex++;
        }

        if (chestSlotIndex < 40) {
          storeTransfers.push([i, chestSlotIndex, item.amount]);
          console.log(
            `  📤 Preparing to store ${item.amount}x type ${item.type}`
          );
          chestSlotIndex++;
        }
      }
    }

    if (storeTransfers.length > 0) {
      try {
        await bot.inventory.transfer(
          bot.player.characterEntityId,
          chestEntityId,
          storeTransfers
        );
        console.log(`  ✅ Stored ${storeTransfers.length} item types in chest`);
      } catch (error) {
        console.log(`  ❌ Failed to store items: ${error}`);
      }
    }

    // Refresh inventories after storing
    inventory = await bot.inventory.getInventory(bot.player.characterEntityId);
    chestInventory = await bot.inventory.getInventory(chestEntityId);

    // Step 2: Get required items from chest
    console.log("📦 Getting required items...");
    for (const req of config.requiredItems) {
      const currentAmount = inventory
        .filter((item) => item.type === req.type)
        .reduce((acc, item) => acc + item.amount, 0);

      const needed = (req.min || 0) - currentAmount;
      if (needed > 0) {
        const chestSlot = chestInventory.findIndex(
          (item) => item.type === req.type && item.amount > 0
        );

        if (chestSlot !== -1) {
          const toTake = Math.min(needed, chestInventory[chestSlot].amount);
          try {
            console.log(
              `  🔄 Attempting to transfer ${toTake}x type ${req.type} from chest to player...`
            );
            await bot.inventory.transferExactAmount(
              chestEntityId,
              bot.player.characterEntityId,
              req.type,
              toTake
            );
            console.log(`  ✅ Got ${toTake}x type ${req.type} from chest`);

            // Refresh inventories after transfer
            inventory = await bot.inventory.getInventory(
              bot.player.characterEntityId
            );
            chestInventory = await bot.inventory.getInventory(chestEntityId);
          } catch (error) {
            console.log(
              `  ❌ Failed to get required item type ${req.type}: ${error}`
            );
          }
        }
      }
    }

    // Step 3: Adjust target amounts
    console.log("📦 Adjusting target amounts...");
    for (const req of config.targetItems) {
      let currentAmount: number;
      
      // Special handling for buckets - count both empty and water buckets
      if (req.type === 32788) { // Bucket type
        const emptyBuckets = inventory
          .filter((item) => item.type === 32788)
          .reduce((acc, item) => acc + item.amount, 0);
        const waterBuckets = inventory
          .filter((item) => item.type === 32789)
          .reduce((acc, item) => acc + item.amount, 0);
        currentAmount = emptyBuckets + waterBuckets;
      } else {
        currentAmount = inventory
          .filter((item) => item.type === req.type)
          .reduce((acc, item) => acc + item.amount, 0);
      }

      const target = req.target || 0;
      const needed = target - currentAmount;

      console.log(
        `  🔍 Target item type ${req.type}: current=${currentAmount}, target=${target}, needed=${needed}`
      );

      if (needed > 0) {
        // Need more - get from chest
        let chestSlot: number;
        
        // Special handling for buckets - prefer water buckets, then empty buckets
        if (req.type === 32788) { // Bucket type
          chestSlot = chestInventory.findIndex(
            (item) => item.type === 32789 && item.amount > 0 // Water buckets first
          );
          if (chestSlot === -1) {
            chestSlot = chestInventory.findIndex(
              (item) => item.type === 32788 && item.amount > 0 // Empty buckets as fallback
            );
          }
        } else {
          chestSlot = chestInventory.findIndex(
            (item) => item.type === req.type && item.amount > 0
          );
        }

        if (chestSlot !== -1) {
          const actualItemType = chestInventory[chestSlot].type;
          
          // For buckets, collect all available buckets of the same type
          let totalAvailable = 0;
          const bucketSlots: number[] = [];
          
          if (req.type === 32788) { // Special bucket handling
            // Collect all water buckets or empty buckets
            for (let i = 0; i < chestInventory.length; i++) {
              if (chestInventory[i].type === actualItemType && chestInventory[i].amount > 0) {
                bucketSlots.push(i);
                totalAvailable += chestInventory[i].amount;
              }
            }
          } else {
            // Regular item handling
            totalAvailable = chestInventory[chestSlot].amount;
            bucketSlots.push(chestSlot);
          }
          
          const toTake = Math.min(needed, totalAvailable);
          console.log(
            `  🔄 Found ${totalAvailable}x type ${actualItemType} in chest, taking ${toTake}`
          );
          
          try {
            await bot.inventory.transferExactAmount(
              chestEntityId,
              bot.player.characterEntityId,
              actualItemType,
              toTake
            );
            console.log(
              `  ✅ Got ${toTake}x type ${actualItemType} from chest (target adjustment)`
            );

            // Refresh inventories
            inventory = await bot.inventory.getInventory(
              bot.player.characterEntityId
            );
            chestInventory = await bot.inventory.getInventory(chestEntityId);
          } catch (error) {
            console.log(
              `  ❌ Failed to get target item type ${req.type}: ${error}`
            );
          }
        } else {
          if (req.type === 32788) {
            console.log(
              `  ⚠️ No buckets (empty or water) found in chest`
            );
          } else {
            console.log(
              `  ⚠️ Type ${req.type} not found in chest or no available amount`
            );
          }
        }
      } else if (
        needed < 0 &&
        req.max !== undefined &&
        currentAmount > req.max
      ) {
        // Have too many - store excess in chest
        const excess = currentAmount - target;
        const playerSlot = inventory.findIndex(
          (item) => item.type === req.type && item.amount > 0
        );

        if (playerSlot !== -1) {
          const toStore = Math.min(excess, inventory[playerSlot].amount);
          try {
            await bot.inventory.transferExactAmount(
              bot.player.characterEntityId,
              chestEntityId,
              req.type,
              toStore
            );
            console.log(
              `  ✅ Stored ${toStore}x type ${req.type} in chest (excess removal)`
            );

            // Refresh inventories
            inventory = await bot.inventory.getInventory(
              bot.player.characterEntityId
            );
            chestInventory = await bot.inventory.getInventory(chestEntityId);
          } catch (error) {
            console.log(
              `  ❌ Failed to store excess item type ${req.type}: ${error}`
            );
          }
        }
      }
    }

    console.log("✅ Inventory management completed!");
  }
}
