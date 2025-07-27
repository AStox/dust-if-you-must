import { DustGameBase } from "../core/base.js";
import { Vec3, ObjectTypes, EntityId } from "../types";
import { ethers } from "ethers";
import { packVec3 } from "../utils.js";
import * as fs from "fs";
import * as path from "path";

export class WorldModule extends DustGameBase {
  // Constants from the original implementation
  private BYTES_32_BITS = 256n;
  private ENTITY_TYPE_BITS = 8n;
  private ENTITY_ID_BITS = this.BYTES_32_BITS - this.ENTITY_TYPE_BITS; // 248n
  private VEC3_BITS = 96n;

  public blockCache = new Map<string, { blockType: number; biome: number }>();
  private chunksDir = path.join(process.cwd(), "chunks");

  // Entity Types enum (from original codebase)
  private EntityTypes = {
    Incremental: 0x00,
    Player: 0x01,
    Fragment: 0x02,
    Block: 0x03,
  } as const;

  // You'll need to find this from your deployed contracts
  private ENTITY_OBJECT_TYPE_TABLE_ID =
    "0x74620000000000000000000000000000456e746974794f626a65637454797065";

  // Ensure chunks directory exists
  private ensureChunksDir(): void {
    if (!fs.existsSync(this.chunksDir)) {
      fs.mkdirSync(this.chunksDir, { recursive: true });
    }
  }

  // Get chunk filename from pointer
  private getChunkFilename(chunkPointer: string): string {
    return path.join(this.chunksDir, `${chunkPointer}.txt`);
  }

  // Get chunk bytecode from cache or provider
  private async getChunkBytecode(chunkPointer: string): Promise<string> {
    this.ensureChunksDir();
    const filename = this.getChunkFilename(chunkPointer);

    // Try to read from cache first
    if (fs.existsSync(filename)) {
      return fs.readFileSync(filename, "utf8");
    }

    // Fetch from provider and cache
    const code = await this.provider.getCode(chunkPointer);
    fs.writeFileSync(filename, code, "utf8");
    return code;
  }

  // Invalidate chunk cache for a specific chunk
  public invalidateChunkCache(coord: Vec3): void {
    const worldAddress = this.worldContract.target as string;
    const chunkCoord = this.toChunkCoord(coord);
    const chunkPointer = this.getChunkPointer(chunkCoord, worldAddress);
    const filename = this.getChunkFilename(chunkPointer);

    if (fs.existsSync(filename)) {
      fs.unlinkSync(filename);
    }
  }

  /**
   * Pack an [x,y,z] vector into a single uint96 to match Vec3.sol user type
   * Re-implementation of packVec3 from vec3.ts
   */
  private packVec3(coord: [number, number, number]): bigint {
    const [x, y, z] = coord;

    // Convert each signed 32-bit integer into an unsigned 32-bit number
    const ux = BigInt(x >>> 0);
    const uy = BigInt(y >>> 0);
    const uz = BigInt(z >>> 0);

    // Pack the three numbers into a single 96-bit integer:
    // Shift ux left by 64 bits, uy left by 32 bits, and then OR them together
    return (ux << 64n) | (uy << 32n) | uz;
  }

  /**
   * Encode entity type and data into EntityId
   * Re-implementation of encode from entityid.ts
   */
  private encodeEntity(entityType: number, data: bigint): string {
    const entityId = (BigInt(entityType) << this.ENTITY_ID_BITS) | data;
    return ethers.zeroPadValue(ethers.toBeHex(entityId), 32);
  }

  /**
   * Encode coordinate with entity type
   * Re-implementation of encodeCoord from entityid.ts
   */
  private encodeCoord(
    entityType: number,
    coord: { x: number; y: number; z: number }
  ): string {
    const packedCoord = this.packVec3([coord.x, coord.y, coord.z]);
    return this.encodeEntity(
      entityType,
      packedCoord << (this.ENTITY_ID_BITS - this.VEC3_BITS)
    );
  }

  /**
   * Encode block coordinate into EntityId
   * Re-implementation of encodeBlock from entityid.ts
   */
  encodeBlock(coord: { x: number; y: number; z: number }): string {
    return this.encodeCoord(this.EntityTypes.Block, coord);
  }

