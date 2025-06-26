import { DustGameBase } from "../core/base.js";
import { Vec3 } from "../types.js";
import { ethers } from "ethers";
import { ObjectTypes } from "../types/objectTypes.js";
import { packVec3 } from "../utils.js";

export class WorldModule extends DustGameBase {
  // Constants from the original implementation
  private BYTES_32_BITS = 256n;
  private ENTITY_TYPE_BITS = 8n;
  private ENTITY_ID_BITS = this.BYTES_32_BITS - this.ENTITY_TYPE_BITS; // 248n
  private VEC3_BITS = 96n;

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
    coord: [number, number, number]
  ): string {
    const packedCoord = this.packVec3(coord);
    return this.encodeEntity(
      entityType,
      packedCoord << (this.ENTITY_ID_BITS - this.VEC3_BITS)
    );
  }

  /**
   * Encode block coordinate into EntityId
   * Re-implementation of encodeBlock from entityid.ts
   */
  private encodeBlock(coord: [number, number, number]): string {
    return this.encodeCoord(this.EntityTypes.Block, coord);
  }

  async getObjectTypeAt(coord: Vec3): Promise<number> {
    const entityId = this.encodeBlock([coord.x, coord.y, coord.z]);

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

  async getGroundLevel(x: number, z: number, startY?: number): Promise<number> {
    // Scan from top to bottom to find ground level
    for (let y = startY ?? 100; y >= (startY ?? -54) - 10; y--) {
      try {
        const currentType = await this.getBlockType({ x, y, z });
        const belowType = await this.getBlockType({ x, y: y - 1, z });
        // console.log(
        //   `[${x}, ${y}, ${z}] Type: ${ObjectTypes[currentType].name}, typeBelow: ${ObjectTypes[belowType].name}`
        // );

        // Ground level = passable block above solid block
        if (this.isPassThrough(currentType) && !this.isPassThrough(belowType)) {
          return y;
        }
      } catch (error) {
        // Skip errors and continue scanning
        continue;
      }
    }

    throw new Error("No ground level found");
  }

  private isPassThrough(objectType: number): boolean {
    return ObjectTypes[objectType].passThrough;
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
  private toChunkCoord(coord: Vec3): Vec3 {
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

  // Step 5: Calculate block index within chunk
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
    const blockType = await this.getObjectTypeAt(coord);
    if (blockType !== 0) {
      return blockType;
    }

    const worldAddress = this.worldContract.target as string;
    const provider = this.provider;
    // Step 1: Convert to chunk coordinate
    const chunkCoord = this.toChunkCoord(coord);

    // Step 2 & 3: Get chunk pointer and check if explored
    const chunkPointer = this.getChunkPointer(chunkCoord, worldAddress);
    const code = await provider.getCode(chunkPointer);

    if (code === "0x") {
      throw new Error("Chunk not explored");
    }

    // Step 4: Calculate index and read block type
    const index = this.getBlockIndex(coord);

    // Read single byte at index (accounting for SSTORE2 DATA_OFFSET)
    const byteIndex = this.DATA_OFFSET + index;
    const blockTypeByte = code.slice(
      2 + byteIndex * 2,
      2 + (byteIndex + 1) * 2
    );

    return parseInt(blockTypeByte, 16);
  }
}
