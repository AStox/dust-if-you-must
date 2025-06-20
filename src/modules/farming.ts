import { DustGameBase } from "../core/base.js";
import { Vec3 } from "../types.js";
import { packVec3, isValidCoordinate } from "../utils.js";

export class FarmingModule extends DustGameBase {
  // Fill bucket from water source (BucketSystem)
  async fillBucket(coord: Vec3, slot: number = 0): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `💧 Filling bucket at (${coord.x}, ${coord.y}, ${coord.z}) from slot ${slot}`
    );

    await this.executeSystemCall(
      this.SYSTEM_IDS.BUCKET_SYSTEM,
      "fillBucket(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        slot,
        "0x", // empty extraData
      ],
      "Filling bucket"
    );
  }

  // Wet farmland with water (BucketSystem)
  async wetFarmland(coord: Vec3, slot: number = 0): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `🌾 Watering farmland at (${coord.x}, ${coord.y}, ${coord.z}) with bucket from slot ${slot}`
    );

    await this.executeSystemCall(
      this.SYSTEM_IDS.BUCKET_SYSTEM,
      "wetFarmland(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        slot,
        "0x", // empty extraData
      ],
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
      "till(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        toolSlot,
        "0x", // empty extraData
      ],
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

    await this.executeSystemCall(
      this.SYSTEM_IDS.FARMING_SYSTEM,
      "plant(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        seedSlot,
        "0x", // empty extraData
      ],
      "Planting seeds"
    );
  }

  // Harvest crops (if this function exists in the game - may need different system)
  async harvest(coord: Vec3, toolSlot: number = 0): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `🚜 Harvesting at (${coord.x}, ${coord.y}, ${coord.z}) with tool from slot ${toolSlot}`
    );

    await this.executeSystemCall(
      this.SYSTEM_IDS.FARMING_SYSTEM,
      "harvest(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        toolSlot,
        "0x", // empty extraData
      ],
      "Harvesting crops"
    );
  }

  // Complete farming cycle: till -> fill bucket -> wet farmland -> plant
  async farmingCycle(
    waterSource: Vec3,
    farmlandCoord: Vec3,
    bucketSlot: number = 0,
    seedSlot: number = 1,
    toolSlot: number = 2
  ): Promise<void> {
    console.log("🚜 Starting complete farming cycle...");

    try {
      // 1. Till the farmland first
      await this.till(farmlandCoord, toolSlot);

      // 2. Fill bucket from water source
      await this.fillBucket(waterSource, bucketSlot);

      // 3. Water the farmland
      await this.wetFarmland(farmlandCoord, bucketSlot);

      // 4. Plant seeds
      await this.plant(farmlandCoord, seedSlot);

      console.log(
        "✅ Farming cycle completed! Crops are planted and will grow over time."
      );
      console.log("💡 Use harvest() later to collect the grown crops.");
    } catch (error) {
      throw error;
    }
  }

  // Till multiple plots
  async tillMultiplePlots(coords: Vec3[], toolSlot: number = 0): Promise<void> {
    console.log(`🚜 Tilling ${coords.length} farmland plots...`);

    for (const [index, coord] of coords.entries()) {
      console.log(`🚜 Tilling plot ${index + 1}/${coords.length}`);

      await this.till(coord, toolSlot);

      // Small delay between operations
      if (index < coords.length - 1) {
        console.log("⏳ Waiting 1 second before next plot...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log("✅ All farmland plots tilled!");
  }

  // Water multiple farmland plots in sequence
  async waterMultiplePlots(
    waterSource: Vec3,
    farmlandCoords: Vec3[],
    bucketSlot: number = 0
  ): Promise<void> {
    console.log(`💧 Watering ${farmlandCoords.length} farmland plots...`);

    for (const [index, coord] of farmlandCoords.entries()) {
      console.log(`💧 Watering plot ${index + 1}/${farmlandCoords.length}`);

      // Fill bucket before watering each plot (in case it empties)
      await this.fillBucket(waterSource, bucketSlot);
      await this.wetFarmland(coord, bucketSlot);

      // Small delay between operations
      if (index < farmlandCoords.length - 1) {
        console.log("⏳ Waiting 1 second before next plot...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log("✅ All farmland plots watered!");
  }

  // Complete setup for multiple farms: till all -> water all -> plant all
  async setupMultipleFarms(
    waterSource: Vec3,
    farmlandCoords: Vec3[],
    bucketSlot: number = 0,
    seedSlot: number = 1,
    toolSlot: number = 2
  ): Promise<void> {
    console.log(`🌾 Setting up ${farmlandCoords.length} farm plots...`);

    try {
      // 1. Till all plots first
      await this.tillMultiplePlots(farmlandCoords, toolSlot);

      // 2. Water all plots
      await this.waterMultiplePlots(waterSource, farmlandCoords, bucketSlot);

      // 3. Plant seeds in all plots
      console.log(`🌱 Planting seeds in ${farmlandCoords.length} plots...`);
      for (const [index, coord] of farmlandCoords.entries()) {
        console.log(
          `🌱 Planting in plot ${index + 1}/${farmlandCoords.length}`
        );
        await this.plant(coord, seedSlot);

        if (index < farmlandCoords.length - 1) {
          console.log("⏳ Waiting 1 second before next plot...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log("✅ All farms set up successfully!");
    } catch (error) {
      throw error;
    }
  }

  // Generate a grid of farmland coordinates around a center point
  generateFarmGrid(center: Vec3, width: number, height: number): Vec3[] {
    const coords: Vec3[] = [];
    const startX = center.x - Math.floor(width / 2);
    const startZ = center.z - Math.floor(height / 2);

    for (let x = 0; x < width; x++) {
      for (let z = 0; z < height; z++) {
        coords.push({
          x: startX + x,
          y: center.y,
          z: startZ + z,
        });
      }
    }

    return coords;
  }

  // Check if farmland is watered (would need actual game state reading)
  async isFarmlandWatered(coord: Vec3): Promise<boolean> {
    console.log(
      "🔍 Farmland state checking not implemented yet - need to read from game tables"
    );
    console.log(
      `🎯 Checking farmland at: (${coord.x}, ${coord.y}, ${coord.z})`
    );
    return false; // Placeholder
  }

  // Check crop growth stage (would need actual game state reading)
  async getCropGrowthStage(coord: Vec3): Promise<number> {
    console.log(
      "🔍 Crop growth checking not implemented yet - need to read from game tables"
    );
    console.log(`🎯 Checking crops at: (${coord.x}, ${coord.y}, ${coord.z})`);
    return 0; // Placeholder
  }
}
