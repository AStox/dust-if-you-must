import * as dotenv from "dotenv";
import { MovementModule } from "./modules/movement.js";
import { FarmingModule } from "./modules/farming.js";
import { BuildingModule } from "./modules/building.js";
import { CraftingModule } from "./modules/crafting.js";
import { PlayerModule } from "./modules/player.js";
import { WorldModule } from "./modules/world.js";
import { InventoryModule } from "./modules/inventory.js";
import { Vec3 } from "./types";
import { PlayerState } from "./core/base.js";

// Load environment variables
dotenv.config();

export class DustBot {
  public movement: MovementModule;
  public farming: FarmingModule;
  public building: BuildingModule;
  public crafting: CraftingModule;
  public player: PlayerModule;
  public world: WorldModule;
  public inventory: InventoryModule;
  constructor() {
    console.log("🤖 Initializing Dust Bot...");

    // Initialize all modules
    this.movement = new MovementModule();
    this.farming = new FarmingModule();
    this.building = new BuildingModule();
    this.crafting = new CraftingModule();
    this.player = new PlayerModule();
    this.world = new WorldModule();
    this.inventory = new InventoryModule();
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
    return await this.player.getPlayerState();
  }

  async isPlayerDead(): Promise<boolean> {
    return await this.player.isPlayerDead();
  }

  async isPlayerSleeping(): Promise<boolean> {
    return await this.player.isPlayerSleeping();
  }

  async getPlayerEnergy(): Promise<string> {
    return await this.player.getPlayerEnergy();
  }

  // Check player status with comprehensive information
  async checkPlayerStatus(action: string): Promise<{
    position: Vec3 | null;
    energy: string;
    isDead: boolean;
    isSleeping: boolean;
  }> {
    return await this.player.checkPlayerStatus(this, action);
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
