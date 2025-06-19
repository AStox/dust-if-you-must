import { DustGameBase } from "../core/base.js";
import { Vec3 } from "../types.js";
import { encodeVec3, isValidCoordinate, packVec3 } from "../utils.js";

export class MovementModule extends DustGameBase {
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

    // Encode coordinates for the move function
    const encodedCoords = path.map((coord) => encodeVec3(coord));

    await this.executeSystemCall(
      this.SYSTEM_IDS.MOVE_SYSTEM,
      "move(bytes32,uint96[])",
      [this.characterEntityId, encodedCoords],
      "Moving character"
    );

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

    await this.executeSystemCall(
      this.SYSTEM_IDS.MOVE_SYSTEM,
      "moveDirections(bytes32,string[])",
      [this.characterEntityId, directions],
      "Moving with directions"
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

  // Wake up and then move (convenience method)
  async wakeAndMove(path: Vec3[]): Promise<void> {
    try {
      await this.activate();
      console.log("⏳ Waiting 2 seconds for state to settle...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await this.moveAlongPath(path);
    } catch (error) {
      console.log(
        "⚠️ Activation failed, trying movement anyway (character might already be awake)"
      );
      await this.moveAlongPath(path);
    }
  }

  // Alternative wake and move with directions
  async wakeAndMoveDirections(directions: string[]): Promise<void> {
    try {
      await this.activate();
      console.log("⏳ Waiting 2 seconds for state to settle...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await this.moveDirections(directions);
    } catch (error) {
      console.log(
        "⚠️ Activation failed, trying movement anyway (character might already be awake)"
      );
      await this.moveDirections(directions);
    }
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
    console.log(
      "🔍 Position reading not implemented yet - need to read from Position table"
    );
    return null; // Placeholder
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