  invalidateBlockCache(coord: Vec3): void {
    const key = `${coord.x},${coord.y},${coord.z}`;
    this.blockCache.delete(key);
  }

  clearCache(): void {
    this.blockCache.clear();
  }

  async getObjectTypeAt(coord: Vec3): Promise<number> {
    const entityId = this.encodeBlock({ x: coord.x, y: coord.y, z: coord.z });

    try {
      const [staticData] = await this.worldContract.getRecord(
        this.ENTITY_OBJECT_TYPE_TABLE_ID,
        [entityId]
      );

      if (staticData !== "0x") {
        // Decode the ObjectType (uint16) from static data - should be first 2 bytes
        const objectType = parseInt(staticData.slice(2, 6), 16); // First 2 bytes as uint16
        if (objectType !== 0) {
          return objectType;
        }
      }
      return 0;
    } catch (error) {
      throw new Error("No object type found");
    }
  }

  getCachedBlockType = async (coord: Vec3): Promise<number> => {
    const key = `${coord.x},${coord.y},${coord.z}`;
    if (this.blockCache.has(key)) {
      return this.blockCache.get(key)!.blockType;
    }
    const blockData = await this.getBlockData(coord);
    this.blockCache.set(key, blockData);
    return blockData.blockType;
  };

  getCachedBiome = async (coord: Vec3): Promise<number> => {
    console.log("getting cached biome", coord);
    const key = `${coord.x},${coord.y},${coord.z}`;
    if (this.blockCache.has(key)) {
      return this.blockCache.get(key)!.biome;
    }
    const blockData = await this.getBlockData(coord);
    this.blockCache.set(key, blockData);
    return blockData.biome;
  };

  getCachedBlockData = async (
    coord: Vec3
  ): Promise<{ blockType: number; biome: number }> => {
    const key = `${coord.x},${coord.y},${coord.z}`;
    if (this.blockCache.has(key)) {
      return this.blockCache.get(key)!;
    }
    const blockData = await this.getBlockData(coord);
    this.blockCache.set(key, blockData);
    return blockData;
  };

  async getChunkBlocks(
    position: Vec3
  ): Promise<Map<string, { blockType: number; biome: number }>> {
    const chunkCoord = this.toChunkCoord(position);

    const blockPromises = [];
    const chunkBlocks = new Map<string, { blockType: number; biome: number }>();

    for (let x = 0; x < this.CHUNK_SIZE; x++) {
      for (let z = 0; z < this.CHUNK_SIZE; z++) {
        for (let y = 0; y < this.CHUNK_SIZE; y++) {
          const worldX = chunkCoord.x * this.CHUNK_SIZE + x;
          const worldY = chunkCoord.y * this.CHUNK_SIZE + y;
          const worldZ = chunkCoord.z * this.CHUNK_SIZE + z;
          blockPromises.push(
            this.getCachedBlockData({
              x: worldX,
              y: worldY,
              z: worldZ,
            }).then((blockData) => {
              const key = `${worldX},${worldY},${worldZ}`;
              chunkBlocks.set(key, blockData);
              return blockData;
            })
          );
        }
      }
    }

    await Promise.all(blockPromises);
    return chunkBlocks;
  }

  async getGroundLevel(
    x: number,
    z: number,
    startY: number,
    batchSize: number = 10
  ): Promise<number> {
    // Scan from top to bottom in batches to find ground level
    for (let batchStart = startY; batchStart >= -100; batchStart -= batchSize) {
      const batchEnd = Math.max(batchStart - batchSize + 1, -100);

      // Create array of y levels to fetch (including one extra below for the "below" check)
      const yLevels: number[] = [];
      for (let y = batchStart; y >= batchEnd - 1; y--) {
        yLevels.push(y);
      }

      try {
        // Fetch all blocks in this batch asynchronously
        const blockPromises = yLevels.map((y) =>
          this.getCachedBlockType({ x, y, z }).catch(() => null)
        );
        const blockTypes = await Promise.all(blockPromises);

        // Check each position in the batch for ground level
        for (let i = 0; i < yLevels.length - 1; i++) {
          const currentY = yLevels[i];
          const currentType = blockTypes[i];
          const belowType = blockTypes[i + 1];

          // Skip if we couldn't fetch either block type
          if (currentType === null || belowType === null) {
            continue;
          }

          // Ground level = passable block above solid block
          if (
            this.isPassThrough(currentType) &&
            !this.isPassThrough(belowType)
          ) {
            console.log(`✅ Found ground level at [${x}, ${currentY}, ${z}]`);
            return currentY;
          }
        }
      } catch (error) {
        // Skip errors and continue to next batch
        console.log(
          `⚠️ Error fetching batch starting at y=${batchStart}: ${error}`
        );
        continue;
      }
    }

    throw new Error("No ground level found");
  }

