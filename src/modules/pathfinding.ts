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
      console.log(`✅ Batch ${batchIndex + 1}/${batches.length} completed`);
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

    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();
    let iterationCount = 0;
    let totalNeighborTime = 0;
    let totalBlockLookupTime = 0;

    // Create start node
    const startNode: PathNode = {
      position: start,
      gCost: 0,
      hCost: this.calculateHeuristic(start, end),
      fCost: 0,
      parent: null,
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
          `⏱️ Total neighbor generation time: ${totalNeighborTime}ms`
        );
        console.log(`⏱️ Total block lookup time: ${totalBlockLookupTime}ms`);
        return this.reconstructPath(currentNode);
      }

      // Get neighbors
      const neighborStartTime = Date.now();
      const neighbors = await this.getNeighbors(currentNode.position);
      totalNeighborTime += Date.now() - neighborStartTime;

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
          const neighborNode: PathNode = {
            position: neighbor,
            gCost,
            hCost,
            fCost,
            parent: currentNode,
          };

          if (!existingNode) {
            openSet.push(neighborNode);
          } else {
            // Update existing node
            existingNode.gCost = gCost;
            existingNode.hCost = hCost;
            existingNode.fCost = fCost;
            existingNode.parent = currentNode;
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
    console.log(`⏱️ Total neighbor generation time: ${totalNeighborTime}ms`);
    console.log(`⏱️ Total block lookup time: ${totalBlockLookupTime}ms`);
    return null;
  }

  // Get valid neighbors for a position
  private async getNeighbors(pos: Vec3): Promise<Vec3[]> {
    // Check only 4 cardinal directions (exactly 1 block distance)
    const directions = [
      { x: 1, z: 0 }, // East
      { x: -1, z: 0 }, // West
      { x: 0, z: 1 }, // South
      { x: 0, z: -1 }, // North
    ];

    // Generate all potential neighbor positions first
    const potentialNeighbors: Vec3[] = [];
    for (const dir of directions) {
      // Check movement within preloaded chunks to avoid cache misses
      // Can go down 2 blocks or up 2 blocks
      for (let yOffset = -2; yOffset <= 2; yOffset++) {
        const newPos = {
          x: pos.x + dir.x,
          y: pos.y + yOffset,
          z: pos.z + dir.z,
        };

        // Check if this position is within a preloaded chunk
        const chunkCoord = this.world.toChunkCoord(newPos);
        const chunkKey = `${chunkCoord.x},${chunkCoord.y},${chunkCoord.z}`;

        if (!this.preloadedChunks.has(chunkKey)) {
          continue; // Skip this position as its chunk wasn't preloaded
        }

        potentialNeighbors.push(newPos);
      }
    }

    const totalPossibleNeighbors = directions.length * 5; // 4 directions * 5 Y offsets each
    const filteredOut = totalPossibleNeighbors - potentialNeighbors.length;

    // Validate all neighbors in parallel
    const validationPromises = potentialNeighbors.map(async (newPos) => {
      const isValid = await this.isValidMove(pos, newPos);
      return { position: newPos, isValid };
    });

    const validationResults = await Promise.all(validationPromises);

    // Filter to only valid neighbors
    const neighbors = validationResults
      .filter((result) => result.isValid)
      .map((result) => result.position);

    if (neighbors.length === 0) {
      console.log(
        `⚠️ No valid neighbors found for position (${pos.x}, ${pos.y}, ${pos.z}) after ${potentialNeighbors.length} checks`
      );
    }

    return neighbors;
  }

  // Check if a move is valid according to the rules
  private async isValidMove(from: Vec3, to: Vec3): Promise<boolean> {
    // Check Chebyshev distance (max 1 block in any direction per move)
    const chebyshevDistance = Math.max(
      Math.abs(to.x - from.x),
      Math.abs(to.y - from.y),
      Math.abs(to.z - from.z)
    );

    if (chebyshevDistance > 1) {
      return false;
    }

    // Additional checks for vertical movement limits
    // Check jump height (max 1 block up per move due to Chebyshev constraint)
    if (to.y - from.y > 1) {
      return false;
    }

    // Check drop height (max 1 block down per move due to Chebyshev constraint)
    if (from.y - to.y > 1) {
      return false;
    }

    // Check if target position is passable
    const toBlockType = await this.getCachedBlockType(to);
    if (!ObjectTypes[toBlockType]?.passThrough) {
      return false;
    }

    // Check if target position is lava
    if (toBlockType === 111) {
      // Lava object type
      return false;
    }

    // Check if there's solid ground below (within 2 blocks)
    const groundPos = { x: to.x, y: to.y - 1, z: to.z };
    const groundBlockType = await this.getCachedBlockType(groundPos);
    if (ObjectTypes[groundBlockType]?.passThrough) {
      // Check one more block down
      const lowerGroundPos = { x: to.x, y: to.y - 2, z: to.z };
      const lowerGroundBlockType = await this.getCachedBlockType(
        lowerGroundPos
      );
      if (ObjectTypes[lowerGroundBlockType]?.passThrough) {
        return false; // No solid ground within 2 blocks
      }
    }

    return true;
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
    console.log(
      `🔍 Cache miss for block (${pos.x}, ${pos.y}, ${pos.z}) in chunk (${blockChunk.x}, ${blockChunk.y}, ${blockChunk.z})`
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

    // Move unit constants (from the game's Constants.sol)
    const MAX_MOVE_UNITS_PER_BLOCK = 1e18; // in decimalsthis number
    const MOVING_UNIT_COST = 5e17 / 15; // Walking cost: ~3.33e16
    const SWIMMING_UNIT_COST = (5e17 * 10) / 135; // Swimming cost: ~3.7e16

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

    // Execute each batch sequentially
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(
        `🚶 Executing batch ${batchIndex + 1}/${batches.length} (${
          batch.length
        } steps)`
      );

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

      console.log(`✅ Batch ${batchIndex + 1}/${batches.length} completed`);

      // Add a small delay between batches to ensure they're processed in order
      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log("✅ Path execution complete");
  }

  // Calculate move cost for a step based on terrain
  private async getMoveCost(step: Vec3): Promise<number> {
    const MOVING_UNIT_COST = 5e17 / 15; // Walking cost: ~3.33e16
    const SWIMMING_UNIT_COST = (5e17 * 10) / 135; // Swimming cost: ~3.7e16

    try {
      // Check the block below the step to determine terrain
      const belowPos = { x: step.x, y: step.y - 1, z: step.z };
      const belowBlockType = await this.getCachedBlockType(belowPos);

      // Check if it's water (swimming is more expensive)
      if (ObjectTypes[belowBlockType]?.passThrough) {
        // Additional check to see if it's actually water/fluid
        // For now, we'll assume any passThrough block below means swimming
        // You might want to add more specific water detection here
        return SWIMMING_UNIT_COST;
      }

      return MOVING_UNIT_COST;
    } catch (error) {
      // If we can't determine the terrain, assume walking
      console.log(
        `⚠️ Could not determine move cost for step (${step.x}, ${step.y}, ${step.z}), assuming walking`
      );
      return MOVING_UNIT_COST;
    }
  }
}
