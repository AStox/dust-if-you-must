#!/usr/bin/env node

import { getOperationalConfig, loadOperationalConfig } from "../src/config/loader.js";
import { DustBot } from "../src/index.js";
import dotenv from "dotenv";

dotenv.config();

async function spawnAtDefaultLocation() {
  const args = process.argv.slice(2);

  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const z = parseInt(args[2]);

  if (!(isNaN(x) && isNaN(y) && isNaN(z)) && (isNaN(x) || isNaN(y) || isNaN(z))) {
    console.error("❌ Invalid coordinates. Please provide numeric values.");
    process.exit(1);
  }

  try {
    console.log(`🤖 Initializing bot...`);
    const bot = new DustBot();

    // Refresh nonce to ensure it's in sync after activation
    await bot.player.refreshNonce();

    let spawnCoord = { x, y, z };
    if (isNaN(x) && isNaN(y) && isNaN(z)) {
      await loadOperationalConfig({
            configPath: "./config/operational.json",
            validateSchema: true,
            allowEnvironmentOverrides: true,
          });
      const config = getOperationalConfig();
      console.log(config)
      spawnCoord = config.areas.spawnTile;

    } else {
      spawnCoord = {x,y,z}
    }

    console.log(`🎯 Spawning bot at coordinates (${spawnCoord.x}, ${spawnCoord.y}, ${spawnCoord.z})`);
    
    await bot.movement.spawn(
      process.env.SPAWN_TILE_ENTITY_ID!,
      spawnCoord
    );

    console.log("✅ Bot spawned successfully!");
  } catch (error) {
    console.error("❌ Failed to spawn bot:", error);
    process.exit(1);
  }
}

spawnAtDefaultLocation();
