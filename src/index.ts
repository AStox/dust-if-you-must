import * as dotenv from "dotenv";
import { MovementModule } from "./modules/movement.js";
import { FarmingModule } from "./modules/farming.js";
import { BuildingModule } from "./modules/building.js";
import { CraftingModule } from "./modules/crafting.js";
import { Vec3 } from "./types.js";
import { PlayerState } from "./core/base.js";

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

  // Player state checking methods
  async getPlayerState(): Promise<PlayerState> {
    return await this.movement.getPlayerState();
  }

  async isPlayerDead(): Promise<boolean> {
    return await this.movement.isPlayerDead();
  }

  async isPlayerSleeping(): Promise<boolean> {
    return await this.movement.isPlayerSleeping();
  }

  async getPlayerEnergy(): Promise<string> {
    return await this.movement.getPlayerEnergy();
  }
}

// Main execution function for direct script usage
async function main() {
  try {
    const bot = new DustBot();

    // Get bot info
    await bot.getInfo();
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
