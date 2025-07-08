#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { ObjectTypes } from "../src/types/objectTypes.js";
import {
  BiomeTypes,
  getHighestMultiplierMineral,
} from "../src/types/biomeTypes.js";

// Load environment variables
dotenv.config();

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  // Initialize the bot first
  const bot = new DustBot();

  // Display wallet info
  //   const walletInfo = await bot.getInfo();

  console.log("=".repeat(60));
  console.log("🔍 GETTING BLOCK DATA");
  console.log("=".repeat(60));

  // Check actual player state and take appropriate action
  await bot.player.checkStatusAndActivate(bot);

  let coord: { x: number; y: number; z: number };

  if (args.length === 0) {
    // Use bot's current position
    coord = await bot.world.getPositionOfEntity(bot.player.characterEntityId);
    console.log(
      `📍 Using bot's current position: [${coord.x}, ${coord.y}, ${coord.z}]`
    );
  } else if (args.length === 3) {
    // Use provided coordinates
    const [x, y, z] = args.map(Number);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      console.error("All coordinates must be valid numbers");
      process.exit(1);
    }

    coord = { x, y, z };
    console.log(`📍 Using provided coordinate: [${x}, ${y}, ${z}]`);
  } else {
    console.error("Usage: npm run blockData [x y z]");
    console.error("Examples:");
    console.error("  npm run blockData           # Use bot's current position");
    console.error("  npm run blockData 10 5 -3   # Use specific coordinates");
    process.exit(1);
  }

  try {
    const startTime = Date.now();

    // Get block data (both block type and biome)
    const blockData = await bot.world.getCachedBlockData(coord);

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`\n✅ Block data retrieved in ${duration}ms:`);

    // Additional info
    const objectType = ObjectTypes[blockData.blockType];
    if (objectType) {
      console.log(`Type: ${objectType.name}`);
    }

    // Biome info
    const biome = BiomeTypes[blockData.biome];
    console.log(`Biome: ${biome?.name || "Unknown"}`);

    if (biome) {
      console.log(`Ore Multipliers:`);
      console.log(`  Coal:      ${biome.multipliers.coal.toLocaleString()}`);
      console.log(`  Copper:    ${biome.multipliers.copper.toLocaleString()}`);
      console.log(`  Iron:      ${biome.multipliers.iron.toLocaleString()}`);
      console.log(`  Gold:      ${biome.multipliers.gold.toLocaleString()}`);
      console.log(`  Diamond:   ${biome.multipliers.diamond.toLocaleString()}`);
      console.log(
        `  Neptunium: ${biome.multipliers.neptunium.toLocaleString()}`
      );
    }

    // Chunk info
    const chunkCoord = bot.world.toChunkCoord(coord);
    console.log(`\n🗺️  Chunk Info:`);
    console.log(
      `   Chunk Coordinate: [${chunkCoord.x}, ${chunkCoord.y}, ${chunkCoord.z}]`
    );
  } catch (error) {
    console.error(
      `❌ Error getting block data: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
