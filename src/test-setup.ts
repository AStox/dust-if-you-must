import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

async function testSetup() {
  console.log("🧪 Testing Dust Bot Setup\n");

  // Test environment variables
  console.log("📋 Environment Variables:");
  const requiredEnvVars = [
    "PRIVATE_KEY",
    "RPC_URL",
    "WORLD_ADDRESS",
    "CHARACTER_ENTITY_ID",
  ];
  let allVarsPresent = true;

  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    if (value) {
      console.log(
        `✅ ${envVar}: ${envVar === "PRIVATE_KEY" ? "***hidden***" : value}`
      );
    } else {
      console.log(`❌ ${envVar}: Missing`);
      allVarsPresent = false;
    }
  }

  if (!allVarsPresent) {
    console.log("\n❌ Setup incomplete. Please fill in your .env file.");
    return;
  }

  // Test RPC connection
  console.log("\n🌐 Testing RPC Connection:");
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ Connected to network. Latest block: ${blockNumber}`);
  } catch (error) {
    console.log(`❌ RPC connection failed: ${error}`);
    return;
  }

  // Test wallet
  console.log("\n💰 Testing Wallet:");
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
    const balance = await provider.getBalance(wallet.address);
    console.log(`✅ Wallet address: ${wallet.address}`);
    console.log(`✅ Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
      console.log("⚠️  Warning: Wallet has 0 ETH balance");
    }
  } catch (error) {
    console.log(`❌ Wallet setup failed: ${error}`);
    return;
  }

  // Test character EntityId format
  console.log("\n👤 Testing Character EntityId:");
  const entityId = process.env.CHARACTER_ENTITY_ID!;
  if (entityId.match(/^0x[0-9a-fA-F]{64}$/)) {
    console.log(`✅ EntityId format valid: ${entityId}`);
  } else {
    console.log(
      `❌ EntityId format invalid. Should be 66 chars starting with 0x: ${entityId}`
    );
  }

  console.log("\n🎉 Setup test completed!");
  console.log("\n📝 Next steps:");
  console.log("1. Run 'npm run move' to test character movement");
  console.log("2. Edit src/move.ts to customize movement coordinates");
  console.log("3. Check the console output for any errors");
}

testSetup().catch(console.error);
