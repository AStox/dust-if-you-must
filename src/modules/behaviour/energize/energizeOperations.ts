import { getOperationalConfig } from "../../../config/loader.js";
import { DustBot } from "../../../index.js";
import { getObjectIdByName, ObjectTypes } from "../../../types/objectTypes.js";
import { Vec3 } from "../../../types/base.js";
import { packVec3 } from "../../../utils.js";
import { InventoryManagementConfig } from "../shared/inventoryManager.js";

// Constants
export const TREE_BLOCK_TYPES = [
  "OakLog",
  "BirchLog",
  "SpruceLog",
  "OakLeaf",
  "BirchLeaf",
  "SpruceLeaf",
] as const;

export const SAPLING_TYPES = [
  "OakSapling",
  "BirchSapling",
  "SpruceSapling",
] as const;

export const AXE_TYPES = [
  "WoodenAxe",
  "StoneAxe",
  "IronAxe",
  "DiamondAxe",
] as const;

export const EXCLUDED_ITEM_TYPES = [
  "OakLog",
  "BirchLog",
  "SpruceLog",
  "OakLeaf",
  "BirchLeaf",
  "SpruceLeaf",
  "Battery",
] as const;

// Utility Functions
export function calculateDistance(pos1: Vec3, pos2: Vec3): number {
  return Math.sqrt(
    Math.pow(pos1.x - pos2.x, 2) +
      Math.pow(pos1.y - pos2.y, 2) +
      Math.pow(pos1.z - pos2.z, 2)
  );
}

export function isInTreeFarm(position: Vec3): boolean {
  const config = getOperationalConfig();
  try {
    return (
      position.x >=
        Math.min(
          config.areas.energize!.treeFarmBounds.corner1.x,
          config.areas.energize!.treeFarmBounds.corner2.x
        ) &&
      position.x <=
        Math.max(
          config.areas.energize!.treeFarmBounds.corner1.x,
          config.areas.energize!.treeFarmBounds.corner2.x
        ) &&
      position.z >=
        Math.min(
          config.areas.energize!.treeFarmBounds.corner1.z,
          config.areas.energize!.treeFarmBounds.corner2.z
        ) &&
      position.z <=
        Math.max(
          config.areas.energize!.treeFarmBounds.corner1.z,
          config.areas.energize!.treeFarmBounds.corner2.z
        )
    );
  } catch (error) {
    return false;
  }
}

export function hasAxe(inventory: any[]): boolean {
  return inventory.some((item) =>
    AXE_TYPES.some((axeType) => item.type === getObjectIdByName(axeType))
  );
}

export function getTreeBlockTypeIds(): number[] {
  return TREE_BLOCK_TYPES.map((type) => getObjectIdByName(type)).filter(
    (id) => id !== undefined
  ) as number[];
}

export function getAxeTypeIds(): number[] {
  return AXE_TYPES.map((type) => getObjectIdByName(type)).filter(
    (id) => id !== undefined
  ) as number[];
}

export function getExcludedItemTypeIds(): number[] {
  return EXCLUDED_ITEM_TYPES.map((type) => getObjectIdByName(type)).filter(
    (id) => id !== undefined
  ) as number[];
}

/**
 * Get energize inventory management configuration
 */
export function getEnergizeInventoryConfig(): InventoryManagementConfig {
  const axeTypeIds = getAxeTypeIds();
  const oakSaplingId = getObjectIdByName("OakSapling")!;
  const excludedTypeIds = getExcludedItemTypeIds();

  return {
    allowedItems: [...axeTypeIds, oakSaplingId, ...excludedTypeIds, 0], // 0 for empty slots
    requiredItems: [
      { type: oakSaplingId, min: 1 }, // Need at least 1 oak sapling
    ],
    targetItems: [
      { type: oakSaplingId, target: 64 }, // Want full stack of saplings
      // Only keep 1 axe (best one available)
      ...axeTypeIds.map(axeId => ({ type: axeId, target: 0, max: 1 }))
    ],
  };
}

export function getBestAxeSlot(inventory: any[]): number | null {
  const axePriority = [
    getObjectIdByName("DiamondAxe"),
    getObjectIdByName("IronAxe"),
    getObjectIdByName("StoneAxe"),
    getObjectIdByName("WoodenAxe"),
  ].filter((id) => id !== undefined);

  for (const axeId of axePriority) {
    const slot = inventory.findIndex(
      (item) => item.type === axeId && item.amount > 0
    );
    if (slot !== -1) return slot;
  }
  return null;
}

export function getSaplingTypeIds(): number[] {
  return SAPLING_TYPES.map((type) => getObjectIdByName(type)).filter(
    (id) => id !== undefined
  ) as number[];
}

