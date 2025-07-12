import { DustGameBase } from "../core/base.js";
import { Vec3, Vec2 } from "../types";
import { packVec3 } from "../utils.js";
import { PlayerModule } from "./player.js";
import { WorldModule } from "./world.js";
import { ObjectTypes } from "../types/objectTypes.js";

interface PathNode {
  position: Vec3;
  gCost: number; // Distance from start
  hCost: number; // Distance to target
  fCost: number; // Total cost
  parent: PathNode | null;
  // Movement physics state tracking (matching MoveLib._computePathResult logic)
  jumps: number; // Current jump count in this path
  glides: number; // Current glide count in this path
  fallHeight: number; // Current fall height in this path
  hasGravity: boolean; // Whether this position has gravity applied
  moveUnits: number; // Current move units used in this path segment
}

// Game constants (duplicated from Constants.sol since we can't import from @/dust/)
const MAX_PLAYER_JUMPS = 3;
const MAX_PLAYER_GLIDES = 10;
const PLAYER_SAFE_FALL_DISTANCE = 3;
const MAX_MOVE_UNITS_PER_BLOCK = 1e18;
const MOVING_UNIT_COST = 5e17 / 15; // ~3.33e16
const SWIMMING_UNIT_COST = (5e17 * 10) / 135; // ~3.7e16

// Player body relative coordinates (from ObjectTypes.Player.getRelativeCoords)
const PLAYER_RELATIVE_COORDS: Vec3[] = [
  { x: 0, y: 0, z: 0 }, // Base coordinate
  { x: 0, y: 1, z: 0 }, // Head coordinate
];

// Debug coordinates - add specific coordinates you want to debug here
const DEBUG_COORDINATES: Vec3[] = [
  { x: -380, y: 78, z: 466 },
  { x: -381, y: 79, z: 466 },
  { x: -382, y: 77, z: 466 },
  { x: -381, y: 78, z: 467 }, // User requested debugging for this coordinate
];

interface BatchValidationResult {
  isValid: boolean;
  invalidCoordinate?: Vec3;
  reason?: string;
  coordinateIndex?: number;
}

// Helper function to check if we should debug a specific coordinate
function isDebugCoordinate(coord: Vec3): boolean {
  return DEBUG_COORDINATES.some(
    (debugCoord) =>
      debugCoord.x === coord.x &&
      debugCoord.y === coord.y &&
      debugCoord.z === coord.z
  );
}

export class PathfindingModule extends DustGameBase {
  private player = new PlayerModule();
  private world = new WorldModule();
  private blockDataCache = new Map<
    string,
    { blockType: number; biome: number }
  >();
  private readonly CHUNK_SIZE = 16;

  // Cache performance tracking
  private cacheHits = 0;
  private cacheMisses = 0;

  // Preloaded chunk bounds to constrain pathfinding
  private preloadedChunkBounds: { minY: number; maxY: number } | null = null;
  private preloadedChunks = new Set<string>();

  // A* pathfinding to target Vec2 (x, z coordinates)
  async pathTo(target: Vec2): Promise<Vec3[]> {
    const startTime = Date.now();

    // Reset cache performance tracking for this run
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.preloadedChunkBounds = null;
    this.preloadedChunks.clear();

    console.log(`🎯 Starting A* pathfinding to (${target.x}, ${target.z})`);

    // Get current position
    const posStartTime = Date.now();
    const currentPos = await this.player.getCurrentPosition();
    if (!currentPos) {
      throw new Error("Cannot determine current position");
    }
    console.log(`⏱️ Got current position in ${Date.now() - posStartTime}ms`);

    console.log(
      `📍 Current position: (${currentPos.x}, ${currentPos.y}, ${currentPos.z})`
    );

    // Get target Y coordinate by finding ground level
    const groundStartTime = Date.now();
    const targetY = await this.world.getGroundLevel(
      target.x,
      target.z,
      currentPos.y + 10
    );
    const targetPos: Vec3 = { x: target.x, y: targetY, z: target.z };
    console.log(`⏱️ Got ground level in ${Date.now() - groundStartTime}ms`);

    console.log(
      `🎯 Target position: (${targetPos.x}, ${targetPos.y}, ${targetPos.z})`
    );

    // Preload block data for pathfinding area
    const preloadStartTime = Date.now();
    await this.preloadBlockData(currentPos, targetPos);
    console.log(
      `⏱️ Preloaded block data in ${Date.now() - preloadStartTime}ms`
    );

    // Find path using A*
    const pathStartTime = Date.now();
    const path = await this.findPath(currentPos, targetPos);
    console.log(
      `⏱️ A* pathfinding completed in ${Date.now() - pathStartTime}ms`
    );

    if (!path || path.length === 0) {
      throw new Error("No path found to target");
    }

    console.log(`📍 Path found with ${path.length} steps`);
    console.log(`⏱️ Total pathfinding time: ${Date.now() - startTime}ms`);

    // Report cache performance
    const totalCacheAccesses = this.cacheHits + this.cacheMisses;
    const cacheHitRate =
      totalCacheAccesses > 0
        ? ((this.cacheHits / totalCacheAccesses) * 100).toFixed(1)
        : "0";
    console.log(
      `📊 Cache performance: ${this.cacheHits} hits, ${this.cacheMisses} misses (${cacheHitRate}% hit rate)`
    );
    console.log(`📦 Block cache size: ${this.blockDataCache.size} blocks`);

    return path;
  }

  // Preload block data for the pathfinding area using line intersection
  private async preloadBlockData(
    start: Vec3,
    end: Vec3,
    batchSize: number = 5
  ): Promise<void> {
    console.log("🔄 Preloading block data for pathfinding area...");

    // Get chunks that intersect with the line from start to end
    const chunkStartTime = Date.now();
    const chunks = this.getChunksAlongLine(start, end);
    console.log(
      `⏱️ Calculated ${chunks.length} chunks to load in ${
        Date.now() - chunkStartTime
      }ms`
    );

    // Calculate Y bounds of preloaded chunks to constrain pathfinding
    if (chunks.length > 0) {
      const chunkYValues = chunks.map((chunk) => chunk.y);
      const minChunkY = Math.min(...chunkYValues);
      const maxChunkY = Math.max(...chunkYValues);

      this.preloadedChunkBounds = {
        minY: minChunkY * this.CHUNK_SIZE,
        maxY: (maxChunkY + 1) * this.CHUNK_SIZE - 1,
      };

      console.log(
        `📏 Preloaded chunk Y bounds: ${this.preloadedChunkBounds.minY} to ${this.preloadedChunkBounds.maxY}`
      );
    }

    // Track chunks we're going to preload
    for (const chunk of chunks) {
      const chunkKey = `${chunk.x},${chunk.y},${chunk.z}`;
      this.preloadedChunks.add(chunkKey);
    }
    console.log(
      `📦 Will preload ${this.preloadedChunks.size} chunks: ${Array.from(
        this.preloadedChunks
      ).join(", ")}`
    );

    // Load block data for each chunk in batches
    const loadStartTime = Date.now();
    let successfulChunks = 0;
    let failedChunks = 0;

    // Split chunks into batches
    const batches: Vec3[][] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      batches.push(chunks.slice(i, i + batchSize));
    }

