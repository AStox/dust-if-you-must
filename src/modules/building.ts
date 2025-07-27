import { DustGameBase } from "../core/base.js";
import { Vec3, ObjectType } from "../types";
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
      "Mining block",
      false
    );
  }

  async mineNonBlocking(coord: Vec3, toolSlot: number = 0): Promise<void> {
    if (!isValidCoordinate(coord)) {
      throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
    }

    console.log(
      `⛏️ Mining at (${coord.x}, ${coord.y}, ${coord.z}) with tool from slot ${toolSlot}`
    );

    const result = await this.executeSystemCallNonBlocking(
      this.SYSTEM_IDS.MINE_SYSTEM,
      "mine(bytes32,uint96,uint16,bytes)",
      [
        this.characterEntityId,
        packVec3(coord),
        toolSlot,
        "0x", // empty extraData
      ],
      "Mining block non-blocking",
      false
    );
    console.log(`✅ Mining result: ${result}`);
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
}