async function findAdjacentPassthroughPosition(
  bot: DustBot,
  targetBlock: Vec3
): Promise<Vec3 | null> {
  // Check surrounding positions on the horizontal plane
  const adjacentOffsets = [
    { x: 1, z: 0 }, // East
    { x: -1, z: 0 }, // West
    { x: 0, z: 1 }, // South
    { x: 0, z: -1 }, // North
    { x: 1, z: 1 }, // Southeast
    { x: -1, z: 1 }, // Southwest
    { x: 1, z: -1 }, // Northeast
    { x: -1, z: -1 }, // Northwest
  ];

  for (const offset of adjacentOffsets) {
    const adjacentPos = {
      x: targetBlock.x + offset.x,
      y: targetBlock.y,
      z: targetBlock.z + offset.z,
    };

    try {
      const blockType = await bot.world.getBlockType(adjacentPos);
      // Check if block is passthrough (air/empty space typically has blockType 0)
      if (blockType === 0 || ObjectTypes[blockType]?.passThrough) {
        return adjacentPos;
      }
    } catch (error) {
      // Block doesn't exist or can't be read, skip
    }
  }

  // If no adjacent passthrough found, return the target block itself as fallback
  return targetBlock;
}

async function scanTreeFarmBlocks(
  bot: DustBot,
  bounds: { corner1: Vec3; corner2: Vec3 },
  heightOffset: number,
  earlyExit: boolean = false
): Promise<Vec3[]> {
  const corner1 = bounds.corner1;
  const corner2 = bounds.corner2;
  console.log(
    `🔍 Scanning tree farm blocks from (${corner1.x},${corner1.z}) to (${corner2.x},${corner2.z})`
  );

  // Get ground level at corners and find the lowest
  console.log("🔍 Getting ground levels...");
  const start = Date.now();
  const groundLevel1 = await bot.world.getGroundLevel(
    corner1.x,
    corner1.z,
    corner1.y
  );
  const groundLevel2 = await bot.world.getGroundLevel(
    corner2.x,
    corner2.z,
    corner2.y
  );
  const minGroundLevel = Math.min(groundLevel1, groundLevel2);
  const end = Date.now();
  console.log(`🔍 getGroundLevels took ${end - start}ms`);

  const minX = Math.min(corner1.x, corner2.x);
  const maxX = Math.max(corner1.x, corner2.x);
  const minZ = Math.min(corner1.z, corner2.z);
  const maxZ = Math.max(corner1.z, corner2.z);
  const minY = minGroundLevel;
  const maxY = minGroundLevel + heightOffset;

  const treeBlockTypeIds = getTreeBlockTypeIds();
  const saplingTypeIds = getSaplingTypeIds();
  const foundBlocks: Vec3[] = [];

  console.log("🔍 Building positions array...");
  const start3 = Date.now();
  // Build positions array
  const positions: Vec3[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        positions.push({ x, y, z });
      }
    }
  }
  const end3 = Date.now();
  console.log(`🔍 buildPositions took ${end3 - start3}ms`);

  console.log("🔍 Scanning in chunks of 100...");
  const start4 = Date.now();

  if (earlyExit) {
    // Sequential for early exit
    for (let i = 0; i < positions.length; i += 100) {
      const chunk = positions.slice(i, i + 100);
      const chunkBlockTypes = await Promise.all(
        chunk.map((pos) => bot.world.getBlockType(pos).catch(() => null))
      );

      for (let j = 0; j < chunk.length; j++) {
        const blockType = chunkBlockTypes[j];
        if (blockType && treeBlockTypeIds.includes(blockType)) {
          foundBlocks.push(chunk[j]);
          return foundBlocks;
        } else if (blockType && saplingTypeIds.includes(blockType)) {
          try {
            const isReadyToGrow = await bot.farming.isPlantReadyToGrow(
              chunk[j]
            );
            if (isReadyToGrow) {
              foundBlocks.push(chunk[j]);
              return foundBlocks;
            }
          } catch (error) {
            // Skip saplings we can't check
          }
        }
      }
    }
  } else {
    // All chunks in parallel
    const allChunks = [];
    for (let i = 0; i < positions.length; i += 100) {
      allChunks.push(positions.slice(i, i + 100));
    }

    const chunkResults = await Promise.all(
      allChunks.map(async (chunk) => {
        const chunkBlockTypes = await Promise.all(
          chunk.map((pos) => bot.world.getBlockType(pos).catch(() => null))
        );

        const chunkFoundBlocks = [];
        for (let j = 0; j < chunk.length; j++) {
          const blockType = chunkBlockTypes[j];
          if (blockType && treeBlockTypeIds.includes(blockType)) {
            chunkFoundBlocks.push(chunk[j]);
          } else if (blockType && saplingTypeIds.includes(blockType)) {
            try {
              const isReadyToGrow = await bot.farming.isPlantReadyToGrow(
                chunk[j]
              );
              if (isReadyToGrow) {
                chunkFoundBlocks.push(chunk[j]);
              }
            } catch (error) {
              // Skip saplings we can't check
            }
          }
        }
        return chunkFoundBlocks;
      })
    );

    foundBlocks.push(...chunkResults.flat());
  }

  const end4 = Date.now();
  console.log(`🔍 scanInChunks took ${end4 - start4}ms`);
  return foundBlocks;
}

