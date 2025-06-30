import * as dotenv from "dotenv";
import { InventoryModule } from "../src/modules/inventory.js";

// Load environment variables
dotenv.config();

async function main() {
  const inventory = new InventoryModule();

  try {
    console.log("🎒 Picking up all items...");
    await inventory.pickUpAll(inventory.characterEntityId);
    console.log("✅ Successfully picked up all items");
  } catch (error) {
    console.error("❌ Failed to pick up items:", error);
    process.exit(1);
  }
}

main();