  private isPassThrough(objectType: number): boolean {
    return ObjectTypes[objectType].passThrough;
  }

  public async getChunkGroundHeights(position: Vec3): Promise<Vec3[]> {
    const chunkCoord = this.toChunkCoord(position);
    const groundHeightPromises = [];

    for (let x = 0; x < this.CHUNK_SIZE; x++) {
      for (let z = 0; z < this.CHUNK_SIZE; z++) {
        const worldX = chunkCoord.x * this.CHUNK_SIZE + x;
        const worldZ = chunkCoord.z * this.CHUNK_SIZE + z;

        groundHeightPromises.push(
          this.getGroundLevel(worldX, worldZ, position.y + 10).then(
            (groundHeight) => ({
              x,
              y: groundHeight,
              z,
            })
          )
        );
      }
    }

    return Promise.all(groundHeightPromises);
  }

  CHUNK_SIZE = 16;
  DATA_OFFSET = 1; // SSTORE2 offset
  VERSION_PADDING = 1;
  BIOME_PADDING = 1;
  SURFACE_PADDING = 1;
  CREATE3_PROXY_INITCODE_HASH =
    "0x21c35dbe1b344a2488cf3321d6ce542f8e9f305544ff09e4993a62319a497c1f";

  // Helper: Floor division for negative numbers
  private floorDiv(a: number, b: number): number {
    if (b === 0) throw new Error("Division by zero");
    // if (a < 0 !== b < 0 && a % b !== 0) {
    //   return Math.floor(a / b) - 1;
    // }
    // return Math.floor(a / b);

    if (a < 0 !== b < 0 && a % b !== 0) {
      return Math.ceil(a / b - 1);
    }

    return Math.floor(a / b);
  }

  // Helper: Proper modulo for negative numbers
  private mod(a: number, b: number): number {
    return ((a % b) + b) % b;
  }

  // Step 1: Convert voxel to chunk coordinate
  public toChunkCoord(coord: Vec3): Vec3 {
    const chunkCoord = {
      x: this.floorDiv(coord.x, this.CHUNK_SIZE),
      y: this.floorDiv(coord.y, this.CHUNK_SIZE),
      z: this.floorDiv(coord.z, this.CHUNK_SIZE),
    };
    return chunkCoord;
  }

  // Step 3: Get chunk pointer address (CREATE3)
  private getChunkPointer(chunkCoord: Vec3, worldAddress: string): string {
    // Pack chunk coord to get salt
    const salt = ethers.zeroPadValue(ethers.toBeHex(packVec3(chunkCoord)), 32);

    // First, calculate CREATE2 proxy address
    const create2Input = ethers.concat([
      "0xff",
      worldAddress,
      salt,
      this.CREATE3_PROXY_INITCODE_HASH,
    ]);
    const proxyAddress = "0x" + ethers.keccak256(create2Input).slice(-40);

    // Then calculate final storage address
    const rlpEncoded = ethers.concat([
      "0xd6", // RLP header
      "0x94", // RLP address prefix
      proxyAddress,
      "0x01", // Nonce
    ]);

    return "0x" + ethers.keccak256(rlpEncoded).slice(-40);
  }

  private getBlockIndex(coord: Vec3): number {
    // Get position relative to chunk origin
    const relativeCoord: Vec3 = {
      x: this.mod(coord.x, this.CHUNK_SIZE),
      y: this.mod(coord.y, this.CHUNK_SIZE),
      z: this.mod(coord.z, this.CHUNK_SIZE),
    };

    // Linear index: x * 256 + y * 16 + z
    const dataIndex =
      relativeCoord.x * this.CHUNK_SIZE * this.CHUNK_SIZE +
      relativeCoord.y * this.CHUNK_SIZE +
      relativeCoord.z;

    // Add header offset
    return (
      this.VERSION_PADDING +
      this.BIOME_PADDING +
      this.SURFACE_PADDING +
      dataIndex
    );
  }

