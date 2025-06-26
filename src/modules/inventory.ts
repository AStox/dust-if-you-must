import { DustGameBase } from "../core/base.js";
import { getObjectIdByName, ObjectTypes } from "../types/objectTypes.js";

export class InventoryModule extends DustGameBase {
  // Get inventory slot contents
  async getInventorySlot(
    slot: number
  ): Promise<{ itemType: number; amount: number } | null> {
    try {
      const inventoryTableId =
        "0x74620000000000000000000000000000496e76656e746f7279536c6f74000000";

      // Create key tuple for the inventory slot - convert slot number to bytes32
      const slotBytes32 = "0x" + slot.toString(16).padStart(64, "0");
      const keyTuple = [this.characterEntityId, slotBytes32];

      // Get record from inventory table
      const result = await this.getRecord(inventoryTableId, keyTuple);

      // Decode inventory data from staticData
      // Assuming inventory stores itemType (4 bytes) and amount (4 bytes)
      const staticData = result.staticData;

      if (staticData.length < 18) {
        // 0x + 16 hex chars (8 bytes)
        console.log("Invalid data");
        return null; // Invalid data
      }

      // Extract itemType and amount from the end of staticData
      const hexData = staticData.slice(2);

      // The actual data is at the end - last 8 hex chars (4 bytes)
      const dataSection = hexData.slice(-8); // "80150001"

      // Parse as: itemType (8015) and amount (0001) - 2 bytes each
      const itemTypeHex = dataSection.slice(0, 4); // "8015"
      const amountHex = dataSection.slice(4, 8); // "0001"

      const itemType = parseInt(itemTypeHex, 16);
      const amount = parseInt(amountHex, 16);

      return { itemType, amount };
    } catch (error) {
      console.log(`⚠️ Failed to read inventory slot ${slot}:`, error);
      return null;
    }
  }
  // Check if a specific slot contains a specific item type
  async slotContains(slot: number, itemType: number): Promise<boolean> {
    const slotContents = await this.getInventorySlot(slot);
    return slotContents?.itemType === itemType;
  }

  // Find first slot containing a specific item type (returns slot number or -1)
  async findItemType(itemType: number, maxSlots: number = 10): Promise<number> {
    for (let slot = 0; slot < maxSlots; slot++) {
      if (await this.slotContains(slot, itemType)) {
        return slot;
      }
    }
    return -1; // Not found
  }

  // Check if player has any of a specific item type
  async hasItemType(itemType: number, maxSlots: number = 10): Promise<boolean> {
    return (await this.findItemType(itemType, maxSlots)) !== -1;
  }

  // Count total amount of specific item type across all slots
  async countItemType(
    itemType: number,
    maxSlots: number = 10
  ): Promise<number> {
    let total = 0;
    for (let slot = 0; slot < maxSlots; slot++) {
      const slotContents = await this.getInventorySlot(slot);
      if (slotContents?.itemType === itemType) {
        total += slotContents.amount;
      }
    }
    return total;
  }

  // Get a descriptive string of what's in a slot
  async getSlotDescription(slot: number): Promise<string> {
    const slotContents = await this.getInventorySlot(slot);

    if (!slotContents) {
      return "Empty slot";
    }

    return ObjectTypes[slotContents.itemType].name;
  }

  // Find all slots with empty buckets
  async findEmptyBuckets(maxSlots: number = 10): Promise<number[]> {
    const emptyBucketSlots: number[] = [];
    for (let slot = 0; slot < maxSlots; slot++) {
      if (await this.slotContains(slot, getObjectIdByName("Bucket") ?? 0)) {
        emptyBucketSlots.push(slot);
      }
    }
    return emptyBucketSlots;
  }

  // Find all slots with water buckets
  async findWaterBuckets(maxSlots: number = 10): Promise<number[]> {
    const waterBucketSlots: number[] = [];
    for (let slot = 0; slot < maxSlots; slot++) {
      if (
        await this.slotContains(slot, getObjectIdByName("WaterBucket") ?? 0)
      ) {
        waterBucketSlots.push(slot);
      }
    }
    return waterBucketSlots;
  }

  // Get comprehensive inventory summary for debugging
  async getInventorySummary(): Promise<{ type: number; amount: number }[]> {
    // Show all non-empty slots
    const nonEmptySlots: { type: number; amount: number }[] = [];
    for (let slot = 0; slot < 40; slot++) {
      const slotContents = await this.getInventorySlot(slot);
      if (slotContents?.itemType !== 0) {
        nonEmptySlots.push({
          type: slotContents!.itemType,
          amount: slotContents!.amount,
        });
      }
    }

    return nonEmptySlots;
  }
}
