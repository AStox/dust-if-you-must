import { DustGameBase } from "../core/base.js";
import { EntityId, getObjectIdByName } from "../types";
import { packVec3 } from "../utils.js";
import { WorldModule } from "./world.js";

export class InventoryModule extends DustGameBase {
  private world: WorldModule;
  constructor() {
    super();
    this.world = new WorldModule();
  }

  // Get maximum stack size for an item type
  private getMaxStackSize(itemType: number): number {
    // Get the item name to determine stack size
    const bucketId = getObjectIdByName("Bucket");
    const waterBucketId = getObjectIdByName("WaterBucket");

    // Tools and equipment typically don't stack (max size = 1)
    const nonStackableItems = new Set([
      bucketId, // Empty buckets
      waterBucketId, // Water buckets
      // Add other tools/equipment as needed
      32768, // WoodenPick
      32769, // CopperPick
      32770, // IronPick
      32771, // GoldPick
      32772, // DiamondPick
      32773, // NeptuniumPick
      32774, // WoodenAxe
      32775, // CopperAxe
      32776, // IronAxe
      32777, // GoldAxe
      32778, // DiamondAxe
      32779, // NeptuniumAxe
      32780, // WoodenWhacker
      32781, // CopperWhacker
      32782, // IronWhacker
      32783, // WoodenHoe
    ]);

    // Return 1 for non-stackable items, 99 for stackable items
    return nonStackableItems.has(itemType) ? 1 : 99;
  }