  // Full implementation
  public async getBlockType(coord: Vec3): Promise<number> {
    const blockData = await this.getBlockData(coord);
    return blockData.blockType;
  }

  public async getBlockData(
    coord: Vec3
  ): Promise<{ blockType: number; biome: number }> {
    let blockType = 0;
    try {
      blockType = await this.getObjectTypeAt(coord);
    } catch (error) {
      console.log("No object type found, trying to get block type");
    }

    const worldAddress = this.worldContract.target as string;
    const provider = this.provider;

    // Step 1: Convert to chunk coordinate
    const chunkCoord = this.toChunkCoord(coord);

    // Step 2 & 3: Get chunk pointer and check if explored
    const chunkPointer = this.getChunkPointer(chunkCoord, worldAddress);
    const code = await this.getChunkBytecode(chunkPointer);

    if (code === "0x") {
      throw new Error("Chunk not explored");
    }

    // Get biome data (byte at index 1 + DATA_OFFSET)
    const biomeByteIndex = this.DATA_OFFSET + 1;
    const biomeByte = code.slice(
      2 + biomeByteIndex * 2,
      2 + (biomeByteIndex + 1) * 2
    );
    const biome = parseInt(biomeByte, 16);

    // If we got blockType from object type, return it with biome
    if (blockType !== 0) {
      return { blockType, biome };
    }

    // Otherwise, get block type from chunk data
    // Step 4: Calculate index and read block type
    const index = this.getBlockIndex(coord);

    // Read single byte at index (accounting for SSTORE2 DATA_OFFSET)
    const byteIndex = this.DATA_OFFSET + index;
    const blockTypeByte = code.slice(
      2 + byteIndex * 2,
      2 + (byteIndex + 1) * 2
    );

    blockType = parseInt(blockTypeByte, 16);

    return { blockType, biome };
  }

  async commitChunk(coord: Vec3): Promise<void> {
    console.log("committing chunk", coord);
    const chunkCoord = packVec3(coord);
    console.log("chunkCoord", chunkCoord);
    await this.executeSystemCall(
      this.SYSTEM_IDS.NATURE_SYSTEM,
      "chunkCommit(bytes32,uint96)",
      [this.characterEntityId, chunkCoord],
      "Committing chunk",
      false
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  async getPositionOfEntity(entityId: EntityId): Promise<Vec3> {
    try {
      // EntityPosition table ID - this is likely how it's encoded in the Dust game
      // ResourceId format: bytes32 with encoded type and table name
      const entityPositionTableId =
        "0x74620000000000000000000000000000456e74697479506f736974696f6e0000";

      // Call getRecord to get position data
      const result = await this.getRecord(entityPositionTableId, [entityId]);

      if (!result.staticData || result.staticData === "0x") {
        throw new Error("📍 No position data found for this entity");
      }

      // Decode position data from staticData
      // Positions are typically stored as 3 int32 values (x, y, z) = 12 bytes total
      const staticData = result.staticData;

      if (staticData.length < 26) {
        // 0x + 24 hex chars (12 bytes)
        throw new Error("📍 Invalid position data length");
      }

      // Extract x, y, z as int32 values (4 bytes each)
      // Remove '0x' and split into chunks of 8 hex chars (4 bytes each)
      const hexData = staticData.slice(2);

      const xHex = hexData.slice(0, 8);
      const yHex = hexData.slice(8, 16);
      const zHex = hexData.slice(16, 24);

      // Convert to signed 32-bit integers
      const x = this.hexToInt32(xHex);
      const y = this.hexToInt32(yHex);
      const z = this.hexToInt32(zHex);

      const position = { x, y, z };
      return position;
    } catch (error) {
      console.log("📍 Failed to read position from game state:", error);
      throw error;
    }
  }

  // Helper function to convert hex string to signed 32-bit integer
  private hexToInt32(hex: string): number {
    const uint32 = parseInt(hex, 16);
    // Convert to signed 32-bit integer
    return uint32 > 0x7fffffff ? uint32 - 0x100000000 : uint32;
  }
}
