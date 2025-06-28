import { DustGameBase } from "../core/base.js";
import { EntityId } from "../types.js";
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

  // Get comprehensive inventory summary for debugging
  async getInventory(): Promise<{ type: number; amount: number }[]> {
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

  async getSlotForItemType(itemType: number): Promise<number> {
    for (let slot = 0; slot < 40; slot++) {
      const slotContents = await this.getInventorySlot(slot);
      if (slotContents?.itemType === itemType) {
        return slot;
      }
    }
    throw new Error(`No slot found for item type ${itemType}`);
  }

  async transferAmount(
    fromEntityId: EntityId,
    toEntityId: EntityId,
    amounts: [number, number][] // [slot, amount]
  ): Promise<void> {
    await this.executeSystemCall(
      this.SYSTEM_IDS.INVENTORY_SYSTEM,
      "transferAmount((bytes32, bytes32, bytes32, amounts[], bytes)",
      [this.characterEntityId, fromEntityId, toEntityId, amounts, "0x"],
      "Transferring amount"
    );
  }
}
