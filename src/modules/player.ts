import { DustGameBase, PlayerState } from "../core/base.js";
import DustBot from "../index.js";
import { EntityId, Vec3 } from "../types";
import { ethers } from "ethers";

export class PlayerModule extends DustGameBase {
  private lastKnownPosition: Vec3 | null = null;

  async checkStatusAndActivate(bot: DustBot): Promise<void> {
    const playerState = await bot.getPlayerState();
    let playerReady = false;

    switch (playerState) {
      case PlayerState.DEAD:
        console.log("💀 Player is DEAD - spawning character...");
        const spawnTilePosition = {
          x: -400,
          y: 73,
          z: 492,
        };

        try {
          const hash = await bot.movement.spawn(
            process.env.SPAWN_TILE_ENTITY_ID!,
            spawnTilePosition,
            245280000000000000n
          );
          console.log("🎉 Character spawned successfully!");
          playerReady = true;
        } catch (error) {
          console.error("❌ Failed to spawn character:", error);
          throw new Error("Could not spawn dead character");
        }
        break;

      case PlayerState.SLEEPING:
        console.log("😴 Player is SLEEPING - waking them up...");
        try {
          await bot.player.activatePlayer();
          console.log("✅ Player woken up successfully!");
          playerReady = true;
        } catch (error) {
          console.error("❌ Failed to wake sleeping player:", error);
          throw new Error("Could not wake sleeping character");
        }
        break;

      case PlayerState.AWAKE:
        playerReady = true;
        break;

      default:
        throw new Error(`Unknown player state: ${playerState}`);
    }

    if (!playerReady) {
      throw new Error("Character is not ready after state-specific activation");
    }
  }

  // Wake up/activate the character
  async activate(): Promise<void> {
    const hash = await this.executeSystemCall(
      this.SYSTEM_IDS.ACTIVATE_SYSTEM,
      "activate(bytes32)",
      [this.characterEntityId],
      "Activating character"
    );
  }

  // Alternative activation method
  async activatePlayer(): Promise<void> {
    const hash = await this.executeSystemCall(
      this.SYSTEM_IDS.ACTIVATE_SYSTEM,
      "activatePlayer(bytes32)",
      [this.characterEntityId],
      "Activating player"
    );
  }
  async checkPlayerStatus(
    bot: DustBot,
    action: string
  ): Promise<{
    position: Vec3;
    energy: string;
    isDead: boolean;
    isSleeping: boolean;
  }> {
    try {
      // Get comprehensive player state
      const [isDead, isSleeping, position, energy] = await Promise.all([
        bot.isPlayerDead(),
        bot.isPlayerSleeping(),
        bot.player.getCurrentPosition(),
        bot.getPlayerEnergy(),
      ]);

      // Terse status display
      const posStr = position
        ? `(${position.x},${position.y},${position.z})`
        : "(??,??,??)";

      console.log(`${action} | energy:${energy} pos:${posStr}`);

      // Stop if dead
      if (isDead) {
        throw new Error("❌ Player died during farming - stopping operations");
      }

      return { position, energy, isDead, isSleeping };
    } catch (error) {
      console.log(
        `⚠️ Status check failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  async isPlayerDead(entityId?: EntityId): Promise<boolean> {
    try {
      const energy = await this.getPlayerEnergy(entityId);
      return energy === "0";
    } catch (error) {
      throw error;
    }
  }

  // Check if player is sleeping (has bed assigned)
  async isPlayerSleeping(entityId?: EntityId): Promise<boolean> {
    try {
      const playerId = entityId || this.characterEntityId;
      // PlayerBed table ID: "PlayerBed" -> hex encoded (WorldResourceIdLib format)
      const playerBedTableId =
        "0x74620000000000000000000000000000506c6179657242656400000000000000";

      const result = await this.getRecord(playerBedTableId, [playerId]);

      if (!result.staticData || result.staticData === "0x") {
        console.log("😴 No bed data found - player is not sleeping");
        return false;
      }

      // Check if bed entity ID exists (non-zero)
      const bedHex = result.staticData.slice(2);
      if (bedHex.length < 64) {
        // 32 bytes = 64 hex chars for EntityId
        return false;
      }

      const bedEntityId = "0x" + bedHex.slice(0, 64);
      const isAssigned = bedEntityId !== "0x" + "0".repeat(64);

      if (isAssigned) {
        console.log(`😴 Player is sleeping in bed: ${bedEntityId}`);
      }

      return isAssigned;
    } catch (error) {
      console.log("⚠️ Failed to check player bed status:", error);
      return false; // Assume not sleeping if we can't check
    }
  }

  // Get comprehensive player state
  async getPlayerState(entityId?: EntityId): Promise<PlayerState> {
    await this.activate();
    const playerId = entityId || this.characterEntityId;

    console.log(`🔍 Checking state for player: ${playerId}`);

    // Check if dead first (energy = 0)
    const isDead = await this.isPlayerDead(playerId);
    if (isDead) {
      console.log("💀 Player is DEAD");
      return PlayerState.DEAD;
    }

    // Check if sleeping (has bed assigned)
    const isSleeping = await this.isPlayerSleeping(playerId);
    if (isSleeping) {
      console.log("😴 Player is SLEEPING");
      return PlayerState.SLEEPING;
    }

    console.log("✅ Player is AWAKE");
    return PlayerState.AWAKE;
  }

  // Get player energy level
  async getPlayerEnergy(entityId?: EntityId): Promise<string> {
    try {
      const playerId = entityId || this.characterEntityId;
      const energyTableId =
        "0x74620000000000000000000000000000456e6572677900000000000000000000";
      const result = await this.getRecord(energyTableId, [playerId]);
      if (!result.staticData || result.staticData === "0x") {
        return "0";
      }

      const energyHex = result.staticData.slice(2);
      const energy = BigInt("0x" + energyHex.slice(32, 64));
      return energy.toString();
    } catch (error) {
      return "0";
    }
  }

  // Get current character position (would need actual game state reading)
  async getCurrentPosition(): Promise<Vec3> {
    try {
      // EntityPosition table ID - this is likely how it's encoded in the Dust game
      // ResourceId format: bytes32 with encoded type and table name
      const entityPositionTableId =
        "0x74620000000000000000000000000000456e74697479506f736974696f6e0000";

      // Call getRecord to get position data
      const result = await this.getRecord(entityPositionTableId, [
        this.characterEntityId,
      ]);

      if (!result.staticData || result.staticData === "0x") {
        throw new Error("📍 No position data found for character");
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
