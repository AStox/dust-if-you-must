import { ethers } from "ethers";
import { EntityId, Vec3 } from "../types.js";
import DustBot from "../index.js";
import path from "path";
import fs from "fs";

interface PendingTransaction {
  hash: string;
  description: string;
  timestamp: number;
  promise: Promise<ethers.TransactionReceipt>;
}

// Player state enum
export enum PlayerState {
  DEAD = "DEAD",
  SLEEPING = "SLEEPING",
  AWAKE = "AWAKE",
}

export abstract class DustGameBase {
  protected provider: ethers.JsonRpcProvider;
  protected wallet: ethers.Wallet;
  protected worldContract: ethers.Contract;
  protected characterEntityId: EntityId;

  // MUD System IDs - based on actual Dust game systems
  protected readonly SYSTEM_IDS = {
    // Core movement and activation
    MOVE_SYSTEM:
      "0x737900000000000000000000000000004d6f766553797374656d000000000000",
    ACTIVATE_SYSTEM:
      "0x73790000000000000000000000000000416374697661746553797374656d0000",
    BUILD_SYSTEM:
      "0x737900000000000000000000000000004275696c6453797374656d0000000000",
    MINE_SYSTEM:
      "0x737900000000000000000000000000004d696e6553797374656d000000000000",
    BUCKET_SYSTEM:
      "0x737900000000000000000000000000004275636b657453797374656d00000000",
    FARMING_SYSTEM:
      "0x737900000000000000000000000000004661726d696e6753797374656d000000",
    CRAFT_SYSTEM:
      "0x73790000000000000000000000000000437261667453797374656d0000000000",
    SPAWN_SYSTEM:
      "0x73790000000000000000000000000000537061776e53797374656d0000000000",
  };