export async function mineTreeFarmChunk(
  bot: DustBot,
  chunkBounds: { corner1: Vec3; corner2: Vec3 }
): Promise<boolean> {
  console.log("🪓 Starting chunk-based tree farm mining...");
  console.log(
    `📍 Scanning chunk (${chunkBounds.corner1.x},${chunkBounds.corner1.z}) to (${chunkBounds.corner2.x},${chunkBounds.corner2.z}) for logs, leaves, and fully grown saplings...`
  );

  let remainingBlocks = await scanTreeFarmBlocks(bot, chunkBounds, 8, false);
  console.log(
    `📍 Found ${remainingBlocks.length} tree blocks and fully grown saplings in chunk`
  );

  if (remainingBlocks.length === 0) {
    console.log("✅ No tree blocks or fully grown saplings in chunk");
    return false;
  }

  // Get player position
  const playerPos = await bot.player.getCurrentPosition();

  // Find closest block
  let closestBlock = remainingBlocks[0];
  let closestDistance = calculateDistance(playerPos, closestBlock);

  for (const block of remainingBlocks) {
    const distance = calculateDistance(playerPos, block);
    if (distance < closestDistance) {
      closestBlock = block;
      closestDistance = distance;
    }
  }

  // Find adjacent passthrough position to move to
  const targetPosition = await findAdjacentPassthroughPosition(
    bot,
    closestBlock
  );
  if (!targetPosition) {
    console.log("❌ Could not find adjacent passthrough position");
    return false;
  }

  console.log(
    `🚶 Moving to adjacent position at (${targetPosition.x}, ${bot.state.position.y}, ${targetPosition.z}) near block (${closestBlock.x}, ${closestBlock.y}, ${closestBlock.z})`
  );
  await bot.movement.pathTo({
    x: targetPosition.x,
    y: bot.state.position.y,
    z: targetPosition.z,
  });

  // Mine all blocks within 10 block radius
  const MAX_INTERACTION_DISTANCE = 10;
  const currentPos = await bot.player.getCurrentPosition();
  const blocksToMine = remainingBlocks.filter(
    (block) => calculateDistance(currentPos, block) <= MAX_INTERACTION_DISTANCE
  );

  console.log(`⛏️ Mining ${blocksToMine.length} blocks within reach`);

  // Get player's current chunk and commit surrounding chunks
  const playerChunk = bot.world.toChunkCoord(currentPos);

  console.log(
    `📦 Committing chunks around player at chunk (${playerChunk.x}, ${playerChunk.y}, ${playerChunk.z})...`
  );

  const commitPromises = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunkToCommit = {
          x: playerChunk.x + dx,
          y: playerChunk.y + dy,
          z: playerChunk.z + dz,
        };

        const commitPromise = bot.world
          .commitChunk(chunkToCommit)
          .then(() => {
            console.log(
              `✅ Committed chunk (${chunkToCommit.x}, ${chunkToCommit.y}, ${chunkToCommit.z})`
            );
          })
          .catch((error) => {
            console.log(
              `⚠️ Failed to commit chunk (${chunkToCommit.x}, ${chunkToCommit.y}, ${chunkToCommit.z}): ${error}`
            );
          });

        commitPromises.push(commitPromise);
      }
    }
  }

  await Promise.all(commitPromises);
  console.log(`✅ Chunk commits completed`);

  for (let i = 0; i < blocksToMine.length; i++) {
    const block = blocksToMine[i];
    console.log(`⛏️ Mining block at (${block.x}, ${block.y}, ${block.z})`);

    const axeSlot = getBestAxeSlot(bot.state.inventory);
    if (axeSlot === null) {
      throw new Error("No axe found in inventory for mining!");
    }

    const chunk = bot.world.toChunkCoord(block);
    console.log(`mining block in chunk ${chunk.x}, ${chunk.y}, ${chunk.z}`);
    await bot.building.mineNonBlocking(block, axeSlot);
    remainingBlocks = remainingBlocks.filter(
      (b) => !(b.x === block.x && b.y === block.y && b.z === block.z)
    );
  }

  return true; // Return true indicating there were blocks to mine
}