  // Get inventory slot contents
  async getInventorySlot(
    slot: number,
    entityId: EntityId
  ): Promise<{ itemType: number; amount: number } | null> {
    try {
      const inventoryTableId =
        "0x74620000000000000000000000000000496e76656e746f7279536c6f74000000";

      // Create key tuple for the inventory slot - convert slot number to bytes32
      const slotBytes32 = "0x" + slot.toString(16).padStart(64, "0");
      const keyTuple = [entityId, slotBytes32];

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
  async getInventory(
    entityId: EntityId
  ): Promise<{ type: number; amount: number }[]> {
    // Show all non-empty slots
    const slots: { type: number; amount: number }[] = [];
    for (let slot = 0; slot < 40; slot++) {
      const slotContents = await this.getInventorySlot(slot, entityId);
      slots.push({
        type: slotContents!.itemType,
        amount: slotContents!.amount,
      });
    }

    return slots;
  }

  async getSlotForItemType(
    itemType: number,
    entityId: EntityId = this.characterEntityId
  ): Promise<[number, number]> {
    for (let slot = 0; slot < 40; slot++) {
      const slotContents = await this.getInventorySlot(slot, entityId);
      if (slotContents?.itemType === itemType) {
        return [slot, slotContents.amount];
      }
    }
    return [-1, -1];
  }

  async getAllSlotsForItemType(
    itemType: number,
    entityId: EntityId = this.characterEntityId
  ): Promise<[number, number][]> {
    const slots: [number, number][] = [];
    for (let slot = 0; slot < 40; slot++) {
      const slotContents = await this.getInventorySlot(slot, entityId);
      if (slotContents?.itemType === itemType) {
        slots.push([slot, slotContents.amount]);
      }
    }
    return slots;
  }

  async getEmptySlot(entityId: EntityId): Promise<number> {
    for (let slot = 0; slot < 40; slot++) {
      const slotContents = await this.getInventorySlot(slot, entityId);
      if (slotContents?.itemType === 0) {
        return slot;
      }
    }
    return -1; // No empty slot found
  }

  async transfer(
    fromEntityId: EntityId,
    toEntityId: EntityId,
    transfers: [number, number, number][] // [slot, amount, amount]
  ): Promise<void> {
    console.log("transfers", transfers);
    await this.executeSystemCall(
      this.SYSTEM_IDS.TRANSFER_SYSTEM,
      "transfer(bytes32,bytes32,bytes32,(uint16,uint16,uint16)[],bytes)",
      [this.characterEntityId, fromEntityId, toEntityId, transfers, "0x"],
      "Transferring amount"
    );
  }

  async transferAmount(
    fromEntityId: EntityId,
    toEntityId: EntityId,
    itemType: number,
    amount: number
  ): Promise<void> {
    const slotsWithItemType = await this.getAllSlotsForItemType(
      itemType,
      fromEntityId
    );
    if (slotsWithItemType.length === 0) {
      console.log("No slot found for item type", itemType);
      return;
    }

    // Calculate fromSlots - which slots to take from and how much
    const fromSlots: [number, number][] = [];
    let amountRemaining = amount;
    for (const slot of slotsWithItemType) {
      if (slot[1] >= amountRemaining) {
        fromSlots.push([slot[0], amountRemaining]);
        amountRemaining = 0;
      } else {
        fromSlots.push(slot);
        amountRemaining -= slot[1];
      }
      if (amountRemaining === 0) {
        break;
      }
    }

    if (amountRemaining > 0) {
      throw new Error(
        `Not enough items! Need ${amount}, only have ${
          amount - amountRemaining
        }`
      );
    }

    // Calculate toSlots - where to put items and how much to add
    const existingToSlots = await this.getAllSlotsForItemType(
      itemType,
      toEntityId
    );
    amountRemaining = amount;
    const targetSlots: [number, number][] = []; // [slotIndex, amountToAdd]

    // Get max stack size for this item type
    const maxStackSize = this.getMaxStackSize(itemType);
    console.log(`📏 Item type ${itemType} has max stack size: ${maxStackSize}`);

    // First, try to fill existing slots up to maxStackSize
    for (const [slotIndex, currentAmount] of existingToSlots) {
      if (currentAmount < maxStackSize && amountRemaining > 0) {
        const spaceAvailable = maxStackSize - currentAmount;
        const amountToAdd = Math.min(spaceAvailable, amountRemaining);
        targetSlots.push([slotIndex, amountToAdd]);
        amountRemaining -= amountToAdd;
        console.log(
          `  📦 Using existing slot ${slotIndex}: adding ${amountToAdd} (${currentAmount} + ${amountToAdd} = ${
            currentAmount + amountToAdd
          }/${maxStackSize})`
        );
      }
    }

    // If we still have amount remaining, find and allocate empty slots
    if (amountRemaining > 0) {
      console.log(
        `  🔍 Need ${amountRemaining} more items, finding empty slots...`
      );

      // Get all empty slots upfront
      const emptySlots: number[] = [];
      for (let slot = 0; slot < 40; slot++) {
        const slotContents = await this.getInventorySlot(slot, toEntityId);
        if (slotContents?.itemType === 0) {
          emptySlots.push(slot);
        }
      }

      console.log(
        `  📋 Found ${emptySlots.length} empty slots: [${emptySlots
          .slice(0, 10)
          .join(", ")}${emptySlots.length > 10 ? "..." : ""}]`
      );

      let emptySlotIndex = 0;
      while (amountRemaining > 0 && emptySlotIndex < emptySlots.length) {
        const emptySlot = emptySlots[emptySlotIndex];
        const amountForSlot = Math.min(maxStackSize, amountRemaining);
        targetSlots.push([emptySlot, amountForSlot]);
        amountRemaining -= amountForSlot;
        console.log(
          `  📦 Using empty slot ${emptySlot}: adding ${amountForSlot}/${maxStackSize}`
        );
        emptySlotIndex++;
      }

      if (amountRemaining > 0) {
        throw new Error(
          `No empty slots available! Need ${amountRemaining} more space but only found ${emptySlots.length} empty slots.`
        );
      }
    }

    // Calculate individual transfers [fromSlot, toSlot, amount]
    const transfers: [number, number, number][] = [];
    let targetSlotIndex = 0;
    let amountUsedFromCurrentTarget = 0; // How much we've used from current target slot capacity

    for (const [fromSlot, fromAmount] of fromSlots) {
      let amountLeftToTransfer = fromAmount;

      while (amountLeftToTransfer > 0 && targetSlotIndex < targetSlots.length) {
        const [toSlot, targetCapacity] = targetSlots[targetSlotIndex];
        const amountLeftInTarget = targetCapacity - amountUsedFromCurrentTarget;
        const amountToTransfer = Math.min(
          amountLeftToTransfer,
          amountLeftInTarget
        );

        if (amountToTransfer > 0) {
          transfers.push([fromSlot, toSlot, amountToTransfer]);
          amountLeftToTransfer -= amountToTransfer;
          amountUsedFromCurrentTarget += amountToTransfer;
        }

        // If target slot is full, move to next target slot
        if (amountUsedFromCurrentTarget >= targetCapacity) {
          targetSlotIndex++;
          amountUsedFromCurrentTarget = 0;
        }
      }
    }

    await this.transfer(fromEntityId, toEntityId, transfers);
  }

  async pickUpAll(entityId: EntityId): Promise<void> {
    const position = await this.world.getPositionOfEntity(entityId);
    const packed = packVec3({
      x: position.x,
      y: position.y,
      z: position.z,
    });

    await this.executeSystemCall(
      this.SYSTEM_IDS.INVENTORY_SYSTEM,
      "pickupAll(bytes32,uint96)",
      [entityId, packed],
      "Picking up all"
    );
  }

  async eat(slot: number): Promise<void> {
    await this.executeSystemCall(
      this.SYSTEM_IDS.FOOD_SYSTEM,
      "eat(bytes32,(uint16,uint16))",
      [this.characterEntityId, [slot, 1]],
      "Eating"
    );
  }
}
