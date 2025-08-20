import { ethers } from "ethers";
import { EntityId, Vec3 } from "../types";
import DustBot from "../index.js";
import path from "path";
import fs from "fs";

interface PendingTransaction {
  hash: string;
  description: string;
  timestamp: number;
  promise: Promise<ethers.TransactionReceipt>;
  terminateOnFailure: boolean;
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

  // Global nonce management - shared across all instances
  private static currentNonce: number = 0;
  private static nonceLock: boolean = false;
  private static nonceInitialized: boolean = false;

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
    NATURE_SYSTEM:
      "0x737900000000000000000000000000004e617475726553797374656d00000000",
    TRANSFER_SYSTEM:
      "0x737900000000000000000000000000005472616e7366657253797374656d0000",
    FOOD_SYSTEM:
      "0x73790000000000000000000000000000466f6f6453797374656d000000000000",
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

    // Regular contract for normal system calls
    this.worldContract = new ethers.Contract(
      process.env.WORLD_ADDRESS!,
      worldABI,
      this.wallet
    );

    // Initialize nonce on startup
    this.initializeNonce();
  }

  /**
   * Initialize nonce counter with current on-chain nonce (only once)
   */
  private async initializeNonce(): Promise<void> {
    if (DustGameBase.nonceInitialized) return;

    DustGameBase.currentNonce = await this.wallet.getNonce();
    DustGameBase.nonceInitialized = true;
    // console.log(`🔄 Initialized nonce counter: ${DustGameBase.currentNonce}`);
  }

  /**
   * Refresh nonce from network - useful when nonce gets out of sync
   */
  public async refreshNonce(): Promise<void> {
    DustGameBase.currentNonce = await this.wallet.getNonce();
    console.log(`🔄 Refreshed nonce counter: ${DustGameBase.currentNonce}`);
  }

  /**
   * Get next nonce with thread safety
   */
  private async getNextNonce(): Promise<number> {
    // Simple spinlock for nonce safety
    while (DustGameBase.nonceLock) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    DustGameBase.nonceLock = true;
    const nonce = DustGameBase.currentNonce++;
    DustGameBase.nonceLock = false;
    return nonce;
  }

  private txMonitor = new TransactionMonitor();

  // Non-blocking system call execution
  protected async executeSystemCallNonBlocking(
    systemId: string,
    functionSig: string,
    params: any[],
    description: string,
    terminateOnFailure: boolean = true
  ): Promise<string> {
    try {
      // Encode the function call data
      const callData = this.encodeCall(functionSig, params);

      // Get managed nonce
      const nonce = await this.getNextNonce();

      // Use optimized gas settings for Redstone chain
      let gasLimit: bigint;
      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      gasLimit = BigInt(process.env.GAS_LIMIT || "700000");
      maxFeePerGas = ethers.parseUnits("0.000002", "gwei");
      maxPriorityFeePerGas = ethers.parseUnits("0.0000001", "gwei");

      // Call the system through the World contract with managed nonce
      const tx = await this.worldContract.call(systemId, callData, {
        nonce,
        gasLimit: gasLimit,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        value: 0,
      });

      console.log(
        `🔄 Transaction sent: ${tx.hash} (${description}) (nonce: ${nonce})`
      );

      // Add non-movement transactions to monitoring with termination
      const receiptPromise = tx.wait(1);
      this.txMonitor.addTransaction(
        tx.hash,
        description,
        receiptPromise,
        terminateOnFailure
      );

      return tx.hash;
    } catch (error) {
      console.error(`❌ Failed to send transaction: ${description}:`, error);

      throw error;
    }
  }

  // Execute a system call using the new MUD pattern with managed nonce
  protected async executeSystemCall(
    systemId: string,
    functionSig: string,
    params: any[],
    description: string,
    terminateOnFailure: boolean = true
  ): Promise<ethers.TransactionReceipt> {
    try {
      // Encode the function call data
      console.log("functionSig", functionSig);
      console.log("params", params);
      const callData = this.encodeCall(functionSig, params);

      // Get managed nonce
      const nonce = await this.getNextNonce();

      let gasLimit: bigint;
      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      gasLimit = BigInt(process.env.GAS_LIMIT || "700000");
      maxFeePerGas = ethers.parseUnits("0.000002", "gwei");
      maxPriorityFeePerGas = ethers.parseUnits("0.0000001", "gwei");

      // Call the system through the World contract with managed nonce
      const tx = await this.worldContract.call(systemId, callData, {
        nonce,
        gasLimit: gasLimit,
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        value: 0,
      });

      console.log(`🔄 Transaction sent: ${tx.hash} (nonce: ${nonce})`);

      const receipt = await tx.wait(1);

      if (receipt && receipt.status === 1) {
        console.log(`✅ ${description} successful!`);
        return receipt;
      } else {
        if (terminateOnFailure) {
          throw new Error(
            `(${
              receipt?.transactionHash
            }) ${description} transaction failed - status: ${
              receipt?.status || "unknown"
            }`
          );
        } else {
          console.log(
            `(${
              receipt?.transactionHash
            }) ${description} transaction failed - status: ${
              receipt?.status || "unknown"
            }`
          );
          return receipt;
        }
      }
    } catch (error) {
      if (terminateOnFailure) {
        console.log("terminateOnFailure");
        throw error;
      } else {
        console.log("failure. continuing...");
        console.log(`error: ${error}`);
        return undefined as any; // Return undefined when not terminating on failure
      }
    }
  }

  // Encode function call data
  protected encodeCall(functionSig: string, params: any[]): string {
    const functionSelector = ethers.id(functionSig).slice(0, 10);

    // Parse function signature properly handling nested parentheses
    const firstParenIndex = functionSig.indexOf("(");
    const lastParenIndex = functionSig.lastIndexOf(")");
    const paramString = functionSig.substring(
      firstParenIndex + 1,
      lastParenIndex
    );

    // Parse types while respecting nested parentheses and brackets
    const types = this.parseParameterTypes(paramString);

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

  private parseParameterTypes(paramString: string): string[] {
    if (!paramString.trim()) return [];

    const types: string[] = [];
    let current = "";
    let depth = 0;

    for (let i = 0; i < paramString.length; i++) {
      const char = paramString[i];

      if (char === "(" || char === "[") {
        depth++;
        current += char;
      } else if (char === ")" || char === "]") {
        depth--;
        current += char;
      } else if (char === "," && depth === 0) {
        types.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      types.push(current.trim());
    }

    return types;
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
      return BigInt(process.env.GAS_LIMIT || "700000");
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
    promise: Promise<ethers.TransactionReceipt>,
    terminateOnFailure: boolean = true
  ): void {
    const pending: PendingTransaction = {
      hash,
      description,
      timestamp: Date.now(),
      promise,
      terminateOnFailure,
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
          if (terminateOnFailure) {
            this.terminateOnFailure(description, hash);
          }
        }
        this.pendingTransactions.delete(hash);
      })
      .catch((error) => {
        console.error(`❌ Background error: ${description} (${hash})`);
        if (terminateOnFailure) {
          this.terminateOnFailure(description, hash);
        }
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
