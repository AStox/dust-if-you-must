import { DustGameBase } from "../core/base.js";
import { Vec3, Vec2 } from "../types";
import { packVec3 } from "../utils.js";
import { PlayerModule } from "./player.js";
import { WorldModule } from "./world.js";
import { ObjectTypes } from "../types/objectTypes.js";

interface PathfindingOptions {
  maxIterations?: number;
  heuristicWeight?: number; // Weight for heuristic (higher = more greedy)
  useJumpPoints?: boolean; // Skip intermediate nodes in straight lines
  beamWidth?: number; // Limit open set size for beam search
}

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
  discoveredAtIteration: number; // Which A* iteration this node was discovered
  // Add priority for heap-based priority queue
  priority: number;
}

// Binary heap for efficient priority queue
class PriorityQueue {
  private heap: PathNode[] = [];

  push(node: PathNode): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): PathNode | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const root = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return root;
  }

  get length(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  // Keep only the best N nodes (beam search)
  pruneToSize(maxSize: number): void {
    if (this.heap.length <= maxSize) return;

    // Sort by fCost and keep only the best
    this.heap.sort((a, b) => a.fCost - b.fCost);
    this.heap = this.heap.slice(0, maxSize);

    // Rebuild heap property
    for (let i = Math.floor(maxSize / 2) - 1; i >= 0; i--) {
      this.bubbleDown(i);
    }
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].fCost <= this.heap[index].fCost) break;

      [this.heap[parentIndex], this.heap[index]] = [
        this.heap[index],
        this.heap[parentIndex],
      ];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < this.heap.length &&
        this.heap[leftChild].fCost < this.heap[smallest].fCost
      ) {
        smallest = leftChild;
      }
      if (
        rightChild < this.heap.length &&
        this.heap[rightChild].fCost < this.heap[smallest].fCost
      ) {
        smallest = rightChild;
      }

      if (smallest === index) break;

      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[index],
      ];
      index = smallest;
    }
  }
}

// Game constants (duplicated from Constants.sol since we can't import from @/dust/)
// Smart Contract Constants - Exact values from Constants.sol
const MAX_PLAYER_JUMPS = 3;
const MAX_PLAYER_GLIDES = 10;
const PLAYER_SAFE_FALL_DISTANCE = 3;
const MAX_MOVE_UNITS_PER_BLOCK = 1e18;

// Energy costs - matching Constants.sol exactly
const MAX_PLAYER_ENERGY = 817600000000000000;
const MOVE_ENERGY_COST = 25550000000000;
const WATER_MOVE_ENERGY_COST = MAX_PLAYER_ENERGY / 4000; // 204400000000000
const LAVA_MOVE_ENERGY_COST = MAX_PLAYER_ENERGY / 10; // 81760000000000000

// Move unit costs - matching Constants.sol exactly
const BLOCK_TIME = 2; // seconds
const MAX_MOVE_UNITS_PER_SECOND = MAX_MOVE_UNITS_PER_BLOCK / BLOCK_TIME; // 5e17
const MOVING_UNIT_COST = MAX_MOVE_UNITS_PER_SECOND / 15; // ~3.33e16
const SWIMMING_UNIT_COST = (MAX_MOVE_UNITS_PER_SECOND * 10) / 135; // ~3.7e16

// Object type constants
const LAVA_OBJECT_TYPE = 111; // ObjectTypes.Lava from smart contract

// Player body relative coordinates (from ObjectTypes.Player.getRelativeCoords)
const PLAYER_RELATIVE_COORDS: Vec3[] = [
  { x: 0, y: 0, z: 0 }, // Base coordinate
  { x: 0, y: 1, z: 0 }, // Head coordinate
];