    console.log(
      `📦 Loading ${chunks.length} chunks in ${batches.length} batches of size ${batchSize}`
    );

    // Process each batch sequentially
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(
        `📦 Loading batch ${batchIndex + 1}/${batches.length} (${
          batch.length
        } chunks)`
      );

      const batchPromises = batch.map(async (chunkCoord) => {
        try {
          console.log(
            `📦 Loading chunk (${chunkCoord.x}, ${chunkCoord.y}, ${chunkCoord.z})`
          );

          // Get blocks in this chunk
          const chunkBlocks = await this.world.getChunkBlocks({
            x: chunkCoord.x * this.CHUNK_SIZE,
            y: chunkCoord.y * this.CHUNK_SIZE,
            z: chunkCoord.z * this.CHUNK_SIZE,
          });

          console.log(`📦 Chunk returned ${chunkBlocks.size} blocks`);

          // Copy all blocks to our cache (now they're guaranteed to be from this chunk)
          for (const [key, value] of chunkBlocks) {
            this.blockDataCache.set(key, value);
          }

          console.log(
            `📦 Added ${chunkBlocks.size} blocks from chunk (${chunkCoord.x}, ${chunkCoord.y}, ${chunkCoord.z}) to pathfinding cache`
          );
          successfulChunks++;
        } catch (error) {
          failedChunks++;
          console.log(
            `⚠️  Failed to load chunk (${chunkCoord.x}, ${chunkCoord.y}, ${chunkCoord.z}): ${error}`
          );
        }
      });

