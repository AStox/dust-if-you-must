import { DustGameBase } from "../core/base.js";
import { Vec3, ObjectType } from "../types.js";
import { packVec3, isValidCoordinate } from "../utils.js";

export class BuildingModule extends DustGameBase {
  // Mine a block at specific coordinates (MineSystem)
  async mine(coord: Vec3, toolSlot: number = 0): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `⛏️ Mining at (${coord.x}, ${coord.y}, ${coord.z}) with tool from slot ${toolSlot}`
    );

    await this.executeSystemCall(
      this.SYSTEM_IDS.MINE_SYSTEM,
      "mine(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        toolSlot,
        "0x", // empty extraData
      ],
      "Mining block"
    );
  }

  // Mine until block is destroyed (MineSystem)
  async mineUntilDestroyed(coord: Vec3, toolSlot: number = 0): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `⛏️ Mining until destroyed at (${coord.x}, ${coord.y}, ${coord.z}) with tool from slot ${toolSlot}`
    );

    await this.executeSystemCall(
      this.SYSTEM_IDS.MINE_SYSTEM,
      "mineUntilDestroyed(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        toolSlot,
        "0x", // empty extraData
      ],
      "Mining until destroyed"
    );
  }

  // Get random ore type (MineSystem utility function)
  async getRandomOreType(): Promise<void> {
    console.log(`🎲 Getting random ore type`);

    await this.executeSystemCall(
      this.SYSTEM_IDS.MINE_SYSTEM,
      "getRandomOreType(bytes32)",
      [this.characterEntityId],
      "Getting random ore type"
    );
  }

  // Build/place a block at specific coordinates (BuildSystem)
  async build(
    coord: Vec3,
    slot: number = 0,
    blockType: ObjectType = ObjectType.DIRT
  ): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `🔨 Building ${ObjectType[blockType]} at (${coord.x}, ${coord.y}, ${coord.z}) from slot ${slot}`
    );

    await this.executeSystemCall(
      this.SYSTEM_IDS.BUILD_SYSTEM,
      "build(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        slot,
        "0x", // empty extraData - could contain block type info
      ],
      "Building block"
    );
  }

  // Build with specific orientation (BuildSystem)
  async buildWithOrientation(
    coord: Vec3,
    slot: number = 0,
    orientation: number = 0
  ): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `🔨 Building with orientation ${orientation} at (${coord.x}, ${coord.y}, ${coord.z}) from slot ${slot}`
    );

    await this.executeSystemCall(
      this.SYSTEM_IDS.BUILD_SYSTEM,
      "buildWithOrientation(bytes32,uint96,uint16,uint8,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        slot,
        orientation,
        "0x", // empty extraData
      ],
      "Building with orientation"
    );
  }

  // Jump build - build while jumping (BuildSystem)
  async jumpBuild(coord: Vec3, slot: number = 0): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `🦘 Jump building at (${coord.x}, ${coord.y}, ${coord.z}) from slot ${slot}`
    );

    await this.executeSystemCall(
      this.SYSTEM_IDS.BUILD_SYSTEM,
      "jumpBuild(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        slot,
        "0x", // empty extraData
      ],
      "Jump building"
    );
  }

  // Jump build with orientation (BuildSystem)
  async jumpBuildWithOrientation(
    coord: Vec3,
    slot: number = 0,
    orientation: number = 0
  ): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `🦘 Jump building with orientation ${orientation} at (${coord.x}, ${coord.y}, ${coord.z}) from slot ${slot}`
    );

    await this.executeSystemCall(
      this.SYSTEM_IDS.BUILD_SYSTEM,
      "jumpBuildWithOrientation(bytes32,uint96,uint16,uint8,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        slot,
        orientation,
        "0x", // empty extraData
      ],
      "Jump building with orientation"
    );
  }

  // Mine multiple blocks in sequence
  async mineMultipleBlocks(
    coords: Vec3[],
    toolSlot: number = 0,
    useDestroy: boolean = false
  ): Promise<void> {
    const action = useDestroy ? "mining until destroyed" : "mining";
    console.log(`⛏️ ${action} ${coords.length} blocks...`);

    for (const [index, coord] of coords.entries()) {
      console.log(
        `⛏️ ${action} block ${index + 1}/${coords.length} at (${coord.x}, ${
          coord.y
        }, ${coord.z})`
      );

      if (useDestroy) {
        await this.mineUntilDestroyed(coord, toolSlot);
      } else {
        await this.mine(coord, toolSlot);
      }

      // Small delay between mining operations
      if (index < coords.length - 1) {
        console.log("⏳ Waiting 1 second before next block...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log("✅ All blocks mined!");
  }

  // Build multiple blocks in sequence
  async buildMultipleBlocks(
    coords: Vec3[],
    slot: number = 0,
    blockType: ObjectType = ObjectType.DIRT,
    useJumpBuild: boolean = false,
    orientation?: number
  ): Promise<void> {
    const buildMethod = useJumpBuild ? "jump building" : "building";
    console.log(
      `🔨 ${buildMethod} ${coords.length} ${ObjectType[blockType]} blocks...`
    );

    for (const [index, coord] of coords.entries()) {
      console.log(
        `🔨 ${buildMethod} block ${index + 1}/${coords.length} at (${
          coord.x
        }, ${coord.y}, ${coord.z})`
      );

      if (useJumpBuild) {
        if (orientation !== undefined) {
          await this.jumpBuildWithOrientation(coord, slot, orientation);
        } else {
          await this.jumpBuild(coord, slot);
        }
      } else {
        if (orientation !== undefined) {
          await this.buildWithOrientation(coord, slot, orientation);
        } else {
          await this.build(coord, slot, blockType);
        }
      }

      // Small delay between building operations
      if (index < coords.length - 1) {
        console.log("⏳ Waiting 1 second before next block...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log("✅ All blocks built!");
  }

  // Clear an area by mining all blocks in a rectangular region
  async clearArea(
    start: Vec3,
    end: Vec3,
    toolSlot: number = 0,
    useDestroy: boolean = true
  ): Promise<void> {
    const coords = this.generateRectangleCoords(start, end);
    const action = useDestroy ? "clearing with destroy" : "clearing";
    console.log(
      `🗑️ ${action} area from (${start.x},${start.y},${start.z}) to (${end.x},${end.y},${end.z})`
    );
    console.log(`📊 Total blocks to mine: ${coords.length}`);

    await this.mineMultipleBlocks(coords, toolSlot, useDestroy);
  }

  // Fill an area by building blocks in a rectangular region
  async fillArea(
    start: Vec3,
    end: Vec3,
    slot: number = 0,
    blockType: ObjectType = ObjectType.DIRT,
    useJumpBuild: boolean = false
  ): Promise<void> {
    const coords = this.generateRectangleCoords(start, end);
    const buildMethod = useJumpBuild ? "jump building" : "building";
    console.log(
      `🏗️ ${buildMethod} area from (${start.x},${start.y},${start.z}) to (${end.x},${end.y},${end.z})`
    );
    console.log(`📊 Total blocks to build: ${coords.length}`);

    await this.buildMultipleBlocks(coords, slot, blockType, useJumpBuild);
  }

  // Build a wall between two points
  async buildWall(
    start: Vec3,
    end: Vec3,
    height: number = 3,
    slot: number = 0,
    blockType: ObjectType = ObjectType.DIRT,
    orientation?: number
  ): Promise<void> {
    console.log(
      `🧱 Building wall from (${start.x},${start.z}) to (${end.x},${end.z}) with height ${height}`
    );

    const wallCoords: Vec3[] = [];

    // Generate coordinates for the wall
    const dx = Math.abs(end.x - start.x);
    const dz = Math.abs(end.z - start.z);
    const steps = Math.max(dx, dz);

    for (let step = 0; step <= steps; step++) {
      const t = steps === 0 ? 0 : step / steps;
      const x = Math.round(start.x + (end.x - start.x) * t);
      const z = Math.round(start.z + (end.z - start.z) * t);

      // Add blocks for each height level
      for (let y = start.y; y < start.y + height; y++) {
        wallCoords.push({ x, y, z });
      }
    }

    await this.buildMultipleBlocks(
      wallCoords,
      slot,
      blockType,
      false,
      orientation
    );
  }

  // Create a simple house structure
  async buildSimpleHouse(
    corner: Vec3,
    width: number = 5,
    length: number = 5,
    height: number = 3,
    slot: number = 0
  ): Promise<void> {
    console.log(
      `🏠 Building house at (${corner.x},${corner.y},${corner.z}) size ${width}x${length}x${height}`
    );

    // Build floor
    const floorCoords = this.generateRectangleCoords(corner, {
      x: corner.x + width - 1,
      y: corner.y,
      z: corner.z + length - 1,
    });

    // Build walls (hollow rectangle for each height level)
    const wallCoords: Vec3[] = [];
    for (let y = corner.y + 1; y <= corner.y + height; y++) {
      // Front and back walls
      for (let x = corner.x; x < corner.x + width; x++) {
        wallCoords.push({ x, y, z: corner.z });
        wallCoords.push({ x, y, z: corner.z + length - 1 });
      }
      // Left and right walls (excluding corners already added)
      for (let z = corner.z + 1; z < corner.z + length - 1; z++) {
        wallCoords.push({ x: corner.x, y, z });
        wallCoords.push({ x: corner.x + width - 1, y, z });
      }
    }

    console.log("🏗️ Building floor...");
    await this.buildMultipleBlocks(floorCoords, slot, ObjectType.DIRT);

    console.log("🧱 Building walls...");
    await this.buildMultipleBlocks(wallCoords, slot, ObjectType.DIRT);

    console.log("✅ House construction completed!");
  }

  // Generate coordinates for a rectangular area
  private generateRectangleCoords(start: Vec3, end: Vec3): Vec3[] {
    const coords: Vec3[] = [];

    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const minZ = Math.min(start.z, end.z);
    const maxZ = Math.max(start.z, end.z);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          coords.push({ x, y, z });
        }
      }
    }

    return coords;
  }

  // Check what block type is at a coordinate (would need actual game state reading)
  async getBlockType(coord: Vec3): Promise<ObjectType | null> {
    console.log(
      "🔍 Block type checking not implemented yet - need to read from game tables"
    );
    console.log(`🎯 Checking block at: (${coord.x}, ${coord.y}, ${coord.z})`);
    return null; // Placeholder
  }

  // Check if a coordinate is empty/can be built on (would need actual game state reading)
  async isBuildable(coord: Vec3): Promise<boolean> {
    console.log(
      "🔍 Buildability checking not implemented yet - need to read from game tables"
    );
    console.log(
      `🎯 Checking if buildable at: (${coord.x}, ${coord.y}, ${coord.z})`
    );
    return true; // Placeholder - assume buildable
  }
}
