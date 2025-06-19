import dotenv from "dotenv";
import DustBot from "../src/index.js";

dotenv.config();

async function main() {
  try {
    console.log("🏗️ Building Automation Demo");
    console.log("===========================");

    const bot = new DustBot();

    // Show bot info
    await bot.getInfo();

    // Define building coordinates
    const buildSite = { x: 25, y: 0, z: 25 }; // Location for house
    const clearSite = { x: 30, y: 0, z: 30 }; // Area to clear

    console.log("\n🎯 Building Plan:");
    console.log(
      `  🏠 House location: (${buildSite.x}, ${buildSite.y}, ${buildSite.z})`
    );
    console.log(
      `  🗑️ Clear area: (${clearSite.x}, ${clearSite.y}, ${clearSite.z}) to (${
        clearSite.x + 5
      }, ${clearSite.y + 3}, ${clearSite.z + 5})`
    );

    // Option 1: Build a simple house
    console.log("\n🏠 Option 1: Building a house...");
    console.log("Uncomment this section to build a 5x5x3 house:");
    console.log(
      "await bot.runBuildingBot(buildSite, 'house', { width: 5, length: 5, height: 3 });"
    );

    // Option 2: Clear an area
    console.log("\n🗑️ Option 2: Clearing an area...");
    console.log("Uncomment this section to clear a 5x3x5 area:");
    console.log(
      "await bot.runBuildingBot(clearSite, 'clear', { endPoint: { x: clearSite.x + 5, y: clearSite.y + 3, z: clearSite.z + 5 } });"
    );

    // Option 3: Build a wall
    const wallStart = { x: 35, y: 0, z: 35 };
    const wallEnd = { x: 45, y: 0, z: 35 };
    console.log("\n🧱 Option 3: Building a wall...");
    console.log(
      `Wall from (${wallStart.x}, ${wallStart.z}) to (${wallEnd.x}, ${wallEnd.z})`
    );
    console.log("Uncomment this section to build a wall:");
    console.log(
      "await bot.runBuildingBot(wallStart, 'wall', { endPoint: wallEnd, height: 3 });"
    );

    // For demo purposes, let's do a simple single block build
    console.log("\n🔨 Demo: Building a single block...");
    await bot.movement.activate();
    await bot.movement.moveToCoordinate(buildSite);
    await bot.building.build(buildSite, 0); // Build one block at build site

    console.log("\n✅ Building demo completed!");
    console.log(
      "💡 Uncomment the sections above to run full building automation!"
    );
  } catch (error) {
    console.error("❌ Building demo failed:", error);
    console.log(
      "\n💡 This might fail if you don't have building materials in your inventory."
    );
    console.log("💡 Make sure you have blocks in slot 0 of your inventory.");
  }
}

main();
