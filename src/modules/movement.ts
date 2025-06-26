import { DustGameBase, TransactionMonitor } from "../core/base.js";
import { Vec3, ObjectType } from "../types.js";
import { packVec3, isValidCoordinate } from "../utils.js";
import {
  withRetry,
  DEFAULT_MOVEMENT_RETRY_CONFIG,
  RetryError,
} from "../retry.js";
import { ethers } from "ethers";
import { PlayerModule } from "./player.js";
import { WorldModule } from "./world.js";

export class MovementModule extends DustGameBase {
  private lastKnownPosition: Vec3 | null = null;
  private txMonitor = new TransactionMonitor();
  private player = new PlayerModule();
  private world = new WorldModule();

  // Non-blocking system call execution
  private async executeSystemCallNonBlocking(
    systemId: string,
    functionSig: string,
    params: any[],
    description: string,
    useOptimizedGas: boolean = true
  ): Promise<string> {
    if (functionSig !== "move(bytes32,uint96[])") {
      console.log(`📋 Function: ${functionSig}`);
      console.log(
        `📦 Parameters:`,
        params.map(
          (p, i) =>
            `  ${i}: ${
              typeof p === "string" && p.length > 50
                ? p.slice(0, 50) + "..."
                : p
            }`
        )
      );
    }

    try {
      // Encode the function call data
      const callData = this.encodeCall(functionSig, params);

      // Use optimized gas settings for Redstone chain
      let gasLimit: bigint;
      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      gasLimit = BigInt(process.env.GAS_LIMIT || "200000");
      maxFeePerGas = ethers.parseUnits("0.000002", "gwei");
      maxPriorityFeePerGas = ethers.parseUnits("0.0000001", "gwei");

      // Call the system through the World contract
      const tx = await this.worldContract.call(systemId, callData, {
        gasLimit: gasLimit,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        value: 0,
      });

      console.log(`🔄 Transaction sent: ${tx.hash} (${description})`);

      // For movement transactions, monitor silently without terminating on failure
      if (functionSig === "move(bytes32,uint96[])") {
        // Monitor movement transactions silently - don't terminate on failure
        const receiptPromise = tx.wait(1);
        receiptPromise
          .then((receipt: ethers.TransactionReceipt) => {
            if (receipt.status === 1) {
              console.log(`✅ Movement confirmed: ${description} (${tx.hash})`);
            } else {
              console.log(
                `⚠️ Movement failed, triggering retry: ${description} (${tx.hash})`
              );
            }
          })
          .catch((error: any) => {
            console.log(
              `⚠️ Movement error, triggering retry: ${description} (${tx.hash}):`,
              error
            );
          });
      } else {
        // Add non-movement transactions to monitoring with termination
        const receiptPromise = tx.wait(1);
        this.txMonitor.addTransaction(tx.hash, description, receiptPromise);
      }

      return tx.hash;
    } catch (error) {
      console.error(`❌ Failed to send transaction: ${description}:`, error);
      throw error;
    }
  }