  constructor() {
    // Validate required environment variables
    const requiredEnvVars = [
      "PRIVATE_KEY",
      "RPC_URL",
      "WORLD_ADDRESS",
      "CHARACTER_ENTITY_ID",
    ];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);
    this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, this.provider);
    this.characterEntityId = process.env.CHARACTER_ENTITY_ID!;

    // Updated World contract ABI with MUD functions
    const worldABI = fs.readFileSync(
      path.join(__dirname, "worldAbi.json"),
      "utf8"
    );

    this.worldContract = new ethers.Contract(
      process.env.WORLD_ADDRESS!,
      worldABI,
      this.wallet
    );
  }

  // Execute a system call using the new MUD pattern
  protected async executeSystemCall(
    systemId: string,
    functionSig: string,
    params: any[],
    description: string,
    useOptimizedGas: boolean = true
  ): Promise<ethers.TransactionReceipt> {
    if (functionSig !== "move(bytes32,uint96[])") {
      console.log(`📋 Function: ${functionSig}`);
      console.log(
        `📦 Parameters:`,
        params.map(
          (p, i) =>
            `  ${i}: ${
              typeof p === "string" && p.length > 50
                ? p.slice(0, 50) + "..."
                : p
            }`
        )
      );
    }

    try {
      // Encode the function call data
      const callData = this.encodeCall(functionSig, params);

      // Use optimized gas settings for Redstone chain
      let gasLimit: bigint;
      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      if (useOptimizedGas) {
        // Conservative gas settings for low-funded wallets on Redstone
        gasLimit = BigInt(process.env.GAS_LIMIT || "200000"); // Much lower default
        maxFeePerGas = ethers.parseUnits("0.000002", "gwei"); // Very low for Redstone
        maxPriorityFeePerGas = ethers.parseUnits("0.0000001", "gwei"); // Minimal priority fee
      } else {
        // Try to estimate gas, but fallback to reasonable defaults
        gasLimit = await this.estimateGas(systemId, callData);
        maxFeePerGas = ethers.parseUnits("0.00001", "gwei");
        maxPriorityFeePerGas = ethers.parseUnits("0.000001", "gwei");

        console.log(`⛽ Gas estimate: ${gasLimit}`);
      }

      // Call the system through the World contract
      const tx = await this.worldContract.call(systemId, callData, {
        gasLimit: gasLimit,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        value: 0,
      });

      console.log(`🔄 Transaction sent: ${tx.hash}`);

      const receipt = await tx.wait(1);

      if (receipt && receipt.status === 1) {
        console.log(
          `================= ✅ ${description} successful! =================`
        );
        return receipt;
      } else {
        throw new Error(
          `${description} transaction failed - status: ${
            receipt?.status || "unknown"
          }`
        );
      }
    } catch (error) {
      throw error;
    }
  }

  // Encode function call data
  protected encodeCall(functionSig: string, params: any[]): string {
    const functionSelector = ethers.id(functionSig).slice(0, 10);
    const types = functionSig
      .split("(")[1]
      .split(")")[0]
      .split(",")
      .filter((t) => t.length > 0);

    let encodedParams = "";
    if (types.length > 0 && params.length > 0) {
      // Clean parameters to ensure proper encoding
      const cleanParams = params.map((param) => {
        if (typeof param === "string" && param.startsWith("0x0x")) {
          // Remove double 0x prefix
          return "0x" + param.slice(4);
        }
        return param;
      });

      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        types,
        cleanParams
      );
      encodedParams = encoded.slice(2); // Remove 0x prefix
    }

    return functionSelector + encodedParams;
  }

  // Estimate gas for a system call
  protected async estimateGas(
    systemId: string,
    callData: string
  ): Promise<bigint> {
    try {
      const gasEstimate = await this.worldContract.call.estimateGas(
        systemId,
        callData,
        {
          from: this.wallet.address,
          value: 0,
        }
      );

      // Add 20% buffer
      return gasEstimate + (gasEstimate * 20n) / 100n;
    } catch (error) {
      console.warn("⚠️ Gas estimation failed, using default");
      return BigInt(process.env.GAS_LIMIT || "500000");
    }
  }

  // Read game state from tables
  protected async getRecord(
    tableId: string,
    keyTuple: string[]
  ): Promise<{
    staticData: string;
    encodedLengths: string;
    dynamicData: string;
  }> {
    try {
      const result = await this.worldContract.getRecord(tableId, keyTuple);
      return {
        staticData: result[0],
        encodedLengths: result[1],
        dynamicData: result[2],
      };
    } catch (error) {
      throw error;
    }
  }

  // Check if player is dead (Energy = 0)
  async isPlayerDead(entityId?: EntityId): Promise<boolean> {
    try {
      const playerId = entityId || this.characterEntityId;
      // Energy table ID: "Energy" -> hex encoded (WorldResourceIdLib format)
      const energyTableId =
        "0x74620000000000000000000000000000456e6572677900000000000000000000";

      const result = await this.getRecord(energyTableId, [playerId]);

      if (!result.staticData || result.staticData === "0x") {
        console.log("⚠️ No energy data found - player might be dead");
        return true; // No energy data usually means dead
      }

      // Energy is stored as uint128 (16 bytes)
      const energyHex = result.staticData.slice(2);

      // Parse energy as big integer
      const energy = BigInt("0x" + energyHex.slice(33, 64));

      return energy === 0n;
    } catch (error) {
      console.log("⚠️ Failed to check player energy:", error);
      return true; // Assume dead if we can't check
    }
  }

  // Check if player is sleeping (has bed assigned)
  async isPlayerSleeping(entityId?: EntityId): Promise<boolean> {
    try {
      const playerId = entityId || this.characterEntityId;
      // PlayerBed table ID: "PlayerBed" -> hex encoded (WorldResourceIdLib format)
      const playerBedTableId =
        "0x74620000000000000000000000000000506c6179657242656400000000000000";

      const result = await this.getRecord(playerBedTableId, [playerId]);

      if (!result.staticData || result.staticData === "0x") {
        console.log("😴 No bed data found - player is not sleeping");
        return false;
      }

      // Check if bed entity ID exists (non-zero)
      const bedHex = result.staticData.slice(2);
      if (bedHex.length < 64) {
        // 32 bytes = 64 hex chars for EntityId
        return false;
      }

      const bedEntityId = "0x" + bedHex.slice(0, 64);
      const isAssigned = bedEntityId !== "0x" + "0".repeat(64);

      if (isAssigned) {
        console.log(`😴 Player is sleeping in bed: ${bedEntityId}`);
      }

      return isAssigned;
    } catch (error) {
      console.log("⚠️ Failed to check player bed status:", error);
      return false; // Assume not sleeping if we can't check
    }
  }

  // Get wallet info
  async getWalletInfo() {
    const balance = await this.provider.getBalance(this.wallet.address);
    return {
      address: this.wallet.address,
      balance: ethers.formatEther(balance),
      entityId: this.characterEntityId,
    };
  }

  // Display available systems
  displaySystemInfo(): void {
    console.log("🎯 Available Dust Game Systems:");
    console.log("==============================");
    console.log("🚶 MoveSystem - move, moveDirections");
    console.log("🌅 ActivateSystem - activate, activatePlayer");
    console.log("💧 BucketSystem - fillBucket, wetFarmland");
    console.log(
      "🏗️ BuildSystem - build, buildWithOrientation, jumpBuild, jumpBuildWithOrientation"
    );
    console.log("⛏️ MineSystem - mine, mineUntilDestroyed, getRandomOreType");
    console.log("🌾 FarmingSystem - till");
    console.log("🔨 CraftSystem - craft, craftWithStation");
    console.log("✨ SpawnSystem - spawn, randomSpawn");
    console.log();
    console.log(
      "⚠️  Note: System IDs are estimated - may need adjustment for actual deployment"
    );
  }
}

