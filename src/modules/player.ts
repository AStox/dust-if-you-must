import { getOperationalConfig } from "../config/loader.js";
import { DustGameBase, PlayerState } from "../core/base.js";
import { ENERGY_TABLE_ID, ENTITY_POSITION_TABLE_ID, MAX_ENERGY, PLAYER_BED_TABLE_ID } from "../core/constants.js";
import DustBot from "../index.js";
import { EntityId, Vec3 } from "../types";

export class PlayerModule extends DustGameBase {
  private lastKnownPosition: Vec3 | null = null;
  private deathPosition: Vec3 | null = null;

  async checkStatusAndActivate(bot: DustBot, preActivationPosition?: Vec3 | null): Promise<void> {
    const playerState = await bot.getPlayerState();
    let playerReady = false;
    switch (playerState) {
      case PlayerState.DEAD:
        console.log("💀 Player is DEAD - determining death scenario...");
        
        // Use pre-activation position as death position (from before activate() call)
        if (preActivationPosition) {
          this.deathPosition = preActivationPosition;
          
          // Check if this is scenario 1: died during action (position is 0,0,0)
          if (preActivationPosition.x === 0 && preActivationPosition.y === 0 && preActivationPosition.z === 0) {
            console.log("💀❌ CRITICAL: Bot died during action - position reset to (0,0,0)");
            console.log("💀❌ Cannot recover inventory from this death");
            console.log("💀❌ Killing process - manual intervention required");
            process.exit(1);
          }
          
          console.log(`💀 Death position saved (offline death): ${JSON.stringify(preActivationPosition)}`);
        } else if (this.lastKnownPosition) {
          this.deathPosition = this.lastKnownPosition;
          console.log(`💀 Death position set to last known: ${JSON.stringify(this.lastKnownPosition)}`);
        } else {
          console.log("💀❌ CRITICAL: No death position available - killing process");
          process.exit(1);
        }
        
        const config = await getOperationalConfig();
        try {
          const hash = await bot.movement.spawn(
            config.entities.spawnTile!,
            config.areas.spawnTile,
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
      

      const result = await this.getRecord(PLAYER_BED_TABLE_ID, [playerId]);

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
    // await this.activate();
    const playerId = entityId || this.characterEntityId;

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
      const result = await this.getRecord(ENERGY_TABLE_ID, [playerId]);
      if (!result.staticData || result.staticData === "0x") {
        return "0";
      }

      const energyHex = result.staticData.slice(2);
      const energy = BigInt("0x" + energyHex.slice(32, 64));
      
      const energyPercentage = Number(energy * 100n / MAX_ENERGY);
      
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
      
      // Call getRecord to get position data
      const result = await this.getRecord(ENTITY_POSITION_TABLE_ID, [
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

  // Get the death position if available
  getDeathPosition(): Vec3 | null {
    return this.deathPosition;
  }

  // Clear the death position after successful retrieval
  clearDeathPosition(): void {
    this.deathPosition = null;
    console.log("💀 Death position cleared");
  }
}