export async function mineTreeFarmVolume(bot: DustBot): Promise<void> {
  console.log("🪓 Starting volume-based tree farm mining...");
  console.log(
    "📍 Scanning tree farm volume for logs, leaves, and fully grown saplings..."
  );

  const config = getOperationalConfig();
  let remainingBlocks = await scanTreeFarmBlocks(
    bot,
    config.areas.energize!.treeFarmBounds,
    8,
    false
  );
  console.log(
    `📍 Found ${remainingBlocks.length} tree blocks and fully grown saplings to mine`
  );

  if (remainingBlocks.length === 0) {
    console.log("✅ No tree blocks or fully grown saplings left to mine");
    return;
  }

  // Get player position
  const playerPos = await bot.player.getCurrentPosition();

  // Find closest block
  let closestBlock = remainingBlocks[0];
  let closestDistance = calculateDistance(playerPos, closestBlock);

  for (const block of remainingBlocks) {
    const distance = calculateDistance(playerPos, block);
    if (distance < closestDistance) {
      closestBlock = block;
      closestDistance = distance;
    }
  }

  // Find adjacent passthrough position to move to
  const targetPosition = await findAdjacentPassthroughPosition(
    bot,
    closestBlock
  );
  if (!targetPosition) {
    console.log("❌ Could not find adjacent passthrough position");
    return;
  }

  console.log(
    `🚶 Moving to adjacent position at (${targetPosition.x}, ${bot.state.position.y}, ${targetPosition.z}) near block (${closestBlock.x}, ${closestBlock.y}, ${closestBlock.z})`
  );
  await bot.movement.pathTo({
    x: targetPosition.x,
    y: bot.state.position.y,
    z: targetPosition.z,
  });

  // Mine all blocks within 10 block radius
  const MAX_INTERACTION_DISTANCE = 10;
  const currentPos = await bot.player.getCurrentPosition();
  const blocksToMine = remainingBlocks.filter(
    (block) => calculateDistance(currentPos, block) <= MAX_INTERACTION_DISTANCE
  );

  console.log(`⛏️ Mining ${blocksToMine.length} blocks within reach`);

  // Get player's current chunk and commit surrounding chunks (-1 to +1 in all directions)
  const playerChunk = bot.world.toChunkCoord(currentPos);

  console.log(
    `📦 Committing chunks around player at chunk (${playerChunk.x}, ${playerChunk.y}, ${playerChunk.z})...`
  );

  const commitPromises = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunkToCommit = {
          x: playerChunk.x + dx,
          y: playerChunk.y + dy,
          z: playerChunk.z + dz,
        };

        const commitPromise = bot.world
          .commitChunk(chunkToCommit)
          .then(() => {
            console.log(
              `✅ Committed chunk (${chunkToCommit.x}, ${chunkToCommit.y}, ${chunkToCommit.z})`
            );
          })
          .catch((error) => {
            console.log(
              `⚠️ Failed to commit chunk (${chunkToCommit.x}, ${chunkToCommit.y}, ${chunkToCommit.z}): ${error}`
            );
          });

        commitPromises.push(commitPromise);
      }
    }
  }

  await Promise.all(commitPromises);
  console.log(`✅ Chunk commits completed`);

  for (let i = 0; i < blocksToMine.length; i++) {
    const block = blocksToMine[i];
    console.log(`⛏️ Mining block at (${block.x}, ${block.y}, ${block.z})`);

    const axeSlot = getBestAxeSlot(bot.state.inventory);
    if (axeSlot === null) {
      throw new Error("No axe found in inventory for mining!");
    }

    const chunk = bot.world.toChunkCoord(block);
    console.log(`mining block in chunk ${chunk.x}, ${chunk.y}, ${chunk.z}`);
    await bot.building.mineNonBlocking(block, axeSlot);
    remainingBlocks = remainingBlocks.filter(
      (b) => !(b.x === block.x && b.y === block.y && b.z === block.z)
    );
  }
}

export async function walkToTreeFarm(bot: DustBot): Promise<void> {
  console.log("🚶 Walking to tree farm...");
  const config = getOperationalConfig();
  await bot.movement.pathTo({
    x: config.areas.energize!.treeFarmBounds.corner1.x,
    y: config.areas.energize!.treeFarmBounds.corner1.y,
    z: config.areas.energize!.treeFarmBounds.corner1.z,
  });
}

export async function hasAvailableTreeBlocks(bot: DustBot): Promise<boolean> {
  const config = getOperationalConfig();
  if (!config.areas.energize?.treeFarmBounds) {
    throw new Error("Tree farm bounds not configured");
  }
  console.log("🔍 Checking for tree blocks...");
  const start = Date.now();
  const foundBlocks = await scanTreeFarmBlocks(
    bot,
    config.areas.energize!.treeFarmBounds,
    10,
    true
  );
  const end = Date.now();
  console.log(`🔍 scanTreeFarmBlocks took ${end - start}ms`);
  return foundBlocks.length > 0;
}

