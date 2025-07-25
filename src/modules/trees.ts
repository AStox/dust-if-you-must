import { DustGameBase } from "../core/base.js";
import { Vec3 } from "../types/base.js";
import { getObjectIdByName, ObjectTypes } from "../types/objectTypes.js";
import { packVec3, isValidCoordinate } from "../utils.js";
import { WorldModule } from "./world.js";
import { FarmingModule } from "./farming.js";
import { InventoryModule } from "./inventory.js";

export interface TreeInfo {
  position: Vec3;
  type: TreeType;
  distance: number;
  logPositions: Vec3[];
  leafPositions: Vec3[];
  isFullyGrown: boolean;
}

export interface SaplingInfo {
  position: Vec3;
  type: TreeType;
  distance: number;
  saplingObjectId: number;
  isReadyToGrow: boolean;
}

export type TreeType =
  | "Oak"
  | "Birch"
  | "Jungle"
  | "Sakura"
  | "Acacia"
  | "Spruce"
  | "DarkOak"
  | "Mangrove";

export interface TreeTypeMapping {
  sapling: number;
  log: number;
  leaf: number;
  name: TreeType;
}

/**
 * Trees module for detecting, chopping, and managing trees
 */
export class TreesModule extends DustGameBase {
  private world: WorldModule;
  private farming: FarmingModule;
  private inventory: InventoryModule;

  constructor() {
    super();
    this.world = new WorldModule();
    this.farming = new FarmingModule();
    this.inventory = new InventoryModule();
  }
  /**
   * Get all tree type mappings from object types
   */
  public getTreeTypes(): TreeTypeMapping[] {
    return [
      {
        name: "Oak",
        sapling: getObjectIdByName("OakSapling")!,
        log: getObjectIdByName("OakLog")!,
        leaf: getObjectIdByName("OakLeaf")!,
      },
      {
        name: "Birch",
        sapling: getObjectIdByName("BirchSapling")!,
        log: getObjectIdByName("BirchLog")!,
        leaf: getObjectIdByName("BirchLeaf")!,
      },
      {
        name: "Jungle",
        sapling: getObjectIdByName("JungleSapling")!,
        log: getObjectIdByName("JungleLog")!,
        leaf: getObjectIdByName("JungleLeaf")!,
      },
      {
        name: "Sakura",
        sapling: getObjectIdByName("SakuraSapling")!,
        log: getObjectIdByName("SakuraLog")!,
        leaf: getObjectIdByName("SakuraLeaf")!,
      },
      {
        name: "Acacia",
        sapling: getObjectIdByName("AcaciaSapling")!,
        log: getObjectIdByName("AcaciaLog")!,
        leaf: getObjectIdByName("AcaciaLeaf")!,
      },
      {
        name: "Spruce",
        sapling: getObjectIdByName("SpruceSapling")!,
        log: getObjectIdByName("SpruceLog")!,
        leaf: getObjectIdByName("SpruceLeaf")!,
      },
      {
        name: "DarkOak",
        sapling: getObjectIdByName("DarkOakSapling")!,
        log: getObjectIdByName("DarkOakLog")!,
        leaf: getObjectIdByName("DarkOakLeaf")!,
      },
      {
        name: "Mangrove",
        sapling: getObjectIdByName("MangroveSapling")!,
        log: getObjectIdByName("MangroveLog")!,
        leaf: getObjectIdByName("MangroveLeaf")!,
      },
    ];
  }

  /**
   * Get tree type mapping by any object ID (sapling, log, or leaf)
   */
  public getTreeTypeByObjectId(objectId: number): TreeTypeMapping | null {
    const treeTypes = this.getTreeTypes();
    return (
      treeTypes.find(
        (tree) =>
          tree.sapling === objectId ||
          tree.log === objectId ||
          tree.leaf === objectId
      ) || null
    );
  }

