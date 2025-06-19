import dotenv from "dotenv";
import DustBot from "../src/index.js";

dotenv.config();

async function main() {
  try {
    console.log("🚜 Farming Automation Demo");
    console.log("==========================");

    const bot = new DustBot();

    // Show bot info
    await bot.getInfo();

    // Define farming coordinates
    const waterSource = { x: 0, y: 0, z: 0 }; // Adjust to actual water location
    const farmCenter = { x: 10, y: 0, z: 10 }; // Center of farm area
    const farmSize = { width: 3, height: 3 }; // 3x3 farm grid

    console.log("\n🎯 Farming Plan:");
    console.log(
      `  💧 Water source: (${waterSource.x}, ${waterSource.y}, ${waterSource.z})`
    );
    console.log(
      `  🌾 Farm center: (${farmCenter.x}, ${farmCenter.y}, ${farmCenter.z})`
    );
    console.log(
      `  📏 Farm size: ${farmSize.width}x${farmSize.height} = ${
        farmSize.width * farmSize.height
      } plots`
    );

    // Generate and show farm coordinates
    const farmCoords = bot.farming.generateFarmGrid(
      farmCenter,
      farmSize.width,
      farmSize.height
    );
    console.log("\n📍 Farm plots:");
    farmCoords.forEach((coord, i) => {
      console.log(`  ${i + 1}. (${coord.x}, ${coord.y}, ${coord.z})`);
    });

    // Execute farming automation
    console.log("\n🚜 Starting farming automation...");
    await bot.runFarmingBot(waterSource, farmCenter, farmSize);

    console.log("\n✅ Farming demo completed!");
    console.log("💡 Your farm plots are now watered and ready for planting!");
  } catch (error) {
    console.error("❌ Farming demo failed:", error);
    process.exit(1);
  }
}

main();
