import * as dotenv from "dotenv";
import { WorldModule } from "../src/modules/world.js";

// Load environment variables
dotenv.config();

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error("❌ Usage: npm run toChunkCoord -- <x> <y> <z>");
    console.error("   Example: npm run toChunkCoord -- 100 64 -50");
    console.error("   Example: npm run toChunkCoord -- -405 72 479");
    console.error(
      "   Note: Use '--' before coordinates when using negative numbers"
    );
    process.exit(1);
  }

  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const z = parseInt(args[2]);

  if (isNaN(x) || isNaN(y) || isNaN(z)) {
    console.error("❌ All coordinates must be valid numbers");
    process.exit(1);
  }

  const world = new WorldModule();

  try {
    console.log(
      `🗺️  Converting coordinate [${x}, ${y}, ${z}] to chunk coordinate...`
    );

    // Convert coordinates to chunk coordinates
    const chunkCoord = world.toChunkCoord({ x, y, z });

    console.log(
      `✅ Chunk coordinate: [${chunkCoord.x}, ${chunkCoord.y}, ${chunkCoord.z}]`
    );
    console.log(`   Original: [${x}, ${y}, ${z}]`);
    console.log(
      `   Chunk:    [${chunkCoord.x}, ${chunkCoord.y}, ${chunkCoord.z}]`
    );
  } catch (error) {
    console.error("❌ Failed to convert coordinates:", error);
    process.exit(1);
  }
}

main();