  /**
   * Check if an object ID represents a tree-related object
   */
  public isTreeObject(objectId: number): boolean {
    return this.getTreeTypeByObjectId(objectId) !== null;
  }

  /**
   * Calculate 3D distance between two positions
   */
  private calculateDistance(pos1: Vec3, pos2: Vec3): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Find nearby tree trunk key for associating leaves
   */
  private findNearbyTrunkKey(
    leafPos: Vec3,
    trees: Map<string, TreeInfo>,
    maxDistance: number
  ): string | null {
    let closestTrunkKey: string | null = null;
    let closestDistance = Infinity;

    for (const [treeKey, tree] of trees) {
      const distance = this.calculateDistance(leafPos, tree.position);
      if (distance <= maxDistance && distance < closestDistance) {
        closestDistance = distance;
        closestTrunkKey = treeKey;
      }
    }

    return closestTrunkKey;
  }

  /**
   * Scan for trees in a bounding box defined by two corners
   */
  async scanForTrees(corner1: Vec3, corner2: Vec3): Promise<TreeInfo[]> {
    const trees: Map<string, TreeInfo> = new Map();
    const treeTypes = this.getTreeTypes();
    const logIds = new Set(treeTypes.map((t) => t.log));
    const leafIds = new Set(treeTypes.map((t) => t.leaf));

    // Define bounding box
    const minX = Math.min(corner1.x, corner2.x);
    const maxX = Math.max(corner1.x, corner2.x);
    const minY = Math.min(corner1.y, corner2.y);
    const maxY = Math.max(corner1.y, corner2.y);
    const minZ = Math.min(corner1.z, corner2.z);
    const maxZ = Math.max(corner1.z, corner2.z);

    // Get all chunks that intersect our bounding box
    const chunksToScan = new Set<string>();
    for (let x = Math.floor(minX / 16) * 16; x <= maxX; x += 16) {
      for (let y = Math.floor(minY / 16) * 16; y <= maxY; y += 16) {
        for (let z = Math.floor(minZ / 16) * 16; z <= maxZ; z += 16) {
          const chunkPos = { x, y, z };
          const chunkCoord = this.world.toChunkCoord(chunkPos);
          const chunkKey = `${chunkCoord.x},${chunkCoord.y},${chunkCoord.z}`;
          chunksToScan.add(chunkKey);
        }
      }
    }

    // Load all chunks in parallel
    const chunkData = new Map<
      string,
      Map<string, { blockType: number; biome: number }>
    >();
    const chunkPromises = Array.from(chunksToScan).map(async (chunkKey) => {
      const [cx, cy, cz] = chunkKey.split(",").map(Number);
      const chunkWorldPos = { x: cx * 16, y: cy * 16, z: cz * 16 };
      try {
        const blocks = await this.world.getChunkBlocks(chunkWorldPos);
        chunkData.set(chunkKey, blocks);
      } catch (error) {
        console.log(`⚠️ Failed to load chunk ${chunkKey}:`, error);
      }
    });

    await Promise.all(chunkPromises);

    // Find all wood blocks and trace them to tree bases
    const processedTreeBases = new Set<string>();
    let blocksScanned = 0;

    for (const [chunkKey, blocks] of chunkData) {
      for (const [blockKey, blockData] of blocks) {
        const [x, y, z] = blockKey.split(",").map(Number);

        // Skip if outside our bounding box
        if (
          x < minX ||
          x > maxX ||
          y < minY ||
          y > maxY ||
          z < minZ ||
          z > maxZ
        )
          continue;

        blocksScanned++;

        // Check if this is a log block
        if (logIds.has(blockData.blockType)) {
          const treeType = this.getTreeTypeByObjectId(blockData.blockType);
          if (!treeType) continue;

          // Find the tree base by going down from this wood block
          const basePos = await this.findTreeBaseFromChunks(
            { x, y, z },
            treeType.log,
            chunkData
          );
          const treeKey = `${basePos.x},${basePos.y},${basePos.z}`;

          // Skip if we already processed this tree base
          if (processedTreeBases.has(treeKey)) continue;
          processedTreeBases.add(treeKey);

          // Collect all logs for this tree
          const logPositions = await this.collectTreeLogs(
            basePos,
            treeType.log,
            chunkData
          );

          trees.set(treeKey, {
            position: basePos,
            type: treeType.name,
            distance: 0,
            logPositions,
            leafPositions: [],
            isFullyGrown: true,
          });
        }
      }
    }

    // Now find leaves for each tree
    for (const [treeKey, tree] of trees) {
      tree.leafPositions = await this.collectTreeLeaves(
        tree,
        leafIds,
        chunkData
      );
    }

    // Concise result logging
    if (trees.size > 0) {
      console.log(`🌳 Found ${trees.size} trees`);
    }
    return Array.from(trees.values());
  }