export async function setupEnergizeInventory(bot: DustBot): Promise<void> {
  console.log("🔄 === ENERGIZE INVENTORY SETUP ===");

  // Get current inventory
  const currentInventory = bot.state.inventory;

  // Count current axes and oak saplings
  let currentAxes = 0;
  let currentOakSaplings = 0;
  let otherItems = 0;

  const axeTypes = [
    getObjectIdByName("WoodenAxe"),
    getObjectIdByName("StoneAxe"),
    getObjectIdByName("IronAxe"),
    getObjectIdByName("DiamondAxe"),
  ];
  const oakSaplingId = getObjectIdByName("OakSapling");

  // Items to exclude from "other items" count
  const excludedTypes = [
    getObjectIdByName("OakLog"),
    getObjectIdByName("BirchLog"),
    getObjectIdByName("SpruceLog"),
    getObjectIdByName("OakLeaves"),
    getObjectIdByName("BirchLeaves"),
    getObjectIdByName("SpruceLeaves"),
    getObjectIdByName("Battery"),
  ].filter((id) => id !== undefined);

  for (const item of currentInventory) {
    if (axeTypes.includes(item.type)) {
      currentAxes += item.amount;
    } else if (item.type === oakSaplingId) {
      currentOakSaplings += item.amount;
    } else if (!excludedTypes.includes(item.type)) {
      otherItems += item.amount;
    }
  }

  // Target: exactly 1 axe, at least 1 oak sapling (up to 99), 0 other items
  const needsInventorySetup =
    currentAxes !== 1 || currentOakSaplings < 1 || otherItems > 0;

  console.log("needsInventorySetup", needsInventorySetup);
  console.log("currentAxes", currentAxes);
  console.log("currentOakSaplings", currentOakSaplings);
  console.log("otherItems", otherItems);

  if (!needsInventorySetup) {
    console.log("✅ Inventory already perfect for energize mode!");
    return;
  }

  // Get energize areas and entity IDs
  const config = getOperationalConfig();

  console.log("🔄 Need to reorganize inventory");
  const target = {
    x: config.areas.farming.farmCenter.x,
    y: config.areas.farming.farmCenter.y,
    z: config.areas.farming.farmCenter.z,
  };
  if (bot.state.position !== target) {
    console.log("  Moving to chest...");
    await bot.movement.pathTo(target);
  }

  // Step 1: Store all current items in chest (bulk transfer)

  if (currentInventory.length > 0) {
    console.log("📤 Storing all current items in chest...");
    // Build bulk transfer array: [fromSlot, toSlot, amount]
    const transfers: [number, number, number][] = [];

    // Get available slots in chest
    const chestInventory = bot.state.chestInventory;
    let chestSlotIndex = 0;

    for (
      let playerSlot = 0;
      playerSlot < currentInventory.length;
      playerSlot++
    ) {
      const item = currentInventory[playerSlot];
      if (item.amount > 0) {
        console.log(
          `  Preparing to store ${item.amount}x ${getItemName(item.type)}`
        );

        // Find available chest slot
        while (
          chestSlotIndex < 40 &&
          chestInventory[chestSlotIndex] &&
          chestInventory[chestSlotIndex].amount > 0
        ) {
          chestSlotIndex++;
        }

        if (chestSlotIndex < 40) {
          transfers.push([playerSlot, chestSlotIndex, item.amount]);
          chestSlotIndex++;
        }
      }
    }

    if (transfers.length > 0) {
      console.log(
        `📦 Executing bulk transfer of ${transfers.length} item stacks to chest...`
      );
      await bot.inventory.transfer(
        bot.player.characterEntityId,
        config.entities.chests?.rightChest,
        transfers
      );
      console.log("✅ Bulk transfer to chest completed");
    }
  }

  // Step 2: Retrieve exactly 1 axe (prefer higher tier)
  if (currentAxes < 1) {
    console.log("\n📥 Retrieving exactly 1 axe...");
    const axePriority = [
      { name: "DiamondAxe", id: getObjectIdByName("DiamondAxe") },
      { name: "IronAxe", id: getObjectIdByName("IronAxe") },
      { name: "StoneAxe", id: getObjectIdByName("StoneAxe") },
      { name: "WoodenAxe", id: getObjectIdByName("WoodenAxe") },
    ];

    let axeRetrieved = false;
    for (const axe of axePriority) {
      try {
        console.log(`  Trying to get 1x ${axe.name}...`);
        await bot.inventory.transferExactAmount(
          config.entities.chests?.rightChest,
          bot.player.characterEntityId,
          axe.id!,
          1
        );
        console.log(`  ✅ Retrieved 1x ${axe.name}`);
        axeRetrieved = true;
        break;
      } catch (error) {
        console.log(`  ❌ No ${axe.name} available in chest`);
      }
    }
    if (!axeRetrieved) {
      throw new Error(
        "No axes available in chest! Cannot proceed with energize."
      );
    }
  }

  if (currentOakSaplings < 1) {
    // Step 3: Retrieve oak saplings (at least 1, up to 99)
    console.log("📥 Retrieving oak saplings (at least 1, up to 99)...");
    console.log("oakSaplingId", oakSaplingId);
    try {
      await bot.inventory.transferUpToAmount(
        config.entities.chests?.rightChest,
        bot.player.characterEntityId,
        oakSaplingId!,
        99
      );
      console.log("  ✅ Retrieved Oak Saplings");
    } catch (error) {
      throw new Error(
        "No Oak Saplings available in chest! Oak Saplings are required for energize mode"
      );
    }
  }

  console.log("🎯 Energize inventory setup completed!");
}

export async function getPlantablePositions(bot: DustBot): Promise<Vec3[]> {
  const config = getOperationalConfig();

  // Get tree farm bounds
  const corner1 = config.areas.energize!.treeFarmBounds.corner1;
  const corner2 = config.areas.energize!.treeFarmBounds.corner2;
  const minX = Math.min(corner1.x, corner2.x);
  const maxX = Math.max(corner1.x, corner2.x);
  const minZ = Math.min(corner1.z, corner2.z);
  const maxZ = Math.max(corner1.z, corner2.z);

  // Calculate grid starting position (move inward by 2 from corner)
  const startX = minX + 2;
  const startZ = minZ + 2;
  const endX = maxX - 2;
  const endZ = maxZ - 2;

  // Generate grid coordinates (spacing of 5 = 4 empty blocks + 1 sapling)
  const gridPositions: { x: number; z: number }[] = [];
  for (let x = startX; x <= endX; x += 5) {
    for (let z = startZ; z <= endZ; z += 5) {
      gridPositions.push({ x, z });
    }
  }

  if (gridPositions.length === 0) {
    return [];
  }

  // Get ground levels for all grid positions asynchronously
  const groundLevelPromises = gridPositions.map((pos) =>
    bot.world.getGroundLevel(pos.x, pos.z, corner1.y)
  );
  const groundLevels = await Promise.all(groundLevelPromises);

  // Build ground positions and get block types asynchronously
  const groundPositions: Vec3[] = [];
  for (let i = 0; i < gridPositions.length; i++) {
    groundPositions.push({
      x: gridPositions[i].x,
      y: groundLevels[i] - 1,
      z: gridPositions[i].z,
    });
  }

  const blockTypePromises = groundPositions.map((pos) =>
    bot.world.getBlockType(pos).catch(() => null)
  );
  const blockTypes = await Promise.all(blockTypePromises);
  const blockTypeAbovePromises = groundPositions.map((pos) =>
    bot.world
      .getBlockType({ x: pos.x, y: pos.y + 1, z: pos.z })
      .catch(() => null)
  );
  const blockTypesAbove = await Promise.all(blockTypeAbovePromises);

  // Filter for dirt, grass, or moss ground blocks
  const dirtId = getObjectIdByName("Dirt");
  const grassId = getObjectIdByName("Grass");
  const mossId = getObjectIdByName("Moss");
  const validGroundTypes = [dirtId, grassId, mossId].filter(
    (id) => id !== undefined
  );

  const plantablePositions = groundPositions
    .filter(
      (pos, i) =>
        blockTypes[i] !== null && validGroundTypes.includes(blockTypes[i]!)
    )
    .filter((pos, i) => blockTypesAbove[i] === 0 || blockTypesAbove[i] === 1)
    .map((pos) => ({ x: pos.x, y: pos.y + 1, z: pos.z }));

  return plantablePositions;
}

