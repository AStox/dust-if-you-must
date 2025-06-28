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
  public characterEntityId: EntityId;

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
    INVENTORY_SYSTEM:
      "0x73790000000000000000000000000000496e76656e746f727953797374656d00",
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

  private txMonitor = new TransactionMonitor();

  // Non-blocking system call execution
  protected async executeSystemCallNonBlocking(
    systemId: string,
    functionSig: string,
    params: any[],
    description: string
  ): Promise<string> {
    try {
      // Encode the function call data
      const callData = this.encodeCall(functionSig, params);

      // Use optimized gas settings for Redstone chain
      let gasLimit: bigint;
      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      gasLimit = BigInt(process.env.GAS_LIMIT || "200000");
      maxFeePerGas = ethers.parseUnits("0.000002", "gwei");
      maxPriorityFeePerGas = ethers.parseUnits("0.0000001", "gwei");

      // Call the system through the World contract
      const tx = await this.worldContract.call(systemId, callData, {
        gasLimit: gasLimit,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        value: 0,
      });

      console.log(`🔄 Transaction sent: ${tx.hash} (${description})`);

      // For movement transactions, monitor silently without terminating on failure
      if (functionSig === "move(bytes32,uint96[])") {
        // Monitor movement transactions silently - don't terminate on failure
        const receiptPromise = tx.wait(1);
        receiptPromise
          .then((receipt: ethers.TransactionReceipt) => {
            if (receipt.status === 1) {
              console.log(`✅ Movement confirmed: ${description} (${tx.hash})`);
            } else {
              console.log(
                `⚠️ Movement failed, triggering retry: ${description} (${tx.hash})`
              );
            }
          })
          .catch((error: any) => {
            console.log(
              `⚠️ Movement error, triggering retry: ${description} (${tx.hash}):`,
              error
            );
          });
      } else {
        // Add non-movement transactions to monitoring with termination
        const receiptPromise = tx.wait(1);
        this.txMonitor.addTransaction(tx.hash, description, receiptPromise);
      }

      return tx.hash;
    } catch (error) {
      console.error(`❌ Failed to send transaction: ${description}:`, error);
      throw error;
    }
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
