import * as dotenv from "dotenv";
import { MovementModule } from "./modules/movement.js";
import { FarmingModule } from "./modules/farming.js";
import { BuildingModule } from "./modules/building.js";
import { CraftingModule } from "./modules/crafting.js";
import { Vec3 } from "./types.js";

// Load environment variables
dotenv.config();

export class DustBot {
  public movement: MovementModule;
  public farming: FarmingModule;
  public building: BuildingModule;
  public crafting: CraftingModule;

  constructor() {
    console.log("🤖 Initializing Dust Bot...");

    // Initialize all modules
    this.movement = new MovementModule();
    this.farming = new FarmingModule();
    this.building = new BuildingModule();
    this.crafting = new CraftingModule();

    console.log("✅ All modules initialized!");
  }

  // Get wallet and character info
  async getInfo() {
    const info = await this.movement.getWalletInfo();
    console.log("🤖 Dust Bot Info:");
    console.log(`💰 Wallet: ${info.address}`);
    console.log(`💰 Balance: ${info.balance} ETH`);
    console.log(`👤 Character: ${info.entityId}`);
    return info;
  }

  // Example: Complete farming automation
  async runFarmingBot(
    waterSource: Vec3,
    farmCenter: Vec3,
    farmSize: { width: number; height: number } = { width: 3, height: 3 }
  ): Promise<void> {
    console.log("🚜 Starting automated farming sequence...");

    try {
      // 1. Wake up character
      await this.movement.activate();

      // 2. Move to farm area
      console.log("🚶 Moving to farm area...");
      await this.movement.moveToCoordinate(farmCenter);

      // 3. Generate farm grid coordinates
      const farmCoords = this.farming.generateFarmGrid(
        farmCenter,
        farmSize.width,
        farmSize.height
      );
      console.log(`📍 Generated ${farmCoords.length} farm plots`);

      // 4. Water all farmland
      await this.farming.waterMultiplePlots(waterSource, farmCoords);

      console.log("✅ Farming automation completed!");
    } catch (error) {
      console.error("❌ Farming automation failed:", error);
      throw error;
    }
  }

  // Example: Building automation
  async runBuildingBot(
    buildSite: Vec3,
    buildingType: "house" | "wall" | "clear",
    options?: any
  ): Promise<void> {
    console.log(`🏗️ Starting automated building sequence: ${buildingType}...`);

    try {
      // 1. Wake up character
      await this.movement.activate();

      // 2. Move to build site
      console.log("🚶 Moving to build site...");
      await this.movement.moveToCoordinate(buildSite);

      // 3. Execute building task
      switch (buildingType) {
        case "house":
          await this.building.buildSimpleHouse(
            buildSite,
            options?.width || 5,
            options?.length || 5,
            options?.height || 3,
            options?.slot || 0
          );
          break;

        case "wall":
          await this.building.buildWall(
            buildSite,
            options?.endPoint || {
              x: buildSite.x + 10,
              y: buildSite.y,
              z: buildSite.z,
            },
            options?.height || 3,
            options?.slot || 0
          );
          break;

        case "clear":
          await this.building.clearArea(
            buildSite,
            options?.endPoint || {
              x: buildSite.x + 5,
              y: buildSite.y + 3,
              z: buildSite.z + 5,
            },
            options?.toolSlot || 0
          );
          break;
      }

      console.log("✅ Building automation completed!");
    } catch (error) {
      console.error("❌ Building automation failed:", error);
      throw error;
    }
  }

  // Example: Crafting automation
  async runCraftingBot(): Promise<void> {
    console.log("🔨 Starting automated crafting sequence...");

    try {
      // 1. Wake up character
      await this.movement.activate();

      // 2. Craft basic tool set
      await this.crafting.createToolkit("wood");

      console.log("✅ Crafting automation completed!");
    } catch (error) {
      console.error("❌ Crafting automation failed:", error);
      throw error;
    }
  }

  // Example: Complex multi-task automation
  async runCompleteAutomation(config: {
    waterSource: Vec3;
    farmCenter: Vec3;
    buildSite: Vec3;
    farmSize?: { width: number; height: number };
  }): Promise<void> {
    console.log("🚀 Starting complete automation sequence...");

    try {
      // 1. Get initial info
      await this.getInfo();

      // 2. Wake up character
      await this.movement.activate();

      // 3. Craft basic tools first
      console.log("🔨 Phase 1: Crafting tools...");
      await this.runCraftingBot();

      // 4. Set up farm
      console.log("🚜 Phase 2: Setting up farm...");
      await this.runFarmingBot(
        config.waterSource,
        config.farmCenter,
        config.farmSize
      );

      // 5. Build shelter
      console.log("🏠 Phase 3: Building shelter...");
      await this.runBuildingBot(config.buildSite, "house");

      console.log("🎉 Complete automation sequence finished!");
    } catch (error) {
      console.error("💥 Complete automation failed:", error);
      throw error;
    }
  }

  // Simple movement test
  async testMovement(path: Vec3[]): Promise<void> {
    console.log("🧪 Testing movement...");
    await this.movement.wakeAndMove(path);
  }
}

// Main execution function for direct script usage
async function main() {
  try {
    const bot = new DustBot();

    // Get bot info
    await bot.getInfo();

    // Example usage - uncomment the automation you want to run:

    // 1. Simple movement test
    await bot.testMovement([
      { x: 10, y: 0, z: 10 },
      { x: 15, y: 0, z: 15 },
      { x: 20, y: 0, z: 10 },
    ]);

    // 2. Farming automation
    // await bot.runFarmingBot(
    //   { x: 0, y: 0, z: 0 },   // water source
    //   { x: 10, y: 0, z: 10 }  // farm center
    // );

    // 3. Building automation
    // await bot.runBuildingBot(
    //   { x: 20, y: 0, z: 20 }, // build site
    //   "house"
    // );

    // 4. Complete automation
    // await bot.runCompleteAutomation({
    //   waterSource: { x: 0, y: 0, z: 0 },
    //   farmCenter: { x: 10, y: 0, z: 10 },
    //   buildSite: { x: 20, y: 0, z: 20 }
    // });

    console.log("🎉 Bot execution completed!");
  } catch (error) {
    console.error("💥 Bot execution failed:", error);
    process.exit(1);
  }
}

// Export the bot class for use in other scripts
export default DustBot;

// Run main if this file is executed directly
if (require.main === module) {
  main();
}