export async function hasPlantablePositions(bot: DustBot): Promise<boolean> {
  const positions = await getPlantablePositions(bot);
  return positions.length > 0;
}

export async function plantSaplings(bot: DustBot): Promise<void> {
  const config = getOperationalConfig();
  const oakSaplingId = getObjectIdByName("OakSapling");

  if (!oakSaplingId) {
    throw new Error("Oak sapling type not found");
  }

  console.log(`🌱 Creating sapling grid in tree farm...`);

  // Get plantable positions using the extracted logic
  const plantablePositions = await getPlantablePositions(bot);

  console.log(`📍 Found ${plantablePositions.length} plantable positions`);

  if (plantablePositions.length === 0) {
    console.log(`✅ No plantable positions found`);
    return;
  }

  // Plant saplings at each cluster of positions
  let remainingPositions = [...plantablePositions];
  const MAX_REACH = 6;

  while (remainingPositions.length > 0) {
    // Check inventory
    const saplingSlot = bot.state.inventory.findIndex(
      (item) => item.type === oakSaplingId && item.amount > 0
    );
    if (saplingSlot === -1) {
      console.log("❌ No more oak saplings in inventory");
      break;
    }

    // Find closest position
    const playerPos = await bot.player.getCurrentPosition();
    let closestPos = remainingPositions[0];
    let closestDistance = calculateDistance(playerPos, closestPos);

    for (const pos of remainingPositions) {
      const distance = calculateDistance(playerPos, pos);
      if (distance < closestDistance) {
        closestPos = pos;
        closestDistance = distance;
      }
    }

    // Move to planting area
    const targetPos = await findAdjacentPassthroughPosition(bot, closestPos);
    if (!targetPos) {
      console.log("❌ Could not find position to plant from");
      break;
    }

    console.log(
      `🚶 Moving to plant area near (${closestPos.x}, ${closestPos.y}, ${closestPos.z})`
    );
    await bot.movement.pathTo({
      x: targetPos.x,
      y: bot.state.position.y,
      z: targetPos.z,
    });

    // Plant at all positions within reach
    const currentPos = await bot.player.getCurrentPosition();
    const positionsInReach = remainingPositions.filter(
      (pos) => calculateDistance(currentPos, pos) <= MAX_REACH
    );

    console.log(
      `🌱 Planting ${positionsInReach.length} saplings within reach...`
    );
    for (const pos of positionsInReach) {
      const saplingPos = { x: pos.x, y: pos.y - 1, z: pos.z };
      try {
        await bot.farming.plantSeedType(saplingPos, oakSaplingId);
        console.log(
          `  ✅ Planted sapling at (${saplingPos.x}, ${saplingPos.y}, ${
            saplingPos.z
          }), ${packVec3(saplingPos)}`
        );
      } catch (error) {
        console.log(
          `  ❌ Failed to plant at (${saplingPos.x}, ${saplingPos.y}, ${saplingPos.z}): ${error}`
        );
      }
    }

    // Remove planted positions from remaining list
    remainingPositions = remainingPositions.filter(
      (pos) =>
        !positionsInReach.some(
          (planted) =>
            planted.x === pos.x && planted.y === pos.y && planted.z === pos.z
        )
    );
  }

  console.log("✅ Sapling planting completed!");
}

export function hasExcessTreeMaterials(inventory: any[]): boolean {
  const logTypes = ["OakLog", "BirchLog", "SpruceLog"];
  const leafTypes = ["OakLeaf", "BirchLeaf", "SpruceLeaf"];

  const logCount = inventory
    .filter((item) =>
      logTypes.some((logType) => item.type === getObjectIdByName(logType))
    )
    .reduce((total, item) => total + item.amount, 0);

  const leafCount = inventory
    .filter((item) =>
      leafTypes.some((leafType) => item.type === getObjectIdByName(leafType))
    )
    .reduce((total, item) => total + item.amount, 0);

  return logCount > 5 || leafCount > 90;
}

