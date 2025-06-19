import dotenv from "dotenv";
import DustBot from "../src/index.js";

dotenv.config();

async function main() {
  try {
    console.log("🔨 Crafting Automation Demo");
    console.log("===========================");

    const bot = new DustBot();

    // Show bot info
    await bot.getInfo();

    // Show available recipes
    console.log("\n📋 Available Recipes:");
    bot.crafting.listRecipes();

    console.log("\n🎯 Crafting Plan:");
    console.log(
      "  🔨 We'll try to craft basic tools (this may fail if you don't have materials)"
    );
    console.log(
      "  📦 Make sure you have the required materials in your inventory slots:"
    );
    console.log("     - Wood planks in slot 0");
    console.log("     - Sticks in slot 1");
    console.log("     - Iron ingots in slot 0 (for bucket)");

    console.log(
      "\n⚠️  Note: Recipe IDs are placeholders and may need to be updated with actual game values!"
    );

    // Wake up character
    await bot.movement.activate();

    // Try crafting individual items (this will likely fail without proper materials/recipe IDs)
    try {
      console.log("\n🔨 Attempting to craft Wooden Pickaxe...");
      await bot.crafting.craftByName("WOODEN_PICKAXE");
      console.log("✅ Wooden Pickaxe crafted successfully!");
    } catch (error) {
      console.log(
        "❌ Failed to craft Wooden Pickaxe (expected - recipe ID may be incorrect)"
      );
    }

    try {
      console.log("\n🔨 Attempting to craft Wooden Shovel...");
      await bot.crafting.craftByName("WOODEN_SHOVEL");
      console.log("✅ Wooden Shovel crafted successfully!");
    } catch (error) {
      console.log(
        "❌ Failed to craft Wooden Shovel (expected - recipe ID may be incorrect)"
      );
    }

    try {
      console.log("\n🔨 Attempting to craft Bucket...");
      await bot.crafting.craftByName("BUCKET");
      console.log("✅ Bucket crafted successfully!");
    } catch (error) {
      console.log(
        "❌ Failed to craft Bucket (expected - recipe ID may be incorrect)"
      );
    }

    console.log("\n✅ Crafting demo completed!");
    console.log("\n💡 To use crafting successfully:");
    console.log("   1. Find the actual recipe IDs from the game");
    console.log("   2. Update the recipes in src/modules/crafting.ts");
    console.log(
      "   3. Ensure you have the required materials in correct inventory slots"
    );
    console.log("   4. Run this demo again");
  } catch (error) {
    console.error("❌ Crafting demo failed:", error);
  }
}

main();