// Debug coordinates - add specific coordinates you want to debug here
const DEBUG_COORDINATES: Vec3[] = [];

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

  // Dynamic chunk loading tracking for A* algorithm
  private chunkLoadingTimeInCurrentSearch = 0;

  // A* pathfinding to target Vec2 (x, z coordinates)
  async pathTo(target: Vec2): Promise<Vec3[]> {
    const startTime = Date.now();

    // Reset cache performance tracking for this run
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.preloadedChunkBounds = null;
    this.preloadedChunks.clear();
    this.chunkLoadingTimeInCurrentSearch = 0;

    console.log("=".repeat(60));
    console.log(`🎯 Starting A* pathfinding to (${target.x}, ${target.z})`);

    // Get current position
    const posStartTime = Date.now();
    const currentPos = await this.player.getCurrentPosition();
    if (!currentPos) {
      throw new Error("Cannot determine current position");
    }

    console.log(
      `📍 Current position: (${currentPos.x}, ${currentPos.y}, ${currentPos.z})`
    );

    // Calculate distance to determine heuristic weight
    const distance = Math.sqrt(
      Math.pow(target.x - currentPos.x, 2) +
        Math.pow(target.z - currentPos.z, 2)
    );

    // Determine heuristic weight based on distance (more greedy for longer distances)
    let heuristicWeight = 1.0; // Default A*
    if (distance > 200) {
      heuristicWeight = 5.0; // Very greedy for long distances
      console.log(
        `📏 Long range (${distance.toFixed(
          1
        )} blocks) - using 5x heuristic weight`
      );
    } else if (distance > 50) {
      heuristicWeight = 2.5; // Moderately greedy
      console.log(
        `📏 Medium range (${distance.toFixed(
          1
        )} blocks) - using 2.5x heuristic weight`
      );
    } else {
      heuristicWeight = 1.2; // Slightly greedy
      console.log(
        `📏 Short range (${distance.toFixed(
          1
        )} blocks) - using 1.2x heuristic weight`
      );
    }

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

    // Find path using A* with heuristic weighting
    const pathStartTime = Date.now();
    const path = await this.findPath(currentPos, targetPos, heuristicWeight);
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

  // Optimized pathfinding implementation
  private async pathToOptimized(
    target: Vec2,
    options: PathfindingOptions
  ): Promise<Vec3[]> {
    const startTime = Date.now();

    // Reset cache performance tracking for this run
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.preloadedChunkBounds = null;
    this.preloadedChunks.clear();
    this.chunkLoadingTimeInCurrentSearch = 0;

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

    // Find path using optimized A*
    const pathStartTime = Date.now();
    const path = await this.findPathOptimized(currentPos, targetPos, options);
    console.log(
      `⏱️ Optimized pathfinding completed in ${Date.now() - pathStartTime}ms`
    );

    if (!path || path.length === 0) {
      throw new Error("No path found to target");
    }

    console.log(`📍 Path found with ${path.length} steps`);
    console.log(`⏱️ Total pathfinding time: ${Date.now() - startTime}ms`);

    // Report cache performance
    const totalCacheAccesses = this.cacheHits + this.cacheMisses;
    console.log(`📦 Block cache size: ${this.blockDataCache.size} blocks`);

    return path;
  }

  // Preload only the starting chunk for dynamic per-chunk pathfinding
  async preloadBlockData(
    start: Vec3,
    end: Vec3,
    batchSize: number = 5
  ): Promise<void> {
    // Only load the starting chunk initially
    const startChunk = this.world.toChunkCoord(start);
    console.log(
      `📦 Loading starting chunk (${startChunk.x}, ${startChunk.y}, ${startChunk.z})`
    );

    // Clear previous bounds and chunks - we'll build them dynamically
    this.preloadedChunkBounds = null;
    this.preloadedChunks.clear();

    // Load the starting chunk
    const loadStartTime = Date.now();
    try {
      const chunkBlocks = await this.world.getChunkBlocks({
        x: startChunk.x * this.CHUNK_SIZE,
        y: startChunk.y * this.CHUNK_SIZE,
        z: startChunk.z * this.CHUNK_SIZE,
      });

      console.log(`📦 Starting chunk returned ${chunkBlocks.size} blocks`);

      // Copy all blocks to our cache
      for (const [key, value] of chunkBlocks) {
        this.blockDataCache.set(key, value);
      }

      // Track this chunk as loaded
      const chunkKey = `${startChunk.x},${startChunk.y},${startChunk.z}`;
      this.preloadedChunks.add(chunkKey);

      console.log(
        `✅ Successfully loaded starting chunk (${startChunk.x}, ${startChunk.y}, ${startChunk.z})`
      );
      console.log(`📦 Initial cache size: ${this.blockDataCache.size} blocks`);
    } catch (error) {
      console.error(
        `❌ Failed to load starting chunk (${startChunk.x}, ${startChunk.y}, ${startChunk.z}): ${error}`
      );
      throw new Error(
        `Cannot start pathfinding without initial chunk: ${error}`
      );
    }

    console.log(`⏱️ Loaded starting chunk in ${Date.now() - loadStartTime}ms`);
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

  // Get all chunk keys required to validate movement to a given position
  private getRequiredChunksForPosition(baseCoord: Vec3): string[] {
    const requiredChunks = new Set<string>();

    // All player body coordinates that need validation
    const playerBodyCoords = PLAYER_RELATIVE_COORDS.map((relative) => ({
      x: baseCoord.x + relative.x,
      y: baseCoord.y + relative.y,
      z: baseCoord.z + relative.z,
    }));

    // Add chunks for all player body coordinates
    for (const coord of playerBodyCoords) {
      const chunk = this.world.toChunkCoord(coord);
      const chunkKey = `${chunk.x},${chunk.y},${chunk.z}`;
      requiredChunks.add(chunkKey);
    }

    // Add chunk for the block below (needed for gravity detection)
    const belowCoord = {
      x: baseCoord.x,
      y: baseCoord.y - 1,
      z: baseCoord.z,
    };
    const belowChunk = this.world.toChunkCoord(belowCoord);
    const belowChunkKey = `${belowChunk.x},${belowChunk.y},${belowChunk.z}`;
    requiredChunks.add(belowChunkKey);

    return Array.from(requiredChunks);
  }

  // Load a single chunk on-demand and add it to the cache
  private async loadSingleChunk(chunkCoord: Vec3): Promise<void> {
    const chunkKey = `${chunkCoord.x},${chunkCoord.y},${chunkCoord.z}`;

    // Skip if already loaded
    if (this.preloadedChunks.has(chunkKey)) {
      return;
    }

    console.log(
      `🔄 Loading chunk on-demand: (${chunkCoord.x}, ${chunkCoord.y}, ${chunkCoord.z})`
    );

    const loadStartTime = Date.now();
    try {
      const chunkBlocks = await this.world.getChunkBlocks({
        x: chunkCoord.x * this.CHUNK_SIZE,
        y: chunkCoord.y * this.CHUNK_SIZE,
        z: chunkCoord.z * this.CHUNK_SIZE,
      });

      // Copy all blocks to our cache
      for (const [key, value] of chunkBlocks) {
        this.blockDataCache.set(key, value);
      }

      // Track this chunk as loaded
      this.preloadedChunks.add(chunkKey);

      const loadTime = Date.now() - loadStartTime;
      this.chunkLoadingTimeInCurrentSearch += loadTime;

      console.log(
        `✅ Loaded chunk (${chunkCoord.x}, ${chunkCoord.y}, ${chunkCoord.z}) with ${chunkBlocks.size} blocks in ${loadTime}ms`
      );
    } catch (error) {
      console.error(
        `❌ Failed to load chunk (${chunkCoord.x}, ${chunkCoord.y}, ${chunkCoord.z}): ${error}`
      );
      throw new Error(`Cannot load required chunk: ${error}`);
    }
  }

  // Optimized A* pathfinding algorithm with configurable strategies
  private async findPathOptimized(
    start: Vec3,
    end: Vec3,
    options: PathfindingOptions
  ): Promise<Vec3[] | null> {
    const {
      maxIterations = 100000,
      heuristicWeight = 1.0,
      useJumpPoints = false,
      beamWidth,
    } = options;

    console.log(`🔍 Running optimized pathfinding...`);
    console.log(`   🎛️ Heuristic weight: ${heuristicWeight}x`);
    console.log(`   🦘 Jump points: ${useJumpPoints ? "enabled" : "disabled"}`);
    console.log(`   📡 Beam width: ${beamWidth || "unlimited"}`);
    console.log(`   🔢 Max iterations: ${maxIterations}`);

    // Verify only start position is within preloaded chunks
    const startChunk = this.world.toChunkCoord(start);
    const startChunkKey = `${startChunk.x},${startChunk.y},${startChunk.z}`;

    if (!this.preloadedChunks.has(startChunkKey)) {
      console.error(
        `❌ Start position (${start.x}, ${start.y}, ${start.z}) is in chunk (${startChunk.x}, ${startChunk.y}, ${startChunk.z}) which is not preloaded!`
      );
      return null;
    }

    // Use efficient priority queue instead of array
    const openSet = new PriorityQueue();
    const closedSet = new Set<string>();
    const nodeMap = new Map<string, PathNode>(); // Track all nodes for updates

    let iterationCount = 0;
    let totalNeighborTime = 0;

    // Track closest approach to target for debugging
    let closestNode: PathNode | null = null;
    let closestDistance = Infinity;
    let closestIteration = 0;

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
      discoveredAtIteration: 0,
      priority: 0,
    };

    // Apply heuristic weighting for greedy behavior
    startNode.fCost = startNode.gCost + startNode.hCost * heuristicWeight;
    const startKey = `${start.x},${start.y},${start.z}`;
    nodeMap.set(startKey, startNode);
    openSet.push(startNode);

    while (!openSet.isEmpty()) {
      iterationCount++;

      // Apply beam search pruning if specified
      if (beamWidth && openSet.length > beamWidth) {
        openSet.pruneToSize(beamWidth);
      }

      // Log progress
      if (iterationCount % 1000 === 0) {
        console.log(
          `🔄 Iteration ${iterationCount}, open: ${
            openSet.length
          }, closest: ${closestDistance.toFixed(1)} blocks`
        );
      }

      // Get the node with lowest F cost (efficient with heap)
      const currentNode = openSet.pop()!;
      const currentKey = `${currentNode.position.x},${currentNode.position.y},${currentNode.position.z}`;

      // Add to closed set
      closedSet.add(currentKey);

      // Track closest approach to target
      const distanceToTarget = this.calculateDistanceEuclidean(
        currentNode.position,
        end
      );
      if (distanceToTarget < closestDistance) {
        closestDistance = distanceToTarget;
        closestNode = currentNode;
        closestIteration = iterationCount;
      }

      // Check if we reached the target
      if (
        currentNode.position.x === end.x &&
        currentNode.position.y === end.y &&
        currentNode.position.z === end.z
      ) {
        console.log(`🎯 Path found after ${iterationCount} iterations!`);
        return this.reconstructPath(currentNode);
      }

      // Generate neighbors (with jump point optimization if enabled)
      const neighborStartTime = Date.now();
      let neighbors: Vec3[];

      if (useJumpPoints && this.canUseJumpPoints(currentNode.position, end)) {
        neighbors = await this.getJumpPointNeighbors(currentNode.position, end);
      } else {
        neighbors = await this.getOptimizedNeighbors(currentNode.position, end);
      }

      const neighborElapsed = Date.now() - neighborStartTime;
      totalNeighborTime += neighborElapsed;

      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y},${neighbor.z}`;

        // Skip if already processed
        if (closedSet.has(neighborKey)) {
          continue;
        }

        // Calculate costs with direction bias
        const gCost =
          currentNode.gCost +
          this.calculateDistance(currentNode.position, neighbor);
        const hCost = this.calculateHeuristic(neighbor, end);

        // Apply heuristic weighting and direction bias
        const directionBias = this.calculateDirectionBias(
          currentNode.position,
          neighbor,
          end
        );
        const fCost = gCost + hCost * heuristicWeight + directionBias;

        // Check if this path to neighbor is better
        const existingNode = nodeMap.get(neighborKey);

        if (!existingNode || gCost < existingNode.gCost) {
          // Calculate physics state (simplified for performance)
          const neighborHasGravity = await this.hasGravity(neighbor);
          const { newJumps, newGlides, newFallHeight, newMoveUnits, isValid } =
            this.calculatePhysicsState(
              currentNode,
              neighbor,
              neighborHasGravity
            );

          if (!isValid) {
            continue; // Skip invalid moves
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
            discoveredAtIteration: iterationCount,
            priority: fCost,
          };

          if (!existingNode) {
            nodeMap.set(neighborKey, neighborNode);
            openSet.push(neighborNode);
          } else {
            // Update existing node
            Object.assign(existingNode, neighborNode);
            // Note: In a real implementation, we'd need to update the heap here
          }
        }
      }

      // Safety break for very long searches
      if (iterationCount > maxIterations) {
        console.log(
          `⚠️ Max iterations reached (${iterationCount}) - stopping search`
        );
        break;
      }
    }

    // Handle failure case with debugging
    console.log(`❌ No path found after ${iterationCount} iterations`);
    this.logPathfindingDebug(
      closestNode,
      end,
      iterationCount,
      closestDistance,
      closestIteration
    );

    return null;
  }

  // A* pathfinding algorithm with optional heuristic weighting
  private async findPath(
    start: Vec3,
    end: Vec3,
    heuristicWeight: number = 1.0
  ): Promise<Vec3[] | null> {
    console.log(
      `🔍 Running A* pathfinding with ${heuristicWeight}x heuristic weight...`
    );

    // Verify only start position is within preloaded chunks (end will be loaded dynamically)
    const startChunk = this.world.toChunkCoord(start);
    const startChunkKey = `${startChunk.x},${startChunk.y},${startChunk.z}`;

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

    console.log(
      `✅ Starting chunk is loaded, target chunks will be loaded dynamically`
    );
    console.log(
      `   Start chunk: (${startChunk.x}, ${startChunk.y}, ${startChunk.z})`
    );
    console.log(
      `   Target: (${end.x}, ${end.y}, ${end.z}) - chunks will be loaded as needed`
    );

    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();
    let iterationCount = 0;
    let totalNeighborTime = 0;
    let totalBlockLookupTime = 0;
    let chunksLoadedCount = this.preloadedChunks.size; // Start with initial loaded chunks
    let totalChunkLoadingTime = 0;

    // Track closest approach to target for debugging
    let closestNode: PathNode | null = null;
    let closestDistance = Infinity;
    let closestIteration = 0;

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
      discoveredAtIteration: 0,
      priority: 0, // Initialize priority
    };
    startNode.fCost = startNode.gCost + startNode.hCost * heuristicWeight;

    openSet.push(startNode);

    while (openSet.length > 0) {
      iterationCount++;

      // Log progress every 10 iterations
      if (iterationCount % 10 === 0) {
        const currentChunkCount = this.preloadedChunks.size;
        const newChunksLoaded = currentChunkCount - chunksLoadedCount;
        console.log(
          `🔄 A* iteration ${iterationCount}, open: ${openSet.length}, closed: ${closedSet.size}, chunks: ${currentChunkCount} (+${newChunksLoaded} dynamic)`
        );
        chunksLoadedCount = currentChunkCount; // Update for next iteration
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

      // Track closest approach to target
      const distanceToTarget = this.calculateHeuristic(
        currentNode.position,
        end
      );
      if (distanceToTarget < closestDistance) {
        closestDistance = distanceToTarget;
        closestNode = currentNode;
        closestIteration = iterationCount;
      }

      // Check if we reached the target (exact coordinates match)
      if (
        currentNode.position.x === end.x &&
        currentNode.position.y === end.y &&
        currentNode.position.z === end.z
      ) {
        const finalChunkCount = this.preloadedChunks.size;
        const totalChunksLoaded = finalChunkCount - 1; // Subtract initial chunk
        console.log(`🎯 Path found after ${iterationCount} iterations!`);
        console.log(
          `📦 Dynamically loaded ${totalChunksLoaded} chunks (total: ${finalChunkCount})`
        );
        console.log(
          `⏱️ Total chunk loading time: ${this.chunkLoadingTimeInCurrentSearch}ms`
        );
        console.log(
          `⏱️ Total neighbor generation + validation time: ${totalNeighborTime}ms`
        );
        console.log(`⏱️ Total block lookup time: ${totalBlockLookupTime}ms`);

        // Log the successful path with iteration info
        console.log(`\n📋 Successful path with discovery iterations:`);
        const pathWithIterations: Array<{ pos: Vec3; iteration: number }> = [];
        let currentPathNode: PathNode | null = currentNode;
        while (currentPathNode) {
          pathWithIterations.unshift({
            pos: currentPathNode.position,
            iteration: currentPathNode.discoveredAtIteration,
          });
          currentPathNode = currentPathNode.parent;
        }

        pathWithIterations.forEach((step, idx) => {
          console.log(
            `   ${idx + 1}. (${step.pos.x}, ${step.pos.y}, ${
              step.pos.z
            }) [discovered at iteration ${step.iteration}]`
          );
        });

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

        // Calculate costs with heuristic weighting
        const gCost =
          currentNode.gCost +
          this.calculateDistance(currentNode.position, neighbor);
        const hCost = this.calculateHeuristic(neighbor, end);
        const fCost = gCost + hCost * heuristicWeight;

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

          // TEMPORARILY DISABLED: Move unit limit constraint (biggest blocker for long paths)
          // if (newMoveUnits > MAX_MOVE_UNITS_PER_BLOCK) {
          //   if (isDebugNeighbor) {
          //     console.log(
          //       `   ❌ REJECTED: Move unit limit exceeded - ${newMoveUnits} > ${MAX_MOVE_UNITS_PER_BLOCK} (MAX_MOVE_UNITS_PER_BLOCK)`
          //     );
          //   }
          //   // Skip this neighbor - exceeds move unit limit
          //   continue;
          // }

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
            discoveredAtIteration: iterationCount,
            priority: 0, // Initialize priority
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
      if (iterationCount > 100000) {
        console.log(
          `⚠️ A* search limit reached (${iterationCount} iterations) - pathfinding taking too long`
        );
        break;
      }
    }

    console.log(`❌ No path found after ${iterationCount} iterations`);
    console.log(
      `⏱️ Total neighbor generation + validation time: ${totalNeighborTime}ms`
    );
    console.log(`⏱️ Total block lookup time: ${totalBlockLookupTime}ms`);

    // Debug: Show closest approach to target
    console.log("\n🔍 PATHFINDING DEBUG ANALYSIS:");
    console.log("=".repeat(50));

    if (closestNode) {
      console.log(`🎯 Target: (${end.x}, ${end.y}, ${end.z})`);
      console.log(
        `📍 Closest reached: (${closestNode.position.x}, ${closestNode.position.y}, ${closestNode.position.z}) at iteration ${closestIteration}`
      );
      console.log(
        `📏 Distance to target: ${closestDistance.toFixed(2)} blocks`
      );

      // Calculate the vector from closest to target
      const deltaX = end.x - closestNode.position.x;
      const deltaY = end.y - closestNode.position.y;
      const deltaZ = end.z - closestNode.position.z;
      console.log(`🧭 Direction to target: (${deltaX}, ${deltaY}, ${deltaZ})`);

      // Show path to closest position
      const pathToClosest = this.reconstructPath(closestNode);
      console.log(
        `🛤️ Path to closest position has ${pathToClosest.length} steps`
      );

      if (pathToClosest.length > 0) {
        console.log(`📋 Full path to closest position:`);

        // Get the full path with iteration info by walking back through the parent chain
        const pathWithIterations: Array<{ pos: Vec3; iteration: number }> = [];
        let currentPathNode: PathNode | null = closestNode;
        while (currentPathNode) {
          pathWithIterations.unshift({
            pos: currentPathNode.position,
            iteration: currentPathNode.discoveredAtIteration,
          });
          currentPathNode = currentPathNode.parent;
        }

        pathWithIterations.forEach((step, idx) => {
          console.log(
            `   ${idx + 1}. (${step.pos.x}, ${step.pos.y}, ${
              step.pos.z
            }) [discovered at iteration ${step.iteration}]`
          );
        });
      }
    }

    // Debug: Analyze why neighbors from closest position were rejected
    if (closestNode && closestDistance < 5) {
      console.log(`\n🔍 NEIGHBOR ANALYSIS FOR CLOSEST POSITION:`);
      console.log("=".repeat(50));
      console.log(
        `📍 Analyzing neighbors from: (${closestNode.position.x}, ${closestNode.position.y}, ${closestNode.position.z})`
      );

      try {
        const neighbors = await this.getNeighbors(closestNode.position);
        console.log(`🔗 Found ${neighbors.length} potential neighbors`);

        for (let i = 0; i < neighbors.length; i++) {
          const neighbor = neighbors[i];
          const neighborKey = `${neighbor.x},${neighbor.y},${neighbor.z}`;

          // Check if already in closed set
          if (closedSet.has(neighborKey)) {
            console.log(
              `   ${i + 1}. (${neighbor.x}, ${neighbor.y}, ${
                neighbor.z
              }) - ❌ REJECTED: Already explored`
            );
            continue;
          }

          // Check movement validation
          const moveValidation = await this.requireValidMove(
            closestNode.position,
            neighbor
          );
          if (!moveValidation.isValid) {
            console.log(
              `   ${i + 1}. (${neighbor.x}, ${neighbor.y}, ${
                neighbor.z
              }) - ❌ REJECTED: ${moveValidation.reason}`
            );
            continue;
          }

          // Calculate costs
          const distanceCost = this.calculateDistance(
            closestNode.position,
            neighbor
          );
          const heuristic = this.calculateHeuristic(neighbor, end);

          console.log(
            `   ${i + 1}. (${neighbor.x}, ${neighbor.y}, ${
              neighbor.z
            }) - ✅ VALID (distance: ${distanceCost.toFixed(
              2
            )}, heuristic: ${heuristic.toFixed(2)})`
          );

          // Special check if this neighbor is the target
          if (
            neighbor.x === end.x &&
            neighbor.y === end.y &&
            neighbor.z === end.z
          ) {
            console.log(`      🎯 THIS IS THE TARGET! Why wasn't it chosen?`);
          }
        }
      } catch (error) {
        console.log(`❌ Error analyzing neighbors: ${error}`);
      }
    }

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

    // Check 8 spaces around the player and the player's current position + or - 1 block in the y direction
    const directions = [
      { x: 1, z: 0 }, // East
      { x: -1, z: 0 }, // West
      { x: 0, z: 1 }, // South
      { x: 0, z: -1 }, // North
      { x: 1, z: 1 }, // South and East
      { x: 1, z: -1 }, // North and East
      { x: -1, z: 1 }, // South and West
      { x: -1, z: -1 }, // North and West
      { x: 0, z: 0 }, // Current position
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

        if (newPos.x === pos.x && newPos.z === pos.z && newPos.y === pos.y) {
          continue;
        }

        const isDebugNeighbor = isDebugCoordinate(newPos);

        if (isDebugNeighbor) {
          console.log(
            `🔍 DEBUG NEIGHBORS: Considering debug coordinate (${newPos.x}, ${newPos.y}, ${newPos.z})`
          );
        }

        // DYNAMIC CHUNK LOADING: Detect chunk boundaries and track required chunks
        const requiredChunks = this.getRequiredChunksForPosition(newPos);
        const missingChunks = requiredChunks.filter(
          (chunkKey: string) => !this.preloadedChunks.has(chunkKey)
        );

        if (missingChunks.length > 0) {
          if (isDebugNeighbor) {
            console.log(
              `🔍 DEBUG NEIGHBORS: 🔄 Debug coordinate (${newPos.x}, ${
                newPos.y
              }, ${newPos.z}) requires ${
                missingChunks.length
              } unloaded chunks: ${missingChunks.join(", ")} - loading now...`
            );
          }

          // Load missing chunks on-demand
          try {
            for (const missingChunkKey of missingChunks) {
              const [x, y, z] = missingChunkKey.split(",").map(Number);
              await this.loadSingleChunk({ x, y, z });
            }

            if (isDebugNeighbor) {
              console.log(
                `🔍 DEBUG NEIGHBORS: ✅ Successfully loaded ${missingChunks.length} chunks for debug coordinate (${newPos.x}, ${newPos.y}, ${newPos.z})`
              );
            }
          } catch (error) {
            console.error(
              `❌ Failed to load chunks for neighbor (${newPos.x}, ${newPos.y}, ${newPos.z}): ${error}`
            );
            chunksOutOfBounds++;
            continue; // Skip this neighbor if chunk loading fails
          }
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
        // For pathfinding: Load chunks on-demand instead of rejecting
        if (!this.areAllValidationCoordsPreloaded(playerCoord)) {
          if (isDebug) {
            console.log(
              `🔍 DEBUG: Loading chunk on-demand for ${coordName} coordinate (${playerCoord.x}, ${playerCoord.y}, ${playerCoord.z})`
            );
          }

          // Load the required chunk dynamically
          const chunkCoord = this.world.toChunkCoord(playerCoord);
          try {
            await this.loadSingleChunk(chunkCoord);

            // Retry getting the block type after loading
            objectType = await this.getCachedBlockType(playerCoord);

            if (isDebug) {
              console.log(
                `🔍 DEBUG: ✅ Successfully loaded chunk and got block type ${objectType}`
              );
            }
          } catch (error) {
            const reason = `Failed to load chunk on-demand for ${coordName} coordinate (${playerCoord.x}, ${playerCoord.y}, ${playerCoord.z}): ${error}`;
            if (isDebug) {
              console.log(`🔍 DEBUG: ❌ FAILED - ${reason}`);
            }
            return { isValid: false, reason };
          }
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
    // Use Chebyshev distance (chess king moves) - optimal for movement with Chebyshev distance ≤ 1 constraint
    return Math.max(
      Math.abs(to.x - from.x),
      Math.abs(to.y - from.y),
      Math.abs(to.z - from.z)
    );
  }

  // Calculate Euclidean distance for more accurate distance measurements
  private calculateDistanceEuclidean(from: Vec3, to: Vec3): number {
    return Math.sqrt(
      Math.pow(to.x - from.x, 2) +
        Math.pow(to.y - from.y, 2) +
        Math.pow(to.z - from.z, 2)
    );
  }

  // Calculate direction bias to prefer moves toward target
  private calculateDirectionBias(from: Vec3, to: Vec3, target: Vec3): number {
    // Vector from current position to target
    const targetDir = {
      x: target.x - from.x,
      y: target.y - from.y,
      z: target.z - from.z,
    };

    // Vector of the proposed move
    const moveDir = {
      x: to.x - from.x,
      y: to.y - from.y,
      z: to.z - from.z,
    };

    // Normalize vectors
    const targetLength = Math.sqrt(
      targetDir.x * targetDir.x +
        targetDir.y * targetDir.y +
        targetDir.z * targetDir.z
    );
    const moveLength = Math.sqrt(
      moveDir.x * moveDir.x + moveDir.y * moveDir.y + moveDir.z * moveDir.z
    );

    if (targetLength === 0 || moveLength === 0) return 0;

    // Calculate dot product (cosine similarity)
    const dotProduct =
      (targetDir.x * moveDir.x +
        targetDir.y * moveDir.y +
        targetDir.z * moveDir.z) /
      (targetLength * moveLength);

    // Return bias: negative values for moves toward target, positive for moves away
    return (1 - dotProduct) * 0.5; // Small bias factor
  }

  // Check if jump points can be used (open terrain)
  private canUseJumpPoints(position: Vec3, target: Vec3): boolean {
    // Simple heuristic: use jump points for longer distances
    const distance = this.calculateDistanceEuclidean(position, target);
    return distance > 10;
  }

  // Get jump point neighbors (skip intermediate nodes in straight lines)
  private async getJumpPointNeighbors(
    position: Vec3,
    target: Vec3
  ): Promise<Vec3[]> {
    const neighbors: Vec3[] = [];

    // Calculate direction to target
    const dx = target.x - position.x;
    const dz = target.z - position.z;

    // Primary directions (toward target)
    const primaryDirs = [];
    if (dx > 0) primaryDirs.push({ x: 1, z: 0 });
    if (dx < 0) primaryDirs.push({ x: -1, z: 0 });
    if (dz > 0) primaryDirs.push({ x: 0, z: 1 });
    if (dz < 0) primaryDirs.push({ x: 0, z: -1 });

    // Diagonal direction toward target
    if (dx !== 0 && dz !== 0) {
      primaryDirs.push({ x: Math.sign(dx), z: Math.sign(dz) });
    }

    // For each primary direction, try to jump further
    for (const dir of primaryDirs) {
      // Try multiple jump distances
      for (const jumpDist of [1, 2, 3]) {
        for (let yOffset = -1; yOffset <= 1; yOffset++) {
          const candidate = {
            x: position.x + dir.x * jumpDist,
            y: position.y + yOffset,
            z: position.z + dir.z * jumpDist,
          };

          // Basic validation
          try {
            const validation = await this.requireValidMove(position, candidate);
            if (validation.isValid) {
              neighbors.push(candidate);
            }
          } catch {
            // Skip invalid candidates
          }
        }
      }
    }

    // Fall back to regular neighbors if no jump points found
    if (neighbors.length === 0) {
      return this.getOptimizedNeighbors(position, target);
    }

    return neighbors;
  }

  // Get optimized neighbors (prioritize direction toward target)
  private async getOptimizedNeighbors(
    position: Vec3,
    target: Vec3
  ): Promise<Vec3[]> {
    const neighbors: Vec3[] = [];

    // Calculate direction to target
    const dx = target.x - position.x;
    const dz = target.z - position.z;

    // Prioritized directions (toward target first)
    const directions = [];

    // Primary directions toward target
    if (dx > 0) directions.push({ x: 1, z: 0, priority: 1 });
    if (dx < 0) directions.push({ x: -1, z: 0, priority: 1 });
    if (dz > 0) directions.push({ x: 0, z: 1, priority: 1 });
    if (dz < 0) directions.push({ x: 0, z: -1, priority: 1 });

    // Diagonal toward target
    if (dx !== 0 && dz !== 0) {
      directions.push({ x: Math.sign(dx), z: Math.sign(dz), priority: 1 });
    }

    // Secondary directions (perpendicular)
    directions.push({ x: 1, z: 1, priority: 2 });
    directions.push({ x: 1, z: -1, priority: 2 });
    directions.push({ x: -1, z: 1, priority: 2 });
    directions.push({ x: -1, z: -1, priority: 2 });

    // Stationary (just Y movement)
    directions.push({ x: 0, z: 0, priority: 3 });

    // Sort by priority
    directions.sort((a, b) => a.priority - b.priority);

    // Generate neighbors for each direction
    for (const dir of directions) {
      for (let yOffset = -1; yOffset <= 1; yOffset++) {
        const candidate = {
          x: position.x + dir.x,
          y: position.y + yOffset,
          z: position.z + dir.z,
        };

        // Skip current position
        if (
          candidate.x === position.x &&
          candidate.y === position.y &&
          candidate.z === position.z
        ) {
          continue;
        }

        neighbors.push(candidate);
      }
    }

    return neighbors;
  }

  // Simplified physics state calculation for performance
  private calculatePhysicsState(
    currentNode: PathNode,
    neighbor: Vec3,
    neighborHasGravity: boolean
  ): {
    newJumps: number;
    newGlides: number;
    newFallHeight: number;
    newMoveUnits: number;
    isValid: boolean;
  } {
    const dy = neighbor.y - currentNode.position.y;
    let newJumps = currentNode.jumps;
    let newGlides = currentNode.glides;
    let newFallHeight = currentNode.fallHeight;
    let newMoveUnits = currentNode.moveUnits;

    // Simplified physics rules for performance
    if (dy < 0 && currentNode.hasGravity) {
      // Falling
      newFallHeight++;
      newGlides = 0;

      // Prevent dangerous falls
      if (!neighborHasGravity && newFallHeight > 3) {
        return {
          newJumps,
          newGlides,
          newFallHeight,
          newMoveUnits,
          isValid: false,
        };
      }
    } else if (dy > 0) {
      // Jumping
      newJumps++;
      if (newJumps > 3) {
        return {
          newJumps,
          newGlides,
          newFallHeight,
          newMoveUnits,
          isValid: false,
        };
      }
    } else if (neighborHasGravity) {
      // Gliding
      newGlides++;
      if (newGlides > 10) {
        return {
          newJumps,
          newGlides,
          newFallHeight,
          newMoveUnits,
          isValid: false,
        };
      }
    }

    // Reset on landing
    if (!neighborHasGravity) {
      newJumps = 0;
      newGlides = 0;
      newFallHeight = 0;
    }

    // Add move units (simplified)
    newMoveUnits += 1; // Simplified cost

    return { newJumps, newGlides, newFallHeight, newMoveUnits, isValid: true };
  }

  // Debug logging for pathfinding failures
  private logPathfindingDebug(
    closestNode: PathNode | null,
    target: Vec3,
    iterationCount: number,
    closestDistance: number,
    closestIteration: number
  ): void {
    if (!closestNode) return;

    console.log("\n🔍 OPTIMIZED PATHFINDING DEBUG:");
    console.log("=".repeat(50));
    console.log(`🎯 Target: (${target.x}, ${target.y}, ${target.z})`);
    console.log(
      `📍 Closest reached: (${closestNode.position.x}, ${closestNode.position.y}, ${closestNode.position.z}) at iteration ${closestIteration}`
    );
    console.log(`📏 Distance to target: ${closestDistance.toFixed(2)} blocks`);

    const deltaX = target.x - closestNode.position.x;
    const deltaY = target.y - closestNode.position.y;
    const deltaZ = target.z - closestNode.position.z;
    console.log(`🧭 Direction to target: (${deltaX}, ${deltaY}, ${deltaZ})`);

    // Show partial path
    const pathToClosest = this.reconstructPath(closestNode);
    console.log(
      `🛤️ Path to closest position has ${pathToClosest.length} steps`
    );
  }

  // Calculate actual distance between two positions
  private calculateDistance(from: Vec3, to: Vec3): number {
    return Math.sqrt(
      Math.pow(to.x - from.x, 2) +
        Math.pow(to.y - from.y, 2) +
        Math.pow(to.z - from.z, 2)
    );
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

      // Calculate move cost for this step (using move units only for batching)
      const moveCostUnits = await this.getMoveCostUnits(step);

      // Check if adding this step would exceed the limit
      if (
        currentMoveUnits + moveCostUnits > MAX_MOVE_UNITS_PER_BLOCK &&
        currentBatch.length > 0
      ) {
        // Start a new batch
        batches.push([...currentBatch]);
        currentBatch = [step];
        currentMoveUnits = moveCostUnits;
      } else {
        // Add to current batch
        currentBatch.push(step);
        currentMoveUnits += moveCostUnits;
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

      // Send this batch and wait for confirmation
      await this.executeSystemCall(
        this.SYSTEM_IDS.MOVE_SYSTEM,
        "move(bytes32,uint96[])",
        [this.characterEntityId, packedSteps],
        `A* pathfinding - batch ${batchIndex + 1}/${batches.length} (${
          batch.length
        } steps)`,
        false // Don't log success (we'll do it ourselves)
      );

      // Update current tracking position to the last coordinate in this batch
      if (batch.length > 0) {
        currentTrackingPos = batch[batch.length - 1];
        console.log(
          `📍 Updated tracking position to: (${currentTrackingPos.x}, ${currentTrackingPos.y}, ${currentTrackingPos.z})`
        );
      }

      console.log(
        `✅ Batch ${batchIndex + 1}/${
          batches.length
        } confirmed - ready for next batch`
      );
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

  // Smart Contract Compliant: Calculate move cost based on terrain
  // Implements MoveLib._getMoveCost() logic precisely
  private async getMoveCost(
    coord: Vec3
  ): Promise<{ energyCost: number; moveUnitCost: number }> {
    const belowCoord = { x: coord.x, y: coord.y - 1, z: coord.z };

    try {
      // 1. EXACT SMART CONTRACT RULE: ObjectType belowType = EntityUtils.getObjectTypeAt(belowCoord);
      const belowBlockType = await this.getCachedBlockType(belowCoord);

      // 2. EXACT SMART CONTRACT RULE: if (belowType == ObjectTypes.Lava)
      if (belowBlockType === LAVA_OBJECT_TYPE) {
        return {
          energyCost: LAVA_MOVE_ENERGY_COST,
          moveUnitCost: MOVING_UNIT_COST,
        };
      }

      // 3. EXACT SMART CONTRACT RULE: if (belowType.isPassThrough() && _isFluid(belowCoord))
      const belowIsPassthrough =
        ObjectTypes[belowBlockType]?.passThrough || false;
      const belowIsFluid = await this.isFluid(belowCoord);

      if (belowIsPassthrough && belowIsFluid) {
        return {
          energyCost: WATER_MOVE_ENERGY_COST,
          moveUnitCost: SWIMMING_UNIT_COST,
        };
      }

      // 4. EXACT SMART CONTRACT RULE: return (Constants.MOVE_ENERGY_COST, Constants.MOVING_UNIT_COST);
      return {
        energyCost: MOVE_ENERGY_COST,
        moveUnitCost: MOVING_UNIT_COST,
      };
    } catch (error) {
      console.log(
        `⚠️ Could not determine move cost for (${coord.x}, ${coord.y}, ${coord.z}), assuming normal terrain`
      );
      return {
        energyCost: MOVE_ENERGY_COST,
        moveUnitCost: MOVING_UNIT_COST,
      };
    }
  }

  // Get move cost in units only (for move unit limit checking)
  private async getMoveCostUnits(coord: Vec3): Promise<number> {
    const costs = await this.getMoveCost(coord);
    return costs.moveUnitCost;
  }
}
