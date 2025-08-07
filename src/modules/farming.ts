import { DustGameBase } from "../core/base.js";
import { Vec3, getObjectIdByName } from "../types";
import { packVec3, isValidCoordinate } from "../utils.js";
import { InventoryModule } from "./inventory.js";
import { WorldModule } from "./world.js";

export class FarmingModule extends DustGameBase {
  private inventory: InventoryModule;
  private world: WorldModule;
  private harvestingDelay: number = 700;

  constructor() {
    super();
    this.inventory = new InventoryModule();
    this.world = new WorldModule();
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
  async wetFarmland(coord: Vec3, bucketSlot: number): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

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
    if (seedSlot[0] === -1) {
      throw new Error(`Seed type ${seedType} not found in inventory`);
    }
    await this.plant(coord, seedSlot[0]);
  }

  async growSeed(coord: Vec3): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }
    await this.executeSystemCallNonBlocking(
      this.SYSTEM_IDS.NATURE_SYSTEM,
      "growSeed(bytes32,uint96)",
      [
        this.characterEntityId,
        packVec3({ x: coord.x, y: coord.y + 1, z: coord.z }),
      ],
      "Growing seed"
    );
    await new Promise((resolve) => setTimeout(resolve, this.harvestingDelay));
  }

  // Harvest crops (if this function exists in the game - may need different system)
  async harvest(coord: Vec3): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(`🚜 Harvesting at (${coord.x}, ${coord.y}, ${coord.z})`);

    await this.executeSystemCallNonBlocking(
      this.SYSTEM_IDS.MINE_SYSTEM,
      "mineUntilDestroyed(bytes32,uint96,bytes)",
      [
        this.characterEntityId,
        packVec3({ x: coord.x, y: coord.y + 1, z: coord.z }),
        "0x",
      ],
      "Harvesting crops"
    );
    await new Promise((resolve) => setTimeout(resolve, this.harvestingDelay));
  }

  async isPlantReadyToGrow(coord: Vec3): Promise<boolean> {
    const plantTableId =
      "0x746200000000000000000000000000005365656447726f777468000000000000";

    const blockID = await this.world.encodeBlock(coord);
    const result = await this.getRecord(plantTableId, [blockID]);

    if (!result.staticData || result.staticData === "0x") {
      return false;
    }

    const hexData = result.staticData.slice(2);
    if (hexData.length < 8) {
      return false;
    }

    // Extract timestamp from the last 8 hex chars (4 bytes)
    const fullyGrownAtHex = hexData.slice(-8);
    const fullyGrownAt = BigInt("0x" + fullyGrownAtHex);

    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    return fullyGrownAt <= currentTime;
  }
}