      // Wait for this batch to complete before starting the next
      await Promise.all(batchPromises);
    }
    console.log(`⏱️ Loaded chunks in ${Date.now() - loadStartTime}ms`);
    console.log(
      `✅ Successfully loaded ${successfulChunks}/${chunks.length} chunks (${failedChunks} failed)`
    );
    console.log(`📦 Total cached blocks: ${this.blockDataCache.size} blocks`);
  }

  // Get chunks that intersect with a line from start to end, ensuring face connectivity
  private getChunksAlongLine(start: Vec3, end: Vec3): Vec3[] {
    const chunks = new Set<string>();
    const chunkList: Vec3[] = [];

    // Convert world coordinates to chunk coordinates
    const startChunk = this.world.toChunkCoord(start);
    const endChunk = this.world.toChunkCoord(end);

    // If start and end are in the same chunk, just return that chunk
    if (
      startChunk.x === endChunk.x &&
      startChunk.y === endChunk.y &&
      startChunk.z === endChunk.z
    ) {
      return [startChunk];
    }

    // Use 3D line traversal algorithm (3D DDA)
    const dx = Math.abs(endChunk.x - startChunk.x);
    const dy = Math.abs(endChunk.y - startChunk.y);
    const dz = Math.abs(endChunk.z - startChunk.z);

    const x = startChunk.x;
    const y = startChunk.y;
    const z = startChunk.z;

    const xInc = endChunk.x > startChunk.x ? 1 : -1;
    const yInc = endChunk.y > startChunk.y ? 1 : -1;
    const zInc = endChunk.z > startChunk.z ? 1 : -1;

    let error1 = dx - dy;
    let error2 = dx - dz;
    let error3 = dy - dz;

    let currentX = x;
    let currentY = y;
    let currentZ = z;

    const addChunk = (cx: number, cy: number, cz: number) => {
      const key = `${cx},${cy},${cz}`;
      if (!chunks.has(key)) {
        chunks.add(key);
        chunkList.push({ x: cx, y: cy, z: cz });
      }
    };

    // Add the starting chunk
    addChunk(currentX, currentY, currentZ);

    // Traverse the line
    while (
      currentX !== endChunk.x ||
      currentY !== endChunk.y ||
      currentZ !== endChunk.z
    ) {
      // Determine which axis to step along
      if (error1 > 0 && error2 > 0) {
        // Step in X direction
        currentX += xInc;
        error1 -= dy;
        error2 -= dz;
      } else if (error1 <= 0 && error3 > 0) {
        // Step in Y direction
        currentY += yInc;
        error1 += dx;
        error3 -= dz;
      } else {
        // Step in Z direction
        currentZ += zInc;
        error2 += dx;
        error3 += dy;
      }

      addChunk(currentX, currentY, currentZ);
    }

    // Ensure face connectivity by adding adjacent chunks where needed
    const connectedChunks = this.ensureFaceConnectivity(chunkList);

    console.log(
      `🔗 Line intersects ${chunkList.length} chunks, ${connectedChunks.length} chunks after ensuring connectivity`
    );

    return connectedChunks;
  }

  // Ensure that all chunks in the list are connected by full faces
  private ensureFaceConnectivity(chunks: Vec3[]): Vec3[] {
    const chunkSet = new Set<string>();
    const result: Vec3[] = [];

    // Add all original chunks
    for (const chunk of chunks) {
      const key = `${chunk.x},${chunk.y},${chunk.z}`;
      if (!chunkSet.has(key)) {
        chunkSet.add(key);
        result.push(chunk);
      }
    }

    // Check connectivity and add missing chunks
    for (let i = 0; i < chunks.length - 1; i++) {
      const current = chunks[i];
      const next = chunks[i + 1];

      // Check if chunks are face-adjacent
      const dx = Math.abs(next.x - current.x);
      const dy = Math.abs(next.y - current.y);
      const dz = Math.abs(next.z - current.z);

      const totalDistance = dx + dy + dz;

      // If distance is > 1, they're not face-adjacent
      if (totalDistance > 1) {
        // Add intermediate chunks to ensure face connectivity
        const intermediateChunks = this.getIntermediateChunks(current, next);
        for (const intermediate of intermediateChunks) {
          const key = `${intermediate.x},${intermediate.y},${intermediate.z}`;
          if (!chunkSet.has(key)) {
            chunkSet.add(key);
            result.push(intermediate);
          }
        }
      }
    }

    return result;
  }

  // Get intermediate chunks between two chunks to ensure face connectivity
  private getIntermediateChunks(start: Vec3, end: Vec3): Vec3[] {
    const intermediate: Vec3[] = [];

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;

    // Add chunks along the path to ensure face connectivity
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 2) {
      // Diagonal case - add the chunk that shares a face with both
      if (dx !== 0 && dy !== 0) {
        intermediate.push({ x: start.x + dx, y: start.y, z: start.z });
        intermediate.push({ x: start.x, y: start.y + dy, z: start.z });
      } else if (dx !== 0 && dz !== 0) {
        intermediate.push({ x: start.x + dx, y: start.y, z: start.z });
        intermediate.push({ x: start.x, y: start.y, z: start.z + dz });
      } else if (dy !== 0 && dz !== 0) {
        intermediate.push({ x: start.x, y: start.y + dy, z: start.z });
        intermediate.push({ x: start.x, y: start.y, z: start.z + dz });
      }
    } else if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 3) {
      // 3D diagonal case - add multiple intermediate chunks
      intermediate.push({ x: start.x + dx, y: start.y, z: start.z });
      intermediate.push({ x: start.x, y: start.y + dy, z: start.z });
      intermediate.push({ x: start.x, y: start.y, z: start.z + dz });
      intermediate.push({ x: start.x + dx, y: start.y + dy, z: start.z });
      intermediate.push({ x: start.x + dx, y: start.y, z: start.z + dz });
      intermediate.push({ x: start.x, y: start.y + dy, z: start.z + dz });
    }

    return intermediate;
  }

  // A* pathfinding algorithm
  private async findPath(start: Vec3, end: Vec3): Promise<Vec3[] | null> {
    console.log("🔍 Running A* pathfinding...");

    // Verify start and end positions are within preloaded chunks
    const startChunk = this.world.toChunkCoord(start);
    const endChunk = this.world.toChunkCoord(end);
    const startChunkKey = `${startChunk.x},${startChunk.y},${startChunk.z}`;
    const endChunkKey = `${endChunk.x},${endChunk.y},${endChunk.z}`;

    if (!this.preloadedChunks.has(startChunkKey)) {
      console.error(
        `❌ Start position (${start.x}, ${start.y}, ${start.z}) is in chunk (${startChunk.x}, ${startChunk.y}, ${startChunk.z}) which is not preloaded!`
      );
      console.log(
        `   Preloaded chunks: ${Array.from(this.preloadedChunks)
          .slice(0, 10)
          .join(", ")}${this.preloadedChunks.size > 10 ? "..." : ""}`
      );
      return null;
    }

    if (!this.preloadedChunks.has(endChunkKey)) {
      console.error(
        `❌ End position (${end.x}, ${end.y}, ${end.z}) is in chunk (${endChunk.x}, ${endChunk.y}, ${endChunk.z}) which is not preloaded!`
      );
      console.log(
        `   Preloaded chunks: ${Array.from(this.preloadedChunks)
          .slice(0, 10)
          .join(", ")}${this.preloadedChunks.size > 10 ? "..." : ""}`
      );
      return null;
    }

    console.log(`✅ Both start and end positions are within preloaded chunks`);
    console.log(
      `   Start chunk: (${startChunk.x}, ${startChunk.y}, ${startChunk.z})`
    );
    console.log(`   End chunk: (${endChunk.x}, ${endChunk.y}, ${endChunk.z})`);

    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();
    let iterationCount = 0;
    let totalNeighborTime = 0;
    let totalBlockLookupTime = 0;

    // Create start node with initial physics state
    const startNode: PathNode = {
      position: start,
      gCost: 0,
      hCost: this.calculateHeuristic(start, end),
      fCost: 0,
      parent: null,
      jumps: 0,
      glides: 0,
      fallHeight: 0,
      hasGravity: await this.hasGravity(start),
      moveUnits: 0,
    };
    startNode.fCost = startNode.gCost + startNode.hCost;

    openSet.push(startNode);

    while (openSet.length > 0) {
      iterationCount++;

      // Log progress every 100 iterations
      if (iterationCount % 10 === 0) {
        console.log(
          `🔄 A* iteration ${iterationCount}, open: ${openSet.length}, closed: ${closedSet.size}`
        );
      }

      // Find node with lowest F cost
      let currentNode = openSet[0];
      let currentIndex = 0;

      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].fCost < currentNode.fCost) {
          currentNode = openSet[i];
          currentIndex = i;
        }
      }

      // Remove current node from open set
      openSet.splice(currentIndex, 1);

      // Add to closed set
      const currentKey = `${currentNode.position.x},${currentNode.position.y},${currentNode.position.z}`;
      closedSet.add(currentKey);
      // Check if we reached the target (within 1 block in XZ)
      if (
        Math.abs(currentNode.position.x - end.x) <= 1 &&
        Math.abs(currentNode.position.z - end.z) <= 1
      ) {
        console.log(`🎯 Path found after ${iterationCount} iterations!`);
        console.log(
          `⏱️ Total neighbor generation + validation time: ${totalNeighborTime}ms`
        );
        console.log(`⏱️ Total block lookup time: ${totalBlockLookupTime}ms`);
        return this.reconstructPath(currentNode);
      }

      // Get neighbors (with integrated validation)
      const neighborStartTime = Date.now();
      const neighbors = await this.getNeighbors(currentNode.position);
      const neighborElapsed = Date.now() - neighborStartTime;
      totalNeighborTime += neighborElapsed;

      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y},${neighbor.z}`;

        // Skip if already processed
        if (closedSet.has(neighborKey)) {
          continue;
        }

        // Calculate costs
        const gCost =
          currentNode.gCost +
          this.calculateDistance(currentNode.position, neighbor);
        const hCost = this.calculateHeuristic(neighbor, end);
        const fCost = gCost + hCost;

        // Check if this path to neighbor is better
        const existingNode = openSet.find(
          (n) =>
            n.position.x === neighbor.x &&
            n.position.y === neighbor.y &&
            n.position.z === neighbor.z
        );

        if (!existingNode || gCost < existingNode.gCost) {
          // Calculate physics state for this neighbor based on movement from current
          const dy = neighbor.y - currentNode.position.y;
          const neighborHasGravity = await this.hasGravity(neighbor);

          const isDebugNeighbor = isDebugCoordinate(neighbor);
          if (isDebugNeighbor) {
            console.log(
              `\n🔍 DEBUG PHYSICS: Processing node (${neighbor.x}, ${neighbor.y}, ${neighbor.z})`
            );
            console.log(
              `   Parent: (${currentNode.position.x}, ${currentNode.position.y}, ${currentNode.position.z})`
            );
            console.log(
              `   dy: ${dy}, neighborHasGravity: ${neighborHasGravity}, currentHasGravity: ${currentNode.hasGravity}`
            );
            console.log(
              `   Current state - jumps: ${currentNode.jumps}, glides: ${currentNode.glides}, fallHeight: ${currentNode.fallHeight}, moveUnits: ${currentNode.moveUnits}`
            );
          }

          // Apply MoveLib._computePathResult physics logic
          let newJumps = currentNode.jumps;
          let newGlides = currentNode.glides;
          let newFallHeight = currentNode.fallHeight;
          let newMoveUnits = currentNode.moveUnits;

          // Physics state transitions based on smart contract logic
          if (dy < 0 && currentNode.hasGravity) {
            // For falls, increment fall height
            newFallHeight++;
            newGlides = 0; // Reset glides when falling

            if (isDebugNeighbor) {
              console.log(
                `   📉 Fall detected - newFallHeight: ${newFallHeight}, newGlides reset to 0`
              );
            }

            // SIMPLIFICATION RULE: Prevent dangerous falls > PLAYER_SAFE_FALL_DISTANCE = 3
            // Check if this would create a dangerous fall when landing
            if (!neighborHasGravity && newFallHeight > 3) {
              if (isDebugNeighbor) {
                console.log(
                  `   ❌ REJECTED: Dangerous fall landing - fallHeight ${newFallHeight} > 3 (PLAYER_SAFE_FALL_DISTANCE)`
                );
              }
              // This neighbor would result in landing after a dangerous fall - skip it
              continue;
            }
          } else {
            if (dy > 0) {
              // Moving up - increment jumps
              newJumps++;

              if (isDebugNeighbor) {
                console.log(`   ⬆️ Jump detected - newJumps: ${newJumps}`);
              }

              // SMART CONTRACT CONSTRAINT: Enforce MAX_PLAYER_JUMPS = 3
              if (newJumps > 3) {
                if (isDebugNeighbor) {
                  console.log(
                    `   ❌ REJECTED: Too many jumps - ${newJumps} > 3 (MAX_PLAYER_JUMPS)`
                  );
                }
                // Skip this neighbor - exceeds jump limit
                continue;
              }
            } else if (neighborHasGravity) {
              // Moving horizontally/down with gravity at target - increment glides
              newGlides++;

              if (isDebugNeighbor) {
                console.log(`   ➡️ Glide detected - newGlides: ${newGlides}`);
              }

              // SMART CONTRACT CONSTRAINT: Enforce MAX_PLAYER_GLIDES = 10
              if (newGlides > 10) {
                if (isDebugNeighbor) {
                  console.log(
                    `   ❌ REJECTED: Too many glides - ${newGlides} > 10 (MAX_PLAYER_GLIDES)`
                  );
                }
                // Skip this neighbor - exceeds glide limit
                continue;
              }
            }
          }

          // Reset physics state when landing on solid ground
          if (!neighborHasGravity) {
            if (isDebugNeighbor) {
              console.log(
                `   🎯 Landing on solid ground - resetting jumps(${newJumps}→0), glides(${newGlides}→0), fallHeight(${newFallHeight}→0)`
              );
            }
            newJumps = 0;
            newGlides = 0;
            newFallHeight = 0;
          }

          // Add move units based on movement type
          const moveCostUnits = await this.getMoveCostUnits(neighbor);
          if (dy < 0 && currentNode.hasGravity) {
            // For falls, only add move units if landing
            if (!neighborHasGravity) {
              newMoveUnits += moveCostUnits;
              if (isDebugNeighbor) {
                console.log(
                  `   💧 Fall landing - adding ${moveCostUnits} move units (total: ${newMoveUnits})`
                );
              }
            } else {
              if (isDebugNeighbor) {
                console.log(`   📉 Still falling - no move units added`);
              }
            }
          } else {
            // For normal movement (up/horizontal), add move units
            newMoveUnits += moveCostUnits;
            if (isDebugNeighbor) {
              console.log(
                `   🚶 Normal movement - adding ${moveCostUnits} move units (total: ${newMoveUnits})`
              );
            }
          }

          // SMART CONTRACT CONSTRAINT: Enforce MAX_MOVE_UNITS_PER_BLOCK = 1e18
          if (newMoveUnits > MAX_MOVE_UNITS_PER_BLOCK) {
            if (isDebugNeighbor) {
              console.log(
                `   ❌ REJECTED: Move unit limit exceeded - ${newMoveUnits} > ${MAX_MOVE_UNITS_PER_BLOCK} (MAX_MOVE_UNITS_PER_BLOCK)`
              );
            }
            // Skip this neighbor - exceeds move unit limit
            continue;
          }

          const neighborNode: PathNode = {
            position: neighbor,
            gCost,
            hCost,
            fCost,
            parent: currentNode,
            jumps: newJumps,
            glides: newGlides,
            fallHeight: newFallHeight,
            hasGravity: neighborHasGravity,
            moveUnits: newMoveUnits,
          };

          if (isDebugNeighbor) {
            console.log(`   ✅ ACCEPTED: Node created with final state:`);
            console.log(
              `      jumps: ${newJumps}, glides: ${newGlides}, fallHeight: ${newFallHeight}`
            );
            console.log(
              `      moveUnits: ${newMoveUnits}, hasGravity: ${neighborHasGravity}`
            );
            console.log(
              `      gCost: ${gCost}, hCost: ${hCost}, fCost: ${fCost}`
            );
          }

          if (!existingNode) {
            openSet.push(neighborNode);
          } else {
            // Update existing node with better path and physics state
            existingNode.gCost = gCost;
            existingNode.hCost = hCost;
            existingNode.fCost = fCost;
            existingNode.parent = currentNode;
            existingNode.jumps = newJumps;
            existingNode.glides = newGlides;
            existingNode.fallHeight = newFallHeight;
            existingNode.hasGravity = neighborHasGravity;
            existingNode.moveUnits = newMoveUnits;
          }
        }
      }

      // Safety break for very long searches
      if (iterationCount > 10000) {
        console.log(
          `⚠️ A* search limit reached (${iterationCount} iterations)`
        );
        break;
      }
    }

    console.log(`❌ No path found after ${iterationCount} iterations`);
    console.log(
      `⏱️ Total neighbor generation + validation time: ${totalNeighborTime}ms`
    );
    console.log(`⏱️ Total block lookup time: ${totalBlockLookupTime}ms`);
    return null;
  }

  // Get valid neighbors for a position (constrained to preloaded chunks)
  private async getNeighbors(pos: Vec3): Promise<Vec3[]> {
    const anyDebugCoords = DEBUG_COORDINATES.some(
      (coord) =>
        Math.abs(coord.x - pos.x) <= 3 && Math.abs(coord.z - pos.z) <= 3
    );

    if (anyDebugCoords) {
      console.log(
        `\n🔍 DEBUG NEIGHBORS: Getting neighbors for (${pos.x}, ${pos.y}, ${pos.z})`
      );
    }

    // Check only 4 cardinal directions (exactly 1 block distance)
    const directions = [
      { x: 1, z: 0 }, // East
      { x: -1, z: 0 }, // West
      { x: 0, z: 1 }, // South
      { x: 0, z: -1 }, // North
    ];

    // Generate all potential neighbor positions first
    const potentialNeighbors: Vec3[] = [];
    let chunksOutOfBounds = 0;

    for (const dir of directions) {
      // SMART CONTRACT COMPLIANCE: Only consider neighbors within Chebyshev distance ≤ 1
      // This means Y offset can only be -1, 0, or +1 (not ±2)
      for (let yOffset = -1; yOffset <= 1; yOffset++) {
        const newPos = {
          x: pos.x + dir.x,
          y: pos.y + yOffset,
          z: pos.z + dir.z,
        };

        const isDebugNeighbor = isDebugCoordinate(newPos);

        if (isDebugNeighbor) {
          console.log(
            `🔍 DEBUG NEIGHBORS: Considering debug coordinate (${newPos.x}, ${newPos.y}, ${newPos.z})`
          );
        }

        // CRITICAL: Only explore coordinates within preloaded chunks
        // Check if ALL coordinates that will be accessed during validation are preloaded
        if (!this.areAllValidationCoordsPreloaded(newPos)) {
          chunksOutOfBounds++;
          if (isDebugNeighbor) {
            console.log(
              `🔍 DEBUG NEIGHBORS: ❌ Debug coordinate (${newPos.x}, ${newPos.y}, ${newPos.z}) REJECTED - required chunks not preloaded`
            );
          }
          continue; // Skip this position as required chunks aren't preloaded
        }

        if (isDebugNeighbor) {
          console.log(
            `🔍 DEBUG NEIGHBORS: ✅ Debug coordinate (${newPos.x}, ${newPos.y}, ${newPos.z}) passed chunk check`
          );
        }

        potentialNeighbors.push(newPos);
      }
    }

    const totalPossibleNeighbors = directions.length * 3; // 4 directions * 3 Y offsets each (-1, 0, +1)

    // OPTIMIZATION: Inline validation to eliminate duplicate validation calls
    const neighbors: Vec3[] = [];
    const validationResults: {
      position: Vec3;
      isValid: boolean;
      reason?: string;
    }[] = [];

    // Process each potential neighbor with smart contract compliant validation
    for (const newPos of potentialNeighbors) {
      const isDebugNeighbor = isDebugCoordinate(newPos);

      // Use exact MoveLib._requireValidMove validation
      const validation = await this.requireValidMove(pos, newPos);
      const isValid = validation.isValid;
      const failureReason = validation.reason || "";

      // Store validation result for debugging
      validationResults.push({
        position: newPos,
        isValid,
        reason: failureReason,
      });

      // Add to valid neighbors list
      if (isValid) {
        neighbors.push(newPos);
      }

      // Debug logging for this neighbor
      if (isDebugNeighbor) {
        console.log(
          `🔍 DEBUG NEIGHBORS: ${isValid ? "✅" : "❌"} (${newPos.x}, ${
            newPos.y
          }, ${newPos.z}) - ${isValid ? "VALID" : `INVALID: ${failureReason}`}`
        );
      }
    }

    // Debug logging summary
    if (anyDebugCoords) {
      console.log(
        `🔍 DEBUG NEIGHBORS: Inline validation processed ${potentialNeighbors.length} potential neighbors, ${neighbors.length} valid`
      );
    }

    if (neighbors.length === 0) {
      console.log(
        `⚠️ No valid neighbors found for position (${pos.x}, ${pos.y}, ${pos.z}) after checking ${potentialNeighbors.length} positions within preloaded chunks`
      );

      if (potentialNeighbors.length === 0) {
        console.log(
          `❌ CRITICAL: Current position (${pos.x}, ${pos.y}, ${pos.z}) has no neighbors in preloaded chunks!`
        );
        console.log(
          `   Current chunk: ${this.world.toChunkCoord(pos).x}, ${
            this.world.toChunkCoord(pos).y
          }, ${this.world.toChunkCoord(pos).z}`
        );
        console.log(
          `   Preloaded chunks: ${Array.from(this.preloadedChunks)
            .slice(0, 5)
            .join(", ")}${this.preloadedChunks.size > 5 ? "..." : ""}`
        );
      }
    }

    return neighbors;
  }

  // Smart Contract Compliant: Check if a move is valid according to exact MoveLib.sol rules
  // Implements MoveLib._requireValidMove() logic precisely
  private async requireValidMove(
    from: Vec3,
    to: Vec3
  ): Promise<{ isValid: boolean; reason?: string }> {
    const isDebug = isDebugCoordinate(to);

    if (isDebug) {
      console.log(
        `\n🔍 DEBUG: MoveLib validation from (${from.x}, ${from.y}, ${from.z}) to (${to.x}, ${to.y}, ${to.z})`
      );
    }

    // 1. EXACT SMART CONTRACT RULE: require(baseOldCoord.inSurroundingCube(baseNewCoord, 1))
    // This is the Chebyshev distance validation from Vec3.sol
    const chebyshevDistance = Math.max(
      Math.abs(to.x - from.x),
      Math.abs(to.y - from.y),
      Math.abs(to.z - from.z)
    );

    if (chebyshevDistance > 1) {
      const reason = `New coord is too far from old coord (Chebyshev distance ${chebyshevDistance} > 1)`;
      if (isDebug) {
        console.log(`🔍 DEBUG: ❌ FAILED - ${reason}`);
      }
      return { isValid: false, reason };
    }

    if (isDebug) {
      console.log(
        `🔍 DEBUG: ✅ inSurroundingCube check passed (distance ${chebyshevDistance})`
      );
    }

    // 2. EXACT SMART CONTRACT RULE: Get player body coordinates
    // Vec3[] memory newPlayerCoords = ObjectTypes.Player.getRelativeCoords(baseNewCoord);
    // Player body coordinates are base (x,y,z) and head (x,y+1,z) - exactly 2 blocks
    const playerBodyCoords = [
      { x: to.x, y: to.y, z: to.z }, // Base coordinate
      { x: to.x, y: to.y + 1, z: to.z }, // Head coordinate
    ];

    if (isDebug) {
      console.log(
        `🔍 DEBUG: Checking ${playerBodyCoords.length} player body coordinates`
      );
    }

    // 3. EXACT SMART CONTRACT RULE: For each player body coordinate
    for (let i = 0; i < playerBodyCoords.length; i++) {
      const playerCoord = playerBodyCoords[i];
      const coordName = i === 0 ? "base" : "head";

      if (isDebug) {
        console.log(
          `🔍 DEBUG: Validating ${coordName} coord (${playerCoord.x}, ${playerCoord.y}, ${playerCoord.z})`
        );
      }

      // 3a. EXACT SMART CONTRACT RULE: ObjectType newObjectType = EntityUtils.safeGetObjectTypeAt(newCoord);
      // This enforces chunk exploration requirement - chunks must be explored for safeGetObjectTypeAt to work
      let objectType: number;
      try {
        objectType = await this.getCachedBlockType(playerCoord);

        // Check if we're accessing unexplored chunks (cache miss would indicate this)
        // In smart contract, safeGetObjectTypeAt reverts if chunk not explored
        if (!this.areAllValidationCoordsPreloaded(playerCoord)) {
          const reason = `Chunk not preloaded yet for ${coordName} coordinate (${playerCoord.x}, ${playerCoord.y}, ${playerCoord.z})`;
          if (isDebug) {
            console.log(`🔍 DEBUG: ❌ FAILED - ${reason}`);
          }
          return { isValid: false, reason };
        }
      } catch (error) {
        const reason = `Failed to get object type for ${coordName} coordinate (${playerCoord.x}, ${playerCoord.y}, ${playerCoord.z}): ${error}`;
        if (isDebug) {
          console.log(`🔍 DEBUG: ❌ FAILED - ${reason}`);
        }
        return { isValid: false, reason };
      }

      // 3b. EXACT SMART CONTRACT RULE: if (!newObjectType.isPassThrough()) { revert NonPassableBlock(...) }
      // Check if the object type is passable
      if (!ObjectTypes[objectType]?.passThrough) {
        const reason = `Non-passable block at ${coordName} coordinate (${playerCoord.x}, ${playerCoord.y}, ${playerCoord.z}) - object type ${objectType}`;
        if (isDebug) {
          console.log(`🔍 DEBUG: ❌ FAILED - ${reason}`);
        }
        return { isValid: false, reason };
      }

      // 3c. SMART CONTRACT RULE (DEFERRED): require(!EntityUtils.getMovableEntityAt(newCoord)._exists(), "Cannot move through a player");
      // This checks for player collision - we're deferring this for initial implementation
      if (isDebug) {
        console.log(
          `🔍 DEBUG: ✅ ${coordName} coord passed (object type ${objectType}, passThrough: true)`
        );
      }
    }

    // 4. SIMPLIFICATION RULE: Prevent falls > PLAYER_SAFE_FALL_DISTANCE (3 blocks)
    // This is our simplification instead of calculating fall damage
    const fallHeight = from.y - to.y;
    if (fallHeight > 3) {
      // PLAYER_SAFE_FALL_DISTANCE = 3 from Constants.sol
      const reason = `Fall too dangerous: ${fallHeight} blocks > safe fall distance (3)`;
      if (isDebug) {
        console.log(`🔍 DEBUG: ❌ FAILED - ${reason}`);
      }
      return { isValid: false, reason };
    }

    if (isDebug && fallHeight > 0) {
      console.log(`🔍 DEBUG: ✅ Fall distance OK (${fallHeight} <= 3)`);
    }

    if (isDebug) {
      console.log(`🔍 DEBUG: ✅ MoveLib._requireValidMove validation PASSED`);
    }

    return { isValid: true };
  }

  // Get cached block type with fallback
  private async getCachedBlockType(pos: Vec3): Promise<number> {
    const key = `${pos.x},${pos.y},${pos.z}`;
    if (this.blockDataCache.has(key)) {
      this.cacheHits++;
      return this.blockDataCache.get(key)!.blockType;
    }

    this.cacheMisses++;

    const blockChunk = this.world.toChunkCoord(pos);
    const chunkKey = `${blockChunk.x},${blockChunk.y},${blockChunk.z}`;

    console.error(
      `❌ CACHE MISS BUG: Block (${pos.x}, ${pos.y}, ${pos.z}) in chunk (${blockChunk.x}, ${blockChunk.y}, ${blockChunk.z})`
    );
    console.error(`   Chunk preloaded: ${this.preloadedChunks.has(chunkKey)}`);
    console.error(`   Total preloaded chunks: ${this.preloadedChunks.size}`);

    // Log stack trace to see where this is being called from
    console.error(
      "   Call stack:",
      new Error().stack?.split("\n").slice(1, 4).join("\n")
    );

    // Fallback to world module
    try {
      const blockData = await this.world.getCachedBlockData(pos);
      this.blockDataCache.set(key, blockData);
      return blockData.blockType;
    } catch (error) {
      // Assume air if we can't get block data
      return 1; // Air
    }
  }

  // Calculate heuristic (Manhattan distance in 3D) with ground level preference
  private calculateHeuristic(from: Vec3, to: Vec3): number {
    const baseHeuristic =
      Math.abs(to.x - from.x) +
      Math.abs(to.y - from.y) +
      Math.abs(to.z - from.z);

    // Add a small penalty for being too high above ground to encourage staying closer to ground level
    let heightPenalty = 0;
    try {
      // Check if we're floating above ground unnecessarily
      const groundPos = { x: from.x, y: from.y - 1, z: from.z };
      const blockType = this.blockDataCache.get(
        `${groundPos.x},${groundPos.y},${groundPos.z}`
      )?.blockType;

      if (blockType && ObjectTypes[blockType]?.passThrough) {
        // We're floating - add a small penalty to discourage this
        heightPenalty = 0.1;
      }
    } catch (error) {
      // If we can't check, no penalty
    }

    return baseHeuristic + heightPenalty;
  }

  // Calculate actual distance between two positions
  private calculateDistance(from: Vec3, to: Vec3): number {
    const baseDistance = Math.sqrt(
      Math.pow(to.x - from.x, 2) +
        Math.pow(to.y - from.y, 2) +
        Math.pow(to.z - from.z, 2)
    );

    // Add a penalty for floating above ground to encourage staying on solid ground
    let groundPenalty = 0;
    try {
      // Check if the destination is floating above ground
      const groundPos = { x: to.x, y: to.y - 1, z: to.z };
      const blockType = this.blockDataCache.get(
        `${groundPos.x},${groundPos.y},${groundPos.z}`
      )?.blockType;

      if (blockType && ObjectTypes[blockType]?.passThrough) {
        // The destination is floating - add a penalty to discourage this path
        groundPenalty = 0.2;
      }
    } catch (error) {
      // If we can't check, no penalty
    }

    return baseDistance + groundPenalty;
  }

  // Reconstruct path from goal to start
  private reconstructPath(goalNode: PathNode): Vec3[] {
    const path: Vec3[] = [];
    let current: PathNode | null = goalNode;

    while (current) {
      path.unshift(current.position);
      current = current.parent;
    }

    return path;
  }

  // Execute the found path
  async executePath(path: Vec3[]): Promise<void> {
    console.log(`🚶 Executing path with ${path.length} steps`);

    if (path.length <= 1) {
      console.log("⚠️ Path has no steps to execute");
      return;
    }

    // Remove the first position (current position) and get remaining steps
    const steps = path.slice(1);
    console.log(
      `📦 Splitting ${steps.length} steps into batches based on move units...`
    );

    // Split steps into batches based on move unit limits
    const batches: Vec3[][] = [];
    let currentBatch: Vec3[] = [];
    let currentMoveUnits = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Calculate move cost for this step
      const moveCost = await this.getMoveCost(step);

      // Check if adding this step would exceed the limit
      if (
        currentMoveUnits + moveCost > MAX_MOVE_UNITS_PER_BLOCK &&
        currentBatch.length > 0
      ) {
        // Start a new batch
        batches.push([...currentBatch]);
        currentBatch = [step];
        currentMoveUnits = moveCost;
      } else {
        // Add to current batch
        currentBatch.push(step);
        currentMoveUnits += moveCost;
      }
    }

    // Add the final batch if it has steps
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    console.log(
      `📦 Split path into ${batches.length} batches due to move unit limits`
    );

    // Track current position across batches (starts with actual position, then uses intended positions)
    let currentTrackingPos = await this.player.getCurrentPosition();
    if (!currentTrackingPos) {
      throw new Error("Cannot determine starting position for pathfinding");
    }

    // Execute each batch sequentially
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(
        `🚶 Executing batch ${batchIndex + 1}/${batches.length} (${
          batch.length
        } steps)`
      );

      console.log(
        `📍 Using position for validation: (${currentTrackingPos.x}, ${currentTrackingPos.y}, ${currentTrackingPos.z})`
      );

      // Validate the entire batch before sending transaction
      console.log(`🔍 Validating batch ${batchIndex + 1} before execution...`);
      const validationResult = await this.validateBatch(
        currentTrackingPos,
        batch
      );

      if (!validationResult.isValid) {
        console.error(
          `❌ Batch ${batchIndex + 1} validation failed at coordinate ${
            validationResult.coordinateIndex
          }: ${validationResult.reason}`
        );
        console.error(
          `   Invalid coordinate: (${validationResult.invalidCoordinate?.x}, ${validationResult.invalidCoordinate?.y}, ${validationResult.invalidCoordinate?.z})`
        );

        // Try to continue with a smaller batch or handle the error
        if (
          validationResult.coordinateIndex &&
          validationResult.coordinateIndex > 0
        ) {
          // Execute the valid portion of the batch
          const validBatch = batch.slice(0, validationResult.coordinateIndex);
          console.log(
            `⚠️ Executing only the first ${
              validBatch.length
            } valid steps from batch ${batchIndex + 1}`
          );

          const packedSteps = await Promise.all(
            validBatch.map((step) => packVec3(step))
          );

          await this.executeSystemCallNonBlocking(
            this.SYSTEM_IDS.MOVE_SYSTEM,
            "move(bytes32,uint96[])",
            [this.characterEntityId, packedSteps],
            `A* pathfinding - partial batch ${batchIndex + 1}/${
              batches.length
            } (${validBatch.length}/${batch.length} steps)`
          );

          // Update current tracking position to the last valid coordinate executed
          if (validBatch.length > 0) {
            currentTrackingPos = validBatch[validBatch.length - 1];
            console.log(
              `📍 Updated tracking position to: (${currentTrackingPos.x}, ${currentTrackingPos.y}, ${currentTrackingPos.z})`
            );
          }

          // Skip the rest of this batch and continue with the next
          continue;
        } else {
          throw new Error(
            `Batch validation failed: ${validationResult.reason}`
          );
        }
      }

      console.log(`✅ Batch ${batchIndex + 1} validation passed`);

      // Pack all Vec3 positions in this batch
      const packingPromises = batch.map(async (step) => {
        return packVec3(step);
      });

      const packedSteps = await Promise.all(packingPromises);

      // Log the steps in this batch
      for (let i = 0; i < batch.length; i++) {
        const step = batch[i];
        console.log(
          `📍 Batch ${batchIndex + 1} Step ${i + 1}/${batch.length}: (${
            step.x
          }, ${step.y}, ${step.z})`
        );
      }

      // Send this batch
      await this.executeSystemCallNonBlocking(
        this.SYSTEM_IDS.MOVE_SYSTEM,
        "move(bytes32,uint96[])",
        [this.characterEntityId, packedSteps],
        `A* pathfinding - batch ${batchIndex + 1}/${batches.length} (${
          batch.length
        } steps)`
      );

      // Update current tracking position to the last coordinate in this batch
      if (batch.length > 0) {
        currentTrackingPos = batch[batch.length - 1];
        console.log(
          `📍 Updated tracking position to: (${currentTrackingPos.x}, ${currentTrackingPos.y}, ${currentTrackingPos.z})`
        );
      }

      // Add a small delay between batches to ensure they're processed in order
      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  // Comprehensive batch validation that mirrors game's MoveLib logic
  private async validateBatch(
    startPos: Vec3,
    batch: Vec3[]
  ): Promise<BatchValidationResult> {
    console.log(
      `🔍 Starting comprehensive batch validation for ${batch.length} coordinates`
    );

    let currentPos = startPos;
    let currentMoveUnits = 0;
    let jumps = 0;
    let glides = 0;
    let fallHeight = 0;

    // Check if current position has gravity (needed for jump/glide tracking)
    let currentHasGravity = await this.hasGravity(currentPos);

    for (let i = 0; i < batch.length; i++) {
      const nextPos = batch[i];

      console.log(
        `  📍 Validating step ${i + 1}/${batch.length}: (${currentPos.x}, ${
          currentPos.y
        }, ${currentPos.z}) -> (${nextPos.x}, ${nextPos.y}, ${nextPos.z})`
      );

      // 1. Check Chebyshev distance (max 1 block)
      const chebyshevDistance = Math.max(
        Math.abs(nextPos.x - currentPos.x),
        Math.abs(nextPos.y - currentPos.y),
        Math.abs(nextPos.z - currentPos.z)
      );

      if (chebyshevDistance > 1) {
        return {
          isValid: false,
          invalidCoordinate: nextPos,
          reason: `Chebyshev distance ${chebyshevDistance} > 1 (too far from previous coordinate)`,
          coordinateIndex: i,
        };
      }

      // 2. SAFETY CHECK: Ensure all coordinates we'll access are in preloaded chunks
      if (!this.areAllValidationCoordsPreloaded(nextPos)) {
        return {
          isValid: false,
          invalidCoordinate: nextPos,
          reason: `Required validation coordinates not in preloaded chunks`,
          coordinateIndex: i,
        };
      }

      // 3. Validate all player body coordinates are passable
      const bodyValidation = await this.validatePlayerBodyCoordinates(nextPos);
      if (!bodyValidation.isValid) {
        return {
          isValid: false,
          invalidCoordinate: nextPos,
          reason: `Player body validation failed: ${bodyValidation.reason}`,
          coordinateIndex: i,
        };
      }

      // 4. Check movement type and constraints
      const dy = nextPos.y - currentPos.y;
      const nextHasGravity = await this.hasGravity(nextPos);

      // Track jump/glide/fall logic (mirrors MoveLib._computePathResult)
      if (dy < 0 && currentHasGravity) {
        // Falling
        fallHeight++;
        glides = 0; // Reset glides when falling

        // If landing, check move units
        if (!nextHasGravity) {
          const moveUnits = await this.getMoveCostUnits(nextPos);
          currentMoveUnits += moveUnits;
        }
      } else {
        if (dy > 0) {
          // Jumping up
          jumps++;
          if (jumps > MAX_PLAYER_JUMPS) {
            return {
              isValid: false,
              invalidCoordinate: nextPos,
              reason: `Too many consecutive jumps: ${jumps} > ${MAX_PLAYER_JUMPS}`,
              coordinateIndex: i,
            };
          }
        } else if (nextHasGravity) {
          // Gliding (horizontal movement with gravity)
          glides++;
          if (glides > MAX_PLAYER_GLIDES) {
            return {
              isValid: false,
              invalidCoordinate: nextPos,
              reason: `Too many consecutive glides: ${glides} > ${MAX_PLAYER_GLIDES}`,
              coordinateIndex: i,
            };
          }
        }

        // Add move units for this step
        const moveUnits = await this.getMoveCostUnits(nextPos);
        currentMoveUnits += moveUnits;
      }

      // 5. Check move unit limit
      if (currentMoveUnits > MAX_MOVE_UNITS_PER_BLOCK) {
        return {
          isValid: false,
          invalidCoordinate: nextPos,
          reason: `Move unit limit exceeded: ${currentMoveUnits} > ${MAX_MOVE_UNITS_PER_BLOCK}`,
          coordinateIndex: i,
        };
      }

      // Reset counters when landing
      if (!nextHasGravity) {
        // Check fall damage if landing after a long fall
        if (
          fallHeight > PLAYER_SAFE_FALL_DISTANCE &&
          !(await this.isFluid(nextPos))
        ) {
          console.log(
            `  ⚠️  Landing after fall of ${fallHeight} blocks (> ${PLAYER_SAFE_FALL_DISTANCE} safe distance)`
          );
        }
        fallHeight = 0;
        jumps = 0;
        glides = 0;
      }

      // Update state for next iteration
      currentHasGravity = nextHasGravity;
      currentPos = nextPos;
    }

    console.log(
      `✅ Batch validation passed - all ${batch.length} coordinates are valid`
    );
    console.log(
      `📊 Final move units used: ${currentMoveUnits}/${MAX_MOVE_UNITS_PER_BLOCK}`
    );

    return { isValid: true };
  }

  // Validate all player body coordinates are passable and don't contain other entities
  private async validatePlayerBodyCoordinates(
    baseCoord: Vec3
  ): Promise<{ isValid: boolean; reason?: string }> {
    const isDebug = isDebugCoordinate(baseCoord);

    if (isDebug) {
      console.log(
        `🔍 DEBUG BODY: Validating player body for base coordinate (${baseCoord.x}, ${baseCoord.y}, ${baseCoord.z})`
      );
    }

    for (const relativeCoord of PLAYER_RELATIVE_COORDS) {
      const playerCoord = {
        x: baseCoord.x + relativeCoord.x,
        y: baseCoord.y + relativeCoord.y,
        z: baseCoord.z + relativeCoord.z,
      };

      // Check if this coordinate is passable
      const blockType = await this.getCachedBlockType(playerCoord);

      if (isDebug) {
        console.log(
          `🔍 DEBUG BODY: Player body part (${playerCoord.x}, ${playerCoord.y}, ${playerCoord.z}): block type ${blockType}, passThrough: ${ObjectTypes[blockType]?.passThrough}`
        );
      }

      if (!ObjectTypes[blockType]?.passThrough) {
        if (isDebug) {
          console.log(
            `🔍 DEBUG BODY: ❌ FAILED - Player body coordinate (${playerCoord.x}, ${playerCoord.y}, ${playerCoord.z}) is not passable (block type ${blockType})`
          );
        }
        return {
          isValid: false,
          reason: `Player body coordinate (${playerCoord.x}, ${playerCoord.y}, ${playerCoord.z}) is not passable (block type ${blockType})`,
        };
      }

      // TODO: Add check for other players at this coordinate
      // This would require checking EntityUtils.getMovableEntityAt() equivalent
      // For now, we rely on the basic block passability check
    }

    if (isDebug) {
      console.log(`🔍 DEBUG BODY: ✅ All player body coordinates are passable`);
    }

    return { isValid: true };
  }

  // Smart Contract Compliant: Check if gravity applies at a coordinate
  // Implements MoveLib._gravityApplies() logic precisely
  private async hasGravity(coord: Vec3): Promise<boolean> {
    const belowCoord = { x: coord.x, y: coord.y - 1, z: coord.z };

    // 1. EXACT SMART CONTRACT RULE: EntityUtils.safeGetObjectTypeAt(belowCoord).isPassThrough()
    const belowBlockType = await this.getCachedBlockType(belowCoord);
    const belowIsPassthrough =
      ObjectTypes[belowBlockType]?.passThrough || false;

    // 2. SMART CONTRACT RULE (DEFERRED): !EntityUtils.getMovableEntityAt(belowCoord)._exists()
    // This checks for player collision below - we're deferring this for initial implementation
    const noMovableEntityBelow = true; // Deferred

    // 3. EXACT SMART CONTRACT RULE: !_isFluid(playerCoord)
    // Note: Smart contract checks fluid at CURRENT position, not below
    const notInFluid = !(await this.isFluid(coord));

    // Gravity applies when all conditions are met
    return belowIsPassthrough && noMovableEntityBelow && notInFluid;
  }

  // Check if a coordinate contains fluid
  private async isFluid(coord: Vec3): Promise<boolean> {
    // For now, we'll use a simple heuristic based on block type
    // Water blocks are typically passthrough but should be considered fluid
    const blockType = await this.getCachedBlockType(coord);

    // Water object type (this would need to be looked up from the actual ObjectTypes)
    // For now, we'll assume water is block type 10 (this may need adjustment)
    return blockType === 10;
  }

  // Check if ALL coordinates that will be accessed during validation are in preloaded chunks
  private areAllValidationCoordsPreloaded(baseCoord: Vec3): boolean {
    const coordsToCheck: Vec3[] = [];

    // 1. Player body coordinates (base + head)
    for (const relativeCoord of PLAYER_RELATIVE_COORDS) {
      coordsToCheck.push({
        x: baseCoord.x + relativeCoord.x,
        y: baseCoord.y + relativeCoord.y,
        z: baseCoord.z + relativeCoord.z,
      });
    }

    // 2. Ground check coordinates (used in isValidMove)
    coordsToCheck.push(
      { x: baseCoord.x, y: baseCoord.y - 1, z: baseCoord.z }, // groundPos
      { x: baseCoord.x, y: baseCoord.y - 2, z: baseCoord.z } // lowerGroundPos
    );

    // 3. Gravity check coordinate (used in hasGravity)
    coordsToCheck.push({ x: baseCoord.x, y: baseCoord.y - 1, z: baseCoord.z });

    // Check that all these coordinates have their chunks preloaded
    for (const coord of coordsToCheck) {
      const chunkCoord = this.world.toChunkCoord(coord);
      const chunkKey = `${chunkCoord.x},${chunkCoord.y},${chunkCoord.z}`;

      if (!this.preloadedChunks.has(chunkKey)) {
        return false;
      }
    }

    return true;
  }

  // Calculate move cost for a step based on terrain (for batch creation)
  private async getMoveCost(step: Vec3): Promise<number> {
    return await this.getMoveCostUnits(step);
  }

  // Get move cost in units (for move unit limit checking)
  private async getMoveCostUnits(coord: Vec3): Promise<number> {
    try {
      // Check the block below to determine terrain
      const belowPos = { x: coord.x, y: coord.y - 1, z: coord.z };
      const belowBlockType = await this.getCachedBlockType(belowPos);

      // Check if it's lava
      if (belowBlockType === 111) {
        // Lava object type
        return MOVING_UNIT_COST;
      }

      // Check if it's water/swimming (passthrough block below)
      if (
        ObjectTypes[belowBlockType]?.passThrough &&
        (await this.isFluid(belowPos))
      ) {
        return SWIMMING_UNIT_COST;
      }

      return MOVING_UNIT_COST;
    } catch (error) {
      console.log(
        `⚠️ Could not determine move cost units for (${coord.x}, ${coord.y}, ${coord.z}), assuming walking`
      );
      return MOVING_UNIT_COST;
    }
  }
}