  // Move from current position towards a target position
  async moveTowards(to: Vec3): Promise<void> {
    if (!isValidCoordinate(to)) {
      throw new Error(`Invalid to coordinate: ${JSON.stringify(to)}`);
    }

    // Get fresh current position for this attempt
    const from = await this.player.getCurrentPosition();
    if (!from) {
      throw new Error("Cannot determine current position");
    }

    // Calculate total steps needed (using Chebyshev distance)
    const totalSteps = this.calculateChebyshevDistance(from, to);

    // Move step by step, recalculating path from actual position each time
    let currentPos = from;
    let stepIndex = 0;

    while (
      currentPos.x !== to.x ||
      currentPos.y !== to.y ||
      currentPos.z !== to.z
    ) {
      stepIndex++;

      // Calculate next step using ground level detection
      const step = await this.calculateNextStep(currentPos, to);

      console.log(
        `🔍 Step ${stepIndex}/${totalSteps} 📍 Bot position: (${
          this.lastKnownPosition?.x || currentPos.x
        }, ${this.lastKnownPosition?.y || currentPos.y}, ${
          this.lastKnownPosition?.z || currentPos.z
        }) -> (${step.x}, ${step.y}, ${step.z})`
      );

      const distance = this.calculateChebyshevDistance(currentPos, step);
      if (distance > 1) {
        console.log(
          `   ⚠️  ERROR: Distance > 1, this should not happen in step generation!`
        );
      }

      // Send transaction without waiting for confirmation
      await this.executeSystemCallNonBlocking(
        this.SYSTEM_IDS.MOVE_SYSTEM,
        "move(bytes32,uint96[])",
        [this.characterEntityId, [packVec3(step)]],
        `Moving to (${step.x}, ${step.y}, ${step.z})`
      );

      // Use intended position for tracking since transaction hasn't confirmed yet
      // The actual position will be updated by the game but we don't wait for it
      this.lastKnownPosition = step;
      currentPos = step; // Update for next iteration

      // Check if we've reached the to position (X and Z coordinates only)
      if (step.x === to.x && step.z === to.z) {
        break;
      }

      // delay between steps
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log(`✅ Reached target: (${to.x}, ${to.y}, ${to.z})`);
    return;
  }

  // Helper function to calculate Chebyshev distance
  private calculateChebyshevDistance(from: Vec3, to: Vec3): number {
    return Math.max(
      Math.abs(to.x - from.x),
      Math.abs(to.y - from.y),
      Math.abs(to.z - from.z)
    );
  }

  // Generate a square movement pattern
  generateSquarePath(center: Vec3, size: number): Vec3[] {
    const halfSize = Math.floor(size / 2);
    return [
      { x: center.x - halfSize, y: center.y, z: center.z - halfSize },
      { x: center.x + halfSize, y: center.y, z: center.z - halfSize },
      { x: center.x + halfSize, y: center.y, z: center.z + halfSize },
      { x: center.x - halfSize, y: center.y, z: center.z + halfSize },
      { x: center.x, y: center.y, z: center.z }, // Return to center
    ];
  }

  // Generate a straight line path
  generateLinePath(start: Vec3, end: Vec3, steps: number): Vec3[] {
    const path: Vec3[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      path.push({
        x: Math.round(start.x + (end.x - start.x) * t),
        y: Math.round(start.y + (end.y - start.y) * t),
        z: Math.round(start.z + (end.z - start.z) * t),
      });
    }

    return path;
  }

  // Generate direction sequence for cardinal movements
  generateDirectionSequence(
    steps: { direction: string; count: number }[]
  ): string[] {
    const directions: string[] = [];

    for (const step of steps) {
      for (let i = 0; i < step.count; i++) {
        directions.push(step.direction);
      }
    }

    return directions;
  }

  // Calculate optimal step position using ground level detection
  private async calculateNextStep(
    currentPos: Vec3,
    target: Vec3
  ): Promise<Vec3> {
    const step = { ...currentPos };

    // Move one step in each axis towards the target (horizontal movement)
    if (currentPos.x < target.x) step.x++;
    else if (currentPos.x > target.x) step.x--;

    if (currentPos.z < target.z) step.z++;
    else if (currentPos.z > target.z) step.z--;

    try {
      const groundLevel = await this.world.getGroundLevel(
        step.x,
        step.z,
        step.y + 2
      );
      step.y = groundLevel;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const latestPos = await this.player.getCurrentPosition();
      step.y = latestPos?.y + 1;
    }
    return step;
  }

  // Spawn character with specific parameters (SpawnSystem)
  async spawn(
    spawnTileEntityId: string,
    spawnCoord: Vec3,
    spawnEnergy: bigint = 245280000000000000n,
    extraData: string = "0x"
  ): Promise<void> {
    console.log(`✨ Spawning character...`);
    console.log(`   Spawn Tile: ${spawnTileEntityId}`);
    console.log(
      `   Spawn Coord: (${spawnCoord.x}, ${spawnCoord.y}, ${spawnCoord.z})`
    );
    console.log(`   Spawn Energy: ${spawnEnergy}`);
    console.log(`   Extra Data: ${extraData}`);

    const encodedCoord = packVec3(spawnCoord);

    const hash = await this.executeSystemCall(
      this.SYSTEM_IDS.SPAWN_SYSTEM,
      "spawn(bytes32,uint96,uint128,bytes)",
      [spawnTileEntityId, encodedCoord, spawnEnergy, extraData],
      "Spawning character",
      true // Use optimized gas for spawn
    );
    if (!hash) {
      throw new Error("Failed to spawn character");
    }

    // Set last known position to spawn coordinate
    this.lastKnownPosition = spawnCoord;
    console.log(
      `📍 Set initial position to spawn coordinate: (${spawnCoord.x}, ${spawnCoord.y}, ${spawnCoord.z})`
    );

    // 500ms delay before next call
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Random spawn character (SpawnSystem)
  async randomSpawn(extraData: string = "0x"): Promise<void> {
    console.log(`🎲 Random spawning character`);

    const hash = await this.executeSystemCallNonBlocking(
      this.SYSTEM_IDS.SPAWN_SYSTEM,
      "randomSpawn(bytes32,bytes)",
      [this.characterEntityId, extraData],
      "Random spawning character",
      true // Use optimized gas for spawn
    );

    // 500ms delay before next call
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
