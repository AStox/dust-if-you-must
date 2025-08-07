#!/usr/bin/env tsx

import * as dotenv from "dotenv";
import { DustBot } from "../src/index.js";
import { loadOperationalConfig } from "../src/config/loader.js";

// Load environment variables
dotenv.config();

async function testMovement() {
  console.log("🤖 Testing simple movement to house...");

  try {
    await loadOperationalConfig({
      configPath: "./config/operational.json",
      validateSchema: true,
      allowEnvironmentOverrides: true,
      requireEnergizeAreas: false,
    });
    console.log("✅ Configuration loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load configuration:", error);
    process.exit(1);
  }

  // Initialize the bot
  const bot = new DustBot();

  // Display wallet info
  const walletInfo = await bot.getInfo();
  console.log("💳 Wallet Address:", walletInfo.address);

  // Test moving to house coordinates (same as MOVE_TO_FARM action)
  try {
    const playerStatus = await bot.checkPlayerStatus("MOVEMENT_TEST");
    console.log("📍 Current position:", playerStatus.position);
    console.log("⚡ Current energy:", playerStatus.energy);
    
    const housePosition = { x: -401, y: 72, z: 489 };
    console.log("🏠 Moving to house:", housePosition);
    
    await bot.movement.moveTowards(housePosition);
    
    console.log("✅ Movement completed successfully!");
    const finalStatus = await bot.checkPlayerStatus("MOVEMENT_TEST_FINAL");
    console.log("📍 Final position:", finalStatus.position);
  } catch (error) {
    console.error("❌ Movement failed:", error);
  }

  process.exit(0);
}

testMovement();
