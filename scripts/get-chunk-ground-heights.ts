#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { ObjectTypes } from "../src/types/objectTypes.js";

// Load environment variables
dotenv.config();

async function main() {
  // Initialize the bot
  const bot = new DustBot();

  // Display wallet info
  const walletInfo = await bot.getInfo();

  // Check actual player state and take appropriate action
  console.log("=".repeat(60));
  console.log("🚀 GETTING CHUNK GROUND HEIGHTS");
  console.log("=".repeat(60));

  // Get the actual player state from game tables
  await bot.player.checkStatusAndActivate(bot);

  // Get player position
  const playerPosition = await bot.world.getPositionOfEntity(
    bot.player.characterEntityId
  );
  console.log(
    `📍 Player position: [${playerPosition.x}, ${playerPosition.y}, ${playerPosition.z}]`
  );

  // Get chunk ground heights
  console.log("\n🗺️  Getting chunk blocks...");
  const startTime = Date.now();

  const chunkBlocks = await bot.world.getChunkBlocks(playerPosition);

  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(`\n⏱️  Completed in ${duration}ms`);
  console.log(`📊 Found ${chunkBlocks.size} blocks:`);

  // Log all ground heights
  chunkBlocks.forEach((blockType, key) => {
    const [x, y, z] = key.split(",").map(Number);
    console.log(
      `  [${x}, ${y}, ${z}] -> Block type: ${ObjectTypes[blockType].name}`
    );
  });

  // Log some statistics
  const heights = Array.from(chunkBlocks.values()).map(
    (blockType) => blockType
  );
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length;

  console.log(`\n📈 Height Statistics:`);
  console.log(`   Min: ${minHeight}`);
  console.log(`   Max: ${maxHeight}`);
  console.log(`   Avg: ${avgHeight.toFixed(2)}`);
}

// Run the script
main().catch(console.error);
