import dotenv from "dotenv";
import DustBot from "../src/index.js";

dotenv.config();

async function main() {
  try {
    console.log("🚶 Simple Movement Demo");
    console.log("======================");

    const bot = new DustBot();

    // Show bot info
    await bot.getInfo();

    // Activate movement
    console.log("🔄 Activating movement...");
    await bot.movement.activate();

    // Define movement path
    const movementPath = [
      { x: 4, y: 0, z: 10 },
      { x: 15, y: 0, z: 15 },
      { x: 20, y: 0, z: 10 },
      { x: 15, y: 0, z: 5 },
      { x: 10, y: 0, z: 10 }, // Return to start
    ];

    console.log("\n🎯 Movement Plan:");
    movementPath.forEach((coord, i) => {
      console.log(`  ${i + 1}. Move to (${coord.x}, ${coord.y}, ${coord.z})`);
    });

    // Execute movement
    await bot.movement.wakeAndMove(movementPath);

    console.log("\n✅ Movement demo completed!");
  } catch (error) {
    console.error("❌ Movement demo failed:", error);
    process.exit(1);
  }
}

main();