  /**
   * Find the base (bottom) position of a tree trunk using chunk data
   */
  private async findTreeBaseFromChunks(
    logPos: Vec3,
    logObjectId: number,
    chunkData: Map<string, Map<string, { blockType: number; biome: number }>>
  ): Promise<Vec3> {
    let currentPos = { ...logPos };

    // Look downward to find the base of the tree
    while (currentPos.y > 0) {
      const belowPos = {
        x: currentPos.x,
        y: currentPos.y - 1,
        z: currentPos.z,
      };

      // Get block type from chunk data
      const blockType = this.getBlockTypeFromChunks(belowPos, chunkData);
      if (blockType === logObjectId) {
        currentPos = belowPos;
      } else {
        break;
      }
    }

    return currentPos;
  }

  /**
   * Find the base (bottom) position of a tree trunk (fallback method)
   */
  private async findTreeBase(logPos: Vec3, logObjectId: number): Promise<Vec3> {
    let currentPos = { ...logPos };

    // Look downward to find the base of the tree
    while (currentPos.y > 0) {
      const belowPos = {
        x: currentPos.x,
        y: currentPos.y - 1,
        z: currentPos.z,
      };
      try {
        const blockType = await this.world.getBlockType(belowPos);
        if (blockType === logObjectId) {
          currentPos = belowPos;
        } else {
          break;
        }
      } catch (error) {
        break;
      }
    }

    return currentPos;
  }

  /**
   * Get block type from chunk data
   */
  private getBlockTypeFromChunks(
    pos: Vec3,
    chunkData: Map<string, Map<string, { blockType: number; biome: number }>>
  ): number | null {
    // Find which chunk contains this position
    const chunkX = Math.floor(pos.x / 16) * 16;
    const chunkY = Math.floor(pos.y / 16) * 16;
    const chunkZ = Math.floor(pos.z / 16) * 16;

    const chunkCoord = this.world.toChunkCoord({
      x: chunkX,
      y: chunkY,
      z: chunkZ,
    });
    const chunkKey = `${chunkCoord.x},${chunkCoord.y},${chunkCoord.z}`;
    const blocks = chunkData.get(chunkKey);

    if (!blocks) return null;

    const blockKey = `${pos.x},${pos.y},${pos.z}`;
    const blockData = blocks.get(blockKey);

    return blockData ? blockData.blockType : null;
  }