export class TransactionMonitor {
  private pendingTransactions: Map<string, PendingTransaction> = new Map();
  private isMonitoring = false;

  addTransaction(
    hash: string,
    description: string,
    promise: Promise<ethers.TransactionReceipt>
  ): void {
    const pending: PendingTransaction = {
      hash,
      description,
      timestamp: Date.now(),
      promise,
    };

    this.pendingTransactions.set(hash, pending);

    // Start monitoring if not already
    if (!this.isMonitoring) {
      this.startMonitoring();
    }

    // Monitor this specific transaction
    promise
      .then((receipt) => {
        if (receipt.status === 1) {
          console.log(`✅ Background confirmation: ${description} (${hash})`);
        } else {
          console.error(`❌ Background failure: ${description} (${hash})`);
          this.terminateOnFailure(description, hash);
        }
        this.pendingTransactions.delete(hash);
      })
      .catch((error) => {
        console.error(`❌ Background error: ${description} (${hash}):`, error);
        this.terminateOnFailure(description, hash);
        this.pendingTransactions.delete(hash);
      });
  }

  private startMonitoring(): void {
    this.isMonitoring = true;
    // We don't need a separate monitoring loop since we handle each transaction individually
  }

  private terminateOnFailure(description: string, hash: string): void {
    console.error(`💥 Transaction failed: ${description} (${hash})`);
    console.error(`💥 Terminating process due to transaction failure`);
    process.exit(1);
  }

  getPendingCount(): number {
    return this.pendingTransactions.size;
  }

  hasPending(): boolean {
    return this.pendingTransactions.size > 0;
  }

  async waitForTransaction(hash: string): Promise<ethers.TransactionReceipt> {
    const pending = this.pendingTransactions.get(hash);

    if (!pending) {
      throw new Error(`Transaction ${hash} not found in pending transactions`);
    }

    try {
      const receipt = await pending.promise;

      if (receipt.status === 1) {
        console.log(
          `✅ Transaction confirmed: ${pending.description} (${hash})`
        );
      } else {
        console.error(
          `❌ Transaction failed: ${pending.description} (${hash})`
        );
        throw new Error(`Transaction failed with status: ${receipt.status}`);
      }

      return receipt;
    } catch (error) {
      console.error(
        `❌ Transaction error: ${pending.description} (${hash}):`,
        error
      );
      throw error;
    }
  }
}