export async function craftBatteriesAtPowerstone(bot: DustBot): Promise<void> {
  console.log("🔋 Crafting batteries at powerstone...");

  const config = getOperationalConfig();
  const powerstoneLocation = config.areas.energize!.powerStoneLocation;

  // Move to powerstone location
  console.log(
    `🚶 Moving to powerstone at (${powerstoneLocation.x}, ${
      powerstoneLocation.y + 1
    }, ${powerstoneLocation.z})`
  );
  await bot.movement.pathTo({
    x: powerstoneLocation.x,
    y: powerstoneLocation.y + 1,
    z: powerstoneLocation.z,
  });

  // Get current inventory to see what we can craft with
  const inventory = bot.state.inventory;
  const logTypes = ["OakLog", "BirchLog", "SpruceLog"];
  const leafTypes = ["OakLeaf", "BirchLeaf", "SpruceLeaf"];

  const logs = inventory.filter(
    (item) =>
      logTypes.some((logType) => item.type === getObjectIdByName(logType)) &&
      item.amount > 0
  );
  const leaves = inventory.filter(
    (item) =>
      leafTypes.some((leafType) => item.type === getObjectIdByName(leafType)) &&
      item.amount > 0
  );

  console.log(
    `📦 Found ${logs.length} log stacks and ${leaves.length} leaf stacks to process`
  );

  // Craft batteries from logs first (5 logs → 1 battery)
  for (const logStack of logs) {
    if (logStack.amount >= 5) {
      const batches = Math.floor(logStack.amount / 5);
      const totalToCraft = Math.min(batches * 5, logStack.amount);
      console.log(
        `🔋 Crafting batteries from ${totalToCraft}x ${getItemName(
          logStack.type
        )} (${batches} batteries)`
      );

      try {
        // Find the slot index for this item
        const slotIndex = inventory.findIndex(
          (item) => item.type === logStack.type
        );
        if (slotIndex !== -1) {
          // Use the crafting system to craft batteries
          // For now, we'll use a simple approach since the exact recipe ID calculation is complex
          await bot.crafting.craftWithStation(
            powerstoneLocation,
            1, // Placeholder recipe ID - will need to be calculated properly
            batches,
            [slotIndex],
            0
          );
        }
      } catch (error) {
        console.log(`❌ Failed to craft batteries from logs: ${error}`);
      }
    }
  }

  // Craft batteries from leaves (90 leaves → 1 battery)
  for (const leafStack of leaves) {
    if (leafStack.amount >= 90) {
      const batches = Math.floor(leafStack.amount / 90);
      const totalToCraft = Math.min(batches * 90, leafStack.amount);
      console.log(
        `🔋 Crafting batteries from ${totalToCraft}x ${getItemName(
          leafStack.type
        )} (${batches} batteries)`
      );

      try {
        // Find the slot index for this item
        const slotIndex = inventory.findIndex(
          (item) => item.type === leafStack.type
        );
        if (slotIndex !== -1) {
          await bot.crafting.craftWithStation(
            powerstoneLocation,
            2, // Placeholder recipe ID for leaf→battery
            batches,
            [slotIndex],
            0
          );
        }
      } catch (error) {
        console.log(`❌ Failed to craft batteries from leaves: ${error}`);
      }
    }
  }

  console.log("✅ Battery crafting completed!");
}

// Helper function to get item name from ID
function getItemName(itemId: number): string {
  const objectType = ObjectTypes[itemId];
  return objectType ? objectType.name : `Unknown_${itemId}`;
}

export async function hasAvailableTreeBlocksInChunk(
  bot: DustBot,
  chunkBounds: { corner1: Vec3; corner2: Vec3 }
): Promise<boolean> {
  console.log("🔍 Checking for tree blocks in chunk...");
  const start = Date.now();
  const foundBlocks = await scanTreeFarmBlocks(bot, chunkBounds, 10, true);
  const end = Date.now();
  console.log(`🔍 scanTreeFarmBlocks took ${end - start}ms`);
  return foundBlocks.length > 0;
}

export async function hasPlantablePositionsInChunk(
  bot: DustBot,
  chunkBounds: { corner1: Vec3; corner2: Vec3 }
): Promise<boolean> {
  const positions = await getPlantablePositionsInChunk(bot, chunkBounds);
  return positions.length > 0;
}