  /**
   * Collect all log positions for a tree starting from its base
   */
  private async collectTreeLogs(
    basePos: Vec3,
    logObjectId: number,
    chunkData: Map<string, Map<string, { blockType: number; biome: number }>>
  ): Promise<Vec3[]> {
    const logPositions: Vec3[] = [];
    const visited = new Set<string>();
    const toCheck = [{ ...basePos }];

    while (toCheck.length > 0) {
      const pos = toCheck.pop()!;
      const posKey = `${pos.x},${pos.y},${pos.z}`;

      if (visited.has(posKey)) continue;
      visited.add(posKey);

      const blockType = this.getBlockTypeFromChunks(pos, chunkData);
      if (blockType === logObjectId) {
        logPositions.push({ ...pos });

        // Check adjacent positions (mainly vertical for trees)
        const adjacent = [
          { x: pos.x, y: pos.y + 1, z: pos.z }, // Above
          { x: pos.x, y: pos.y - 1, z: pos.z }, // Below
          { x: pos.x + 1, y: pos.y, z: pos.z }, // East
          { x: pos.x - 1, y: pos.y, z: pos.z }, // West
          { x: pos.x, y: pos.y, z: pos.z + 1 }, // South
          { x: pos.x, y: pos.y, z: pos.z - 1 }, // North
        ];

        for (const adjPos of adjacent) {
          const adjKey = `${adjPos.x},${adjPos.y},${adjPos.z}`;
          if (!visited.has(adjKey)) {
            toCheck.push(adjPos);
          }
        }
      }
    }

    return logPositions;
  }

