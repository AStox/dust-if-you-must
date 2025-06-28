import { DustGameBase } from "../core/base.js";
import { Vec3 } from "../types.js";
import { packVec3, isValidCoordinate } from "../utils.js";
import { ObjectTypes, getObjectIdByName } from "../types/objectTypes.js";
import { InventoryModule } from "./inventory.js";

export class FarmingModule extends DustGameBase {
  private inventory: InventoryModule;

  constructor() {
    super();
    this.inventory = new InventoryModule();
  }

  // Fill bucket from water source (BucketSystem)
  async fillBucket(coord: Vec3, slot: number = 0): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `💧 Filling bucket at (${coord.x}, ${coord.y}, ${coord.z}) from slot ${slot}`
    );

    await this.executeSystemCallNonBlocking(
      this.SYSTEM_IDS.BUCKET_SYSTEM,
      "fillBucket(bytes32,uint96,uint16)",
      [this.characterEntityId, packVec3(coord), slot],
      "Filling bucket"
    );
  }

  // Wet farmland with water (BucketSystem)
  async wetFarmland(coord: Vec3): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    const bucketSlot = await this.inventory.getSlotForItemType(
      getObjectIdByName("WaterBucket")!
    );
    console.log(
      `🌾 Watering farmland at (${coord.x}, ${coord.y}, ${coord.z}) with bucket from slot ${bucketSlot}`
    );

    await this.executeSystemCallNonBlocking(
      this.SYSTEM_IDS.BUCKET_SYSTEM,
      "wetFarmland(bytes32,uint96,uint16)",
      [this.characterEntityId, packVec3(coord), bucketSlot],
      "Watering farmland"
    );
  }

  // Till farmland (FarmingSystem)
  async till(coord: Vec3, toolSlot: number = 0): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `🚜 Tilling farmland at (${coord.x}, ${coord.y}, ${coord.z}) with tool from slot ${toolSlot}`
    );

    await this.executeSystemCall(
      this.SYSTEM_IDS.FARMING_SYSTEM,
      "till(bytes32,uint96,uint16)",
      [this.characterEntityId, packVec3(coord), toolSlot],
      "Tilling farmland"
    );
  }

  // Plant seeds (if this function exists in the game - may need different system)
  async plant(coord: Vec3, seedSlot: number = 0): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `🌱 Planting seeds at (${coord.x}, ${coord.y}, ${coord.z}) from slot ${seedSlot}`
    );

    await this.executeSystemCallNonBlocking(
      this.SYSTEM_IDS.BUILD_SYSTEM,
      "build(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3({ x: coord.x, y: coord.y + 1, z: coord.z }),
        seedSlot,
        "0x",
      ],
      "Planting seeds"
    );
  }

  async plantSeedType(coord: Vec3, seedType: number): Promise<void> {
    const seedSlot = await this.inventory.getSlotForItemType(seedType);
    if (seedSlot === -1) {
      throw new Error(`Seed type ${seedType} not found in inventory`);
    }
    await this.plant(coord, seedSlot);
  }

  // Harvest crops (if this function exists in the game - may need different system)
  async harvest(coord: Vec3): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(`🚜 Harvesting at (${coord.x}, ${coord.y}, ${coord.z})`);

    await this.executeSystemCallNonBlocking(
      this.SYSTEM_IDS.BUILD_SYSTEM,
      "mineUntilDestroyed(bytes32,uint96,bytes)",
      [this.characterEntityId, packVec3(coord), "0x"],
      "Harvesting crops"
    );
  }
}