export async function getPlantablePositionsInChunk(
  bot: DustBot,
  chunkBounds: { corner1: Vec3; corner2: Vec3 }
): Promise<Vec3[]> {
  const config = getOperationalConfig();

  // Get chunk bounds
  const minX = chunkBounds.corner1.x;
  const maxX = chunkBounds.corner2.x;
  const minZ = chunkBounds.corner1.z;
  const maxZ = chunkBounds.corner2.z;

  // Calculate grid starting position (move inward by 2 from corner)
  const chunkSize = config.areas.energize?.chunkSize || 25;
  const startX = minX + 2;
  const startZ = minZ + 2;
  const endX = maxX - 2;
  const endZ = maxZ - 2;

  // Generate grid coordinates (spacing of 5 = 4 empty blocks + 1 sapling)
  const gridPositions: { x: number; z: number }[] = [];
  for (let x = startX; x <= endX; x += 5) {
    for (let z = startZ; z <= endZ; z += 5) {
      gridPositions.push({ x, z });
    }
  }

  if (gridPositions.length === 0) {
    return [];
  }

  // Get ground levels for all grid positions asynchronously
  const groundLevelPromises = gridPositions.map((pos) =>
    bot.world.getGroundLevel(pos.x, pos.z, chunkBounds.corner1.y)
  );
  const groundLevels = await Promise.all(groundLevelPromises);

  // Build ground positions and get block types asynchronously
  const groundPositions: Vec3[] = [];
  for (let i = 0; i < gridPositions.length; i++) {
    groundPositions.push({
      x: gridPositions[i].x,
      y: groundLevels[i] - 1,
      z: gridPositions[i].z,
    });
  }

  const blockTypePromises = groundPositions.map((pos) =>
    bot.world.getBlockType(pos).catch(() => null)
  );
  const blockTypes = await Promise.all(blockTypePromises);
  const blockTypeAbovePromises = groundPositions.map((pos) =>
    bot.world
      .getBlockType({ x: pos.x, y: pos.y + 1, z: pos.z })
      .catch(() => null)
  );
  const blockTypesAbove = await Promise.all(blockTypeAbovePromises);

  // Filter for dirt, grass, or moss ground blocks
  const dirtId = getObjectIdByName("Dirt");
  const grassId = getObjectIdByName("Grass");
  const mossId = getObjectIdByName("Moss");
  const validGroundTypes = [dirtId, grassId, mossId].filter(
    (id) => id !== undefined
  );

  const plantablePositions = groundPositions
    .filter(
      (pos, i) =>
        blockTypes[i] !== null && validGroundTypes.includes(blockTypes[i]!)
    )
    .filter((pos, i) => blockTypesAbove[i] === 0 || blockTypesAbove[i] === 1)
    .map((pos) => ({ x: pos.x, y: pos.y + 1, z: pos.z }));

  return plantablePositions;
}

export async function plantSaplingsInChunk(
  bot: DustBot,
  chunkBounds: { corner1: Vec3; corner2: Vec3 }
): Promise<void> {
  const oakSaplingId = getObjectIdByName("OakSapling");

  if (!oakSaplingId) {
    throw new Error("Oak sapling type not found");
  }

  console.log(`🌱 Creating sapling grid in chunk...`);

  // Get plantable positions using the chunk-specific logic
  const plantablePositions = await getPlantablePositionsInChunk(
    bot,
    chunkBounds
  );

  console.log(
    `📍 Found ${plantablePositions.length} plantable positions in chunk`
  );

  if (plantablePositions.length === 0) {
    console.log(`✅ No plantable positions found in chunk`);
    return;
  }

  // Plant saplings at each cluster of positions
  let remainingPositions = [...plantablePositions];
  const MAX_REACH = 6;

  while (remainingPositions.length > 0) {
    // Check inventory
    const saplingSlot = bot.state.inventory.findIndex(
      (item) => item.type === oakSaplingId && item.amount > 0
    );
    if (saplingSlot === -1) {
      console.log("❌ No more oak saplings in inventory");
      break;
    }

    // Find closest position
    const playerPos = await bot.player.getCurrentPosition();
    let closestPos = remainingPositions[0];
    let closestDistance = calculateDistance(playerPos, closestPos);

    for (const pos of remainingPositions) {
      const distance = calculateDistance(playerPos, pos);
      if (distance < closestDistance) {
        closestPos = pos;
        closestDistance = distance;
      }
    }

    // Move to planting area
    const targetPos = await findAdjacentPassthroughPosition(bot, closestPos);
    if (!targetPos) {
      console.log("❌ Could not find position to plant from");
      break;
    }

    console.log(
      `🚶 Moving to plant area near (${closestPos.x}, ${closestPos.y}, ${closestPos.z})`
    );
    await bot.movement.pathTo({
      x: targetPos.x,
      y: bot.state.position.y,
      z: targetPos.z,
    });

    // Plant at all positions within reach
    const currentPos = await bot.player.getCurrentPosition();
    const positionsInReach = remainingPositions.filter(
      (pos) => calculateDistance(currentPos, pos) <= MAX_REACH
    );

    console.log(
      `🌱 Planting ${positionsInReach.length} saplings within reach...`
    );
    for (const pos of positionsInReach) {
      const saplingPos = { x: pos.x, y: pos.y - 1, z: pos.z };
      try {
        await bot.farming.plantSeedType(saplingPos, oakSaplingId);
        console.log(
          `  ✅ Planted sapling at (${saplingPos.x}, ${saplingPos.y}, ${
            saplingPos.z
          }), ${packVec3(saplingPos)}`
        );
      } catch (error) {
        console.log(
          `  ❌ Failed to plant at (${saplingPos.x}, ${saplingPos.y}, ${saplingPos.z}): ${error}`
        );
      }
    }

    // Remove planted positions from remaining list
    remainingPositions = remainingPositions.filter(
      (pos) =>
        !positionsInReach.some(
          (planted) =>
            planted.x === pos.x && planted.y === pos.y && planted.z === pos.z
        )
    );
  }

  console.log("✅ Sapling planting completed in chunk!");
}
