import { DustGameBase } from "../core/base.js";
import { Vec3 } from "../types.js";
import { packVec3, isValidCoordinate } from "../utils.js";
import {
  withRetry,
  DEFAULT_MOVEMENT_RETRY_CONFIG,
  RetryError,
} from "../retry.js";

export class MovementModule extends DustGameBase {
  private lastKnownPosition: Vec3 | null = null;

  // Wake up/activate the character
  async activate(): Promise<void> {
    await this.executeSystemCall(
      this.SYSTEM_IDS.ACTIVATE_SYSTEM,
      "activate(bytes32)",
      [this.characterEntityId],
      "Activating character"
    );
  }

  // Alternative activation method
  async activatePlayer(): Promise<void> {
    await this.executeSystemCall(
      this.SYSTEM_IDS.ACTIVATE_SYSTEM,
      "activatePlayer(bytes32)",
      [this.characterEntityId],
      "Activating player"
    );
  }

  // Move character to a single coordinate
  async moveToCoordinate(target: Vec3): Promise<void> {
    await this.moveAlongPath([target]);
  }

  // Move from current position towards a target position
  async moveTowards(target: Vec3, currentPosition?: Vec3): Promise<void> {
    if (!isValidCoordinate(target)) {
      throw new Error(`Invalid target coordinate: ${JSON.stringify(target)}`);
    }

    // Try to get current position if not provided
    let fromPosition = currentPosition;
    if (!fromPosition) {
      // First try the actual getCurrentPosition method
      const pos = await this.getCurrentPosition();
      if (pos) {
        fromPosition = pos;
      } else if (this.lastKnownPosition) {
        // Fall back to last known position
        fromPosition = this.lastKnownPosition;
        console.log(
          `📍 Using last known position: (${fromPosition.x}, ${fromPosition.y}, ${fromPosition.z})`
        );
      } else {
        throw new Error(
          "Cannot determine current position. Please provide currentPosition parameter or ensure character has moved at least once."
        );
      }
    }

    if (!isValidCoordinate(fromPosition)) {
      throw new Error(
        `Invalid current position: ${JSON.stringify(fromPosition)}`
      );
    }

    // Calculate total steps needed (using Chebyshev distance)
    const totalSteps = this.calculateChebyshevDistance(fromPosition, target);

    // Move step by step, recalculating path from actual position each time
    let currentPos = fromPosition;
    let stepIndex = 0;

    while (
      currentPos.x !== target.x ||
      currentPos.y !== target.y ||
      currentPos.z !== target.z
    ) {
      stepIndex++;

      // Calculate next step from current actual position
      const step = { ...currentPos };

      // Move one step in each axis towards the target
      if (currentPos.x < target.x) step.x++;
      else if (currentPos.x > target.x) step.x--;

      const movingUp = currentPos.y < target.y;
      if (movingUp) step.y++;
      else if (currentPos.y > target.y) step.y--;

      if (currentPos.z < target.z) step.z++;
      else if (currentPos.z > target.z) step.z--;

      // Add jump: move up one block on every step (only if not already moving up)
      if (!movingUp) {
        step.y++;
      }

      console.log(
        `📍 Bot position: (${this.lastKnownPosition?.x}, ${this.lastKnownPosition?.y}, ${this.lastKnownPosition?.z}) 🔍 Step ${stepIndex}/${totalSteps}`
      );

      const distance = this.calculateChebyshevDistance(currentPos, step);
      // console.log(`   Chebyshev distance: ${distance}`);

      if (distance > 1) {
        console.log(
          `   ⚠️  ERROR: Distance > 1, this should not happen in step generation!`
        );
      }

      try {
        await withRetry(
          () =>
            this.executeSystemCall(
              this.SYSTEM_IDS.MOVE_SYSTEM,
              "move(bytes32,uint96[])",
              [this.characterEntityId, [packVec3(step)]],
              `Moving to (${step.x}, ${step.y}, ${step.z})`
            ),
          DEFAULT_MOVEMENT_RETRY_CONFIG,
          `Move to (${step.x}, ${step.y}, ${step.z})`
        );

        // Get actual position after move (player may have fallen due to gravity)
        const actualPosition = await this.getCurrentPosition();
        if (actualPosition) {
          this.lastKnownPosition = actualPosition;
          currentPos = actualPosition; // Update for next iteration

          // If we didn't end up where we expected, note it
          if (
            actualPosition.x !== step.x ||
            actualPosition.y !== step.y ||
            actualPosition.z !== step.z
          ) {
            console.log(
              `   📉 Player fell/moved from intended (${step.x}, ${step.y}, ${step.z}) to actual (${actualPosition.x}, ${actualPosition.y}, ${actualPosition.z})`
            );
          }

          // Check if we've reached the target position (X and Z coordinates)
          if (actualPosition.x === target.x && actualPosition.z === target.z) {
            console.log(
              `🎯 Reached target X,Z coordinates: (${target.x}, ${target.z})`
            );
            break;
          }
        } else {
          // Fallback to intended position if we can't read actual position
          this.lastKnownPosition = step;
          currentPos = step; // Update for next iteration
          console.log(
            `   ⚠️  Could not read actual position, assuming intended position`
          );

          // Check if we've reached the target position (fallback check)
          if (step.x === target.x && step.z === target.z) {
            console.log(
              `🎯 Reached target X,Z coordinates: (${target.x}, ${target.z}) [fallback]`
            );
            break;
          }
        }
      } catch (error) {
        if (error instanceof RetryError) {
          console.error("💥 Movement failed after retries - killing process");
          process.exit(1);
        }
        throw error;
      }

      // Small delay between steps to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`✅ Reached target: (${target.x}, ${target.y}, ${target.z})`);
  }

  // Helper function to calculate Chebyshev distance
  private calculateChebyshevDistance(from: Vec3, to: Vec3): number {
    return Math.max(
      Math.abs(to.x - from.x),
      Math.abs(to.y - from.y),
      Math.abs(to.z - from.z)
    );
  }

  // Helper function to generate single-step path between two points
  private generateStepPath(from: Vec3, to: Vec3): Vec3[] {
    const steps: Vec3[] = [];
    let current = { ...from };

    while (current.x !== to.x || current.y !== to.y || current.z !== to.z) {
      const next = { ...current };

      // Move one step in each axis towards the target
      if (current.x < to.x) next.x++;
      else if (current.x > to.x) next.x--;

      const movingUp = current.y < to.y;
      if (movingUp) next.y++;
      else if (current.y > to.y) next.y--;

      if (current.z < to.z) next.z++;
      else if (current.z > to.z) next.z--;

      // Add jump: move up one block on every step (only if not already moving up)
      if (!movingUp) {
        next.y++;
      }

      steps.push(next);
      current = next;
    }

    return steps;
  }

  // Move character along a path of coordinates using move function
  async moveAlongPath(path: Vec3[]): Promise<void> {
    if (path.length === 0) {
      throw new Error("Path cannot be empty");
    }

    // Validate all coordinates
    for (const coord of path) {
      if (!isValidCoordinate(coord)) {
        throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
      }
    }

    console.log(
      `🚶 Moving along path: ${path
        .map((p) => `(${p.x},${p.y},${p.z})`)
        .join(" -> ")}`
    );

    // Get current position (assuming spawn position or last known position)
    // For now, we'll need to track position or pass it in
    // This is a limitation that needs to be addressed with actual position reading

    // Break down the path into single-step movements
    for (let i = 0; i < path.length; i++) {
      const targetCoord = path[i];

      if (i === 0) {
        // For the first movement, we need to move step by step
        // Since we don't know current position, we'll try to move directly
        // If it fails, the user needs to provide intermediate waypoints
        console.log(
          `📍 Moving to waypoint: (${targetCoord.x}, ${targetCoord.y}, ${targetCoord.z})`
        );
      } else {
        // Generate steps from previous point to current point
        const fromCoord = path[i - 1];
        const stepPath = this.generateStepPath(fromCoord, targetCoord);

        // Execute each single step with retry logic
        for (let stepIndex = 0; stepIndex < stepPath.length; stepIndex++) {
          const step = stepPath[stepIndex];
          const previousPos =
            stepIndex === 0 ? fromCoord : stepPath[stepIndex - 1];

          console.log(
            `📍 Bot position: (${this.lastKnownPosition?.x}, ${
              this.lastKnownPosition?.y
            }, ${this.lastKnownPosition?.z}) 🔍 Step ${stepIndex + 1}/${
              stepPath.length
            }:`
          );
          console.log(
            `   Current position: (${previousPos.x}, ${previousPos.y}, ${previousPos.z})`
          );
          console.log(`   Next position: (${step.x}, ${step.y}, ${step.z})`);

          const distance = this.calculateChebyshevDistance(previousPos, step);
          console.log(`   Chebyshev distance: ${distance}`);

          if (distance > 1) {
            console.log(
              `   ⚠️  ERROR: Distance > 1, this should not happen in step generation!`
            );
          }

          try {
            await withRetry(
              () =>
                this.executeSystemCall(
                  this.SYSTEM_IDS.MOVE_SYSTEM,
                  "move(bytes32,uint96[])",
                  [this.characterEntityId, [packVec3(step)]],
                  `Moving to (${step.x}, ${step.y}, ${step.z})`
                ),
              DEFAULT_MOVEMENT_RETRY_CONFIG,
              `Move to (${step.x}, ${step.y}, ${step.z})`
            );

            // Get actual position after move (player may have fallen due to gravity)
            const actualPosition = await this.getCurrentPosition();
            if (actualPosition) {
              this.lastKnownPosition = actualPosition;
              console.log(
                `   ✅ Actual position after move: (${actualPosition.x}, ${actualPosition.y}, ${actualPosition.z})`
              );

              // If we didn't end up where we expected, note it
              if (
                actualPosition.x !== step.x ||
                actualPosition.y !== step.y ||
                actualPosition.z !== step.z
              ) {
                console.log(
                  `   📉 Player fell/moved from intended (${step.x}, ${step.y}, ${step.z}) to actual (${actualPosition.x}, ${actualPosition.y}, ${actualPosition.z})`
                );
              }
            } else {
              // Fallback to intended position if we can't read actual position
              this.lastKnownPosition = step;
              console.log(
                `   ⚠️  Could not read actual position, assuming intended position`
              );
            }
          } catch (error) {
            if (error instanceof RetryError) {
              console.error(
                "💥 Movement failed after retries - killing process"
              );
              process.exit(1);
            }
            throw error;
          }

          // Small delay between steps to avoid overwhelming the system
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Update last known position to final waypoint
        this.lastKnownPosition = targetCoord;

        continue;
      }

      // Try direct movement for first waypoint
      console.log("🔍 First waypoint movement:");

      // Get current position for debugging
      let currentPos: Vec3 | null = null;
      if (this.lastKnownPosition) {
        currentPos = this.lastKnownPosition;
        console.log(
          `   Current position (from lastKnownPosition): (${currentPos.x}, ${currentPos.y}, ${currentPos.z})`
        );
      } else {
        console.log(`   Current position: UNKNOWN (no lastKnownPosition)`);
        console.log(
          `   ⚠️  Attempting movement without knowing current position!`
        );
      }

      console.log(
        `   Target position: (${targetCoord.x}, ${targetCoord.y}, ${targetCoord.z})`
      );

      if (currentPos) {
        const distance = this.calculateChebyshevDistance(
          currentPos,
          targetCoord
        );
        console.log(`   Chebyshev distance: ${distance}`);
        if (distance > 1) {
          console.log(
            `   ⚠️  WARNING: Distance > 1, movement will likely fail!`
          );
        }
      }

      try {
        await withRetry(
          () =>
            this.executeSystemCall(
              this.SYSTEM_IDS.MOVE_SYSTEM,
              "move(bytes32,uint96[])",
              [this.characterEntityId, [packVec3(targetCoord)]],
              `Moving to (${targetCoord.x}, ${targetCoord.y}, ${targetCoord.z})`
            ),
          DEFAULT_MOVEMENT_RETRY_CONFIG,
          `Move to (${targetCoord.x}, ${targetCoord.y}, ${targetCoord.z})`
        );

        // Get actual position after move (player may have fallen due to gravity)
        const actualPosition = await this.getCurrentPosition();
        if (actualPosition) {
          this.lastKnownPosition = actualPosition;
          console.log(
            `   ✅ Actual position after move: (${actualPosition.x}, ${actualPosition.y}, ${actualPosition.z})`
          );

          // If we didn't end up where we expected, note it
          if (
            actualPosition.x !== targetCoord.x ||
            actualPosition.y !== targetCoord.y ||
            actualPosition.z !== targetCoord.z
          ) {
            console.log(
              `   📉 Player fell/moved from intended (${targetCoord.x}, ${targetCoord.y}, ${targetCoord.z}) to actual (${actualPosition.x}, ${actualPosition.y}, ${actualPosition.z})`
            );
          }
        } else {
          // Fallback to intended position if we can't read actual position
          this.lastKnownPosition = targetCoord;
          console.log(
            `   ⚠️  Could not read actual position, assuming intended position`
          );
        }
      } catch (error) {
        if (error instanceof RetryError) {
          console.error("💥 Movement failed after retries - killing process");
          process.exit(1);
        }
        throw error;
      }
    }

    console.log(
      `📍 Final position: (${path[path.length - 1].x},${
        path[path.length - 1].y
      },${path[path.length - 1].z})`
    );
  }

  // Move character using directions (new function based on MoveSystem)
  async moveDirections(directions: string[]): Promise<void> {
    if (directions.length === 0) {
      throw new Error("Directions cannot be empty");
    }

    console.log(`🧭 Moving with directions: ${directions.join(" -> ")}`);

    try {
      await withRetry(
        () =>
          this.executeSystemCall(
            this.SYSTEM_IDS.MOVE_SYSTEM,
            "moveDirections(bytes32,string[])",
            [this.characterEntityId, directions],
            "Moving with directions"
          ),
        DEFAULT_MOVEMENT_RETRY_CONFIG,
        `Move with directions: ${directions.join(" -> ")}`
      );
    } catch (error) {
      if (error instanceof RetryError) {
        console.error("💥 Movement failed after retries - killing process");
        process.exit(1);
      }
      throw error;
    }
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

  // Wake up and then move (convenience method)
  async wakeAndMove(path: Vec3[]): Promise<void> {
    await this.activate();
    console.log("⏳ Waiting 2 seconds for state to settle...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await this.moveAlongPath(path);
  }

  // Alternative wake and move with directions
  async wakeAndMoveDirections(directions: string[]): Promise<void> {
    await this.activate();
    console.log("⏳ Waiting 2 seconds for state to settle...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await this.moveDirections(directions);
  }

  // Check if character is at a specific location (would need actual game state reading)
  async isAtPosition(target: Vec3): Promise<boolean> {
    console.log(
      "🔍 Position checking not implemented yet - need to read from game tables"
    );
    console.log(`🎯 Target position: (${target.x}, ${target.y}, ${target.z})`);
    return false; // Placeholder
  }

  // Get current character position (would need actual game state reading)
  async getCurrentPosition(): Promise<Vec3 | null> {
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
        console.log("📍 No position data found for character");
        return null;
      }

      // Decode position data from staticData
      // Positions are typically stored as 3 int32 values (x, y, z) = 12 bytes total
      const staticData = result.staticData;

      if (staticData.length < 26) {
        // 0x + 24 hex chars (12 bytes)
        console.log("📍 Invalid position data length");
        return null;
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
      return null;
    }
  }

  // Helper function to convert hex string to signed 32-bit integer
  private hexToInt32(hex: string): number {
    const uint32 = parseInt(hex, 16);
    // Convert to signed 32-bit integer
    return uint32 > 0x7fffffff ? uint32 - 0x100000000 : uint32;
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

    await this.executeSystemCall(
      this.SYSTEM_IDS.SPAWN_SYSTEM,
      "spawn(bytes32,uint96,uint128,bytes)",
      [spawnTileEntityId, encodedCoord, spawnEnergy, extraData],
      "Spawning character",
      true // Use optimized gas for spawn
    );

    // Set last known position to spawn coordinate
    this.lastKnownPosition = spawnCoord;
    console.log(
      `📍 Set initial position to spawn coordinate: (${spawnCoord.x}, ${spawnCoord.y}, ${spawnCoord.z})`
    );
  }

  // Random spawn character (SpawnSystem)
  async randomSpawn(extraData: string = "0x"): Promise<void> {
    console.log(`🎲 Random spawning character`);

    await this.executeSystemCall(
      this.SYSTEM_IDS.SPAWN_SYSTEM,
      "randomSpawn(bytes32,bytes)",
      [this.characterEntityId, extraData],
      "Random spawning character",
      true // Use optimized gas for spawn
    );
  }
}