  /**
   * Collect all leaf positions for a tree
   */
  private async collectTreeLeaves(
    tree: TreeInfo,
    leafIds: Set<number>,
    chunkData: Map<string, Map<string, { blockType: number; biome: number }>>
  ): Promise<Vec3[]> {
    const leafPositions: Vec3[] = [];
    const treeType = this.getTreeTypeByObjectId(
      tree.logPositions[0]
        ? this.getBlockTypeFromChunks(tree.logPositions[0], chunkData) || 0
        : 0
    );

    if (!treeType) return leafPositions;

    // Search around each log position for leaves
    for (const logPos of tree.logPositions) {
      // Check in a small radius around each log
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -2; dy <= 4; dy++) {
          for (let dz = -3; dz <= 3; dz++) {
            const leafPos = {
              x: logPos.x + dx,
              y: logPos.y + dy,
              z: logPos.z + dz,
            };

            const blockType = this.getBlockTypeFromChunks(leafPos, chunkData);
            if (blockType === treeType.leaf) {
              leafPositions.push(leafPos);
            }
          }
        }
      }
    }

    return leafPositions;
  }

  /**
   * Find the nearest tree base for a leaf block
   */
  private async findNearestTreeForLeaf(
    leafPos: Vec3,
    trees: Map<string, TreeInfo>,
    logObjectId: number
  ): Promise<string | null> {
    let nearestKey: string | null = null;
    let nearestDistance = Infinity;

    for (const [key, tree] of trees) {
      if (tree.logPositions.length === 0) continue;

      // Check distance to the tree base
      const distance = this.calculateDistance(leafPos, tree.position);
      if (distance < nearestDistance && distance <= 10) {
        // Leaves should be within 10 blocks of tree base
        nearestDistance = distance;
        nearestKey = key;
      }
    }

    return nearestKey;
  }

  /**
   * Scan for saplings in a bounding box defined by two corners
   */
  async scanForSaplings(corner1: Vec3, corner2: Vec3): Promise<SaplingInfo[]> {
    const saplings: SaplingInfo[] = [];
    const treeTypes = this.getTreeTypes();
    const saplingIds = new Set(treeTypes.map((t) => t.sapling));

    // Define bounding box
    const minX = Math.min(corner1.x, corner2.x);
    const maxX = Math.max(corner1.x, corner2.x);
    const minY = Math.min(corner1.y, corner2.y);
    const maxY = Math.max(corner1.y, corner2.y);
    const minZ = Math.min(corner1.z, corner2.z);
    const maxZ = Math.max(corner1.z, corner2.z);

    // Get all chunks that intersect our bounding box
    const chunksToScan = new Set<string>();
    for (let x = Math.floor(minX / 16) * 16; x <= maxX; x += 16) {
      for (let y = Math.floor(minY / 16) * 16; y <= maxY; y += 16) {
        for (let z = Math.floor(minZ / 16) * 16; z <= maxZ; z += 16) {
          const chunkPos = { x, y, z };
          const chunkCoord = this.world.toChunkCoord(chunkPos);
          const chunkKey = `${chunkCoord.x},${chunkCoord.y},${chunkCoord.z}`;
          chunksToScan.add(chunkKey);
        }
      }
    }

    // Load all chunks in parallel
    const chunkData = new Map<
      string,
      Map<string, { blockType: number; biome: number }>
    >();
    const chunkPromises = Array.from(chunksToScan).map(async (chunkKey) => {
      const [cx, cy, cz] = chunkKey.split(",").map(Number);
      const chunkWorldPos = { x: cx * 16, y: cy * 16, z: cz * 16 };
      try {
        const blocks = await this.world.getChunkBlocks(chunkWorldPos);
        chunkData.set(chunkKey, blocks);
      } catch (error) {
        console.log(`⚠️ Failed to load chunk ${chunkKey}:`, error);
      }
    });

    await Promise.all(chunkPromises);

    let blocksScanned = 0;

    // Scan through all loaded blocks for saplings
    for (const [chunkKey, blocks] of chunkData) {
      for (const [blockKey, blockData] of blocks) {
        const [x, y, z] = blockKey.split(",").map(Number);

        // Skip if outside our bounding box
        if (
          x < minX ||
          x > maxX ||
          y < minY ||
          y > maxY ||
          z < minZ ||
          z > maxZ
        )
          continue;

        blocksScanned++;

        if (saplingIds.has(blockData.blockType)) {
          const treeType = this.getTreeTypeByObjectId(blockData.blockType);
          if (!treeType) continue;

          const pos = { x, y, z };
          // Check if sapling is ready to grow
          const isReadyToGrow = await this.farming.isPlantReadyToGrow(pos);

          saplings.push({
            position: pos,
            type: treeType.name,
            distance: 0,
            saplingObjectId: blockData.blockType,
            isReadyToGrow,
          });
        }
      }
    }

    if (saplings.length > 0) {
      console.log(`🌱 Found ${saplings.length} saplings`);
    }
    return saplings;
  }

  /**
   * Chop down a tree completely (all logs and leaves)
   */
  async chopTree(tree: TreeInfo): Promise<void> {
    console.log(
      `🪓 Chopping ${tree.type} tree at (${tree.position.x}, ${tree.position.y}, ${tree.position.z})`
    );

    let blocksChopped = 0;

    // First chop all logs (from bottom to top for stability)
    const sortedLogs = tree.logPositions.sort((a, b) => a.y - b.y);
    for (const logPos of sortedLogs) {
      try {
        console.log(
          `🪓 Chopping log at (${logPos.x}, ${logPos.y}, ${logPos.z})`
        );
        await this.executeSystemCall(
          this.SYSTEM_IDS.MINE_SYSTEM,
          "mineUntilDestroyed(bytes32,uint96,bytes)",
          [
            this.characterEntityId,
            packVec3(logPos),
            "0x", // empty extraData
          ],
          `Chopping log at (${logPos.x}, ${logPos.y}, ${logPos.z})`
        );
        blocksChopped++;

        // Small delay between chops to prevent overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.log(
          `⚠️ Failed to chop log at (${logPos.x}, ${logPos.y}, ${logPos.z}): ${error}`
        );
      }
    }

    // Then chop all leaves (for wood/sapling drops)
    for (const leafPos of tree.leafPositions) {
      try {
        console.log(
          `🍃 Chopping leaves at (${leafPos.x}, ${leafPos.y}, ${leafPos.z})`
        );
        await this.executeSystemCall(
          this.SYSTEM_IDS.MINE_SYSTEM,
          "mineUntilDestroyed(bytes32,uint96,bytes)",
          [
            this.characterEntityId,
            packVec3(leafPos),
            "0x", // empty extraData
          ],
          `Chopping leaves at (${leafPos.x}, ${leafPos.y}, ${leafPos.z})`
        );
        blocksChopped++;

        // Small delay between chops
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.log(
          `⚠️ Failed to chop leaves at (${leafPos.x}, ${leafPos.y}, ${leafPos.z}): ${error}`
        );
      }
    }

    console.log(
      `✅ Finished chopping ${tree.type} tree. Chopped ${blocksChopped} blocks total.`
    );
  }

  /**
   * Plant a sapling at a specific position
   */
  async plantSapling(position: Vec3, saplingObjectId: number): Promise<void> {
    if (!isValidCoordinate(position)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(position)}`);
    }

    const treeType = this.getTreeTypeByObjectId(saplingObjectId);
    const treeName = treeType ? treeType.name : "Unknown";

    console.log(
      `🌱 Planting ${treeName} sapling at (${position.x}, ${position.y}, ${position.z})`
    );

    // Use the building system to place the sapling
    await this.executeSystemCall(
      this.SYSTEM_IDS.BUILD_SYSTEM,
      "build(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(position),
        0, // slot (will auto-find sapling in inventory)
        "0x", // empty extraData
      ],
      `Planting ${treeName} sapling`
    );

    console.log(`✅ Successfully planted ${treeName} sapling`);
  }

  /**
   * Grow a sapling if it's ready
   */
  async growSapling(sapling: SaplingInfo): Promise<void> {
    if (!sapling.isReadyToGrow) {
      console.log(
        `⏰ ${sapling.type} sapling at (${sapling.position.x}, ${sapling.position.y}, ${sapling.position.z}) is not ready to grow yet`
      );
      return;
    }

    console.log(
      `🌳 Growing ${sapling.type} sapling at (${sapling.position.x}, ${sapling.position.y}, ${sapling.position.z})`
    );

    try {
      await this.executeSystemCall(
        this.SYSTEM_IDS.NATURE_SYSTEM,
        "growSeed(bytes32,uint96)",
        [this.characterEntityId, packVec3(sapling.position)],
        `Growing ${sapling.type} sapling`
      );

      console.log(`✅ Successfully grew ${sapling.type} sapling into a tree`);
    } catch (error) {
      console.log(`❌ Failed to grow ${sapling.type} sapling: ${error}`);
      throw error;
    }
  }

  /**
   * Get the closest tree to a position
   */
  getClosestTree(trees: TreeInfo[], position: Vec3): TreeInfo | null {
    if (trees.length === 0) return null;

    let closest = trees[0];
    let closestDistance = this.calculateDistance(position, closest.position);

    for (let i = 1; i < trees.length; i++) {
      const distance = this.calculateDistance(position, trees[i].position);
      if (distance < closestDistance) {
        closest = trees[i];
        closestDistance = distance;
      }
    }

    return closest;
  }

  /**
   * Get the closest sapling to a position
   */
  getClosestSapling(
    saplings: SaplingInfo[],
    position: Vec3
  ): SaplingInfo | null {
    if (saplings.length === 0) return null;

    let closest = saplings[0];
    let closestDistance = this.calculateDistance(position, closest.position);

    for (let i = 1; i < saplings.length; i++) {
      const distance = this.calculateDistance(position, saplings[i].position);
      if (distance < closestDistance) {
        closest = saplings[i];
        closestDistance = distance;
      }
    }

    return closest;
  }

  /**
   * Check if player has an axe equipped (for tree chopping efficiency)
   */
  async hasAxeEquipped(): Promise<boolean> {
    try {
      const inventory = await this.inventory.getInventory(
        this.characterEntityId
      );

      // Check each inventory slot for axes
      for (const item of inventory) {
        const itemType = item.type;
        const itemName = ObjectTypes[itemType]?.name || "";

        if (itemName.includes("Axe")) {
          console.log(`🪓 Found ${itemName} in inventory`);
          return true;
        }
      }

      console.log(
        `⚠️ No axe found in inventory - tree chopping will be slower`
      );
      return false;
    } catch (error) {
      console.log(`❌ Error checking for axe: ${error}`);
      return false;
    }
  }
}
