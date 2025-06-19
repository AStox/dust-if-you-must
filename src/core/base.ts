import { ethers } from "ethers";
import { EntityId } from "../types.js";

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
    const worldABI = [
      {
        inputs: [
          {
            internalType: "ResourceId",
            name: "systemId",
            type: "bytes32",
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes",
          },
        ],
        name: "call",
        outputs: [
          {
            internalType: "bytes",
            name: "",
            type: "bytes",
          },
        ],
        stateMutability: "payable",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "address",
            name: "delegator",
            type: "address",
          },
          {
            internalType: "ResourceId",
            name: "systemId",
            type: "bytes32",
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes",
          },
        ],
        name: "callFrom",
        outputs: [
          {
            internalType: "bytes",
            name: "",
            type: "bytes",
          },
        ],
        stateMutability: "payable",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "ResourceId",
            name: "tableId",
            type: "bytes32",
          },
          {
            internalType: "bytes32[]",
            name: "keyTuple",
            type: "bytes32[]",
          },
        ],
        name: "getRecord",
        outputs: [
          {
            internalType: "bytes",
            name: "staticData",
            type: "bytes",
          },
          {
            internalType: "EncodedLengths",
            name: "encodedLengths",
            type: "bytes32",
          },
          {
            internalType: "bytes",
            name: "dynamicData",
            type: "bytes",
          },
        ],
        stateMutability: "view",
        type: "function",
      },
    ];

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
    console.log(`🔄 ${description}...`);
    console.log(`🎯 System: ${systemId}`);
    console.log(`📋 Function: ${functionSig}`);
    console.log(
      `📦 Parameters:`,
      params.map(
        (p, i) =>
          `  ${i}: ${
            typeof p === "string" && p.length > 50 ? p.slice(0, 50) + "..." : p
          }`
      )
    );

    try {
      // Encode the function call data
      const callData = this.encodeCall(functionSig, params);
      console.log(`📡 Encoded call data: ${callData}`);

      // Use optimized gas settings for Redstone chain
      let gasLimit: bigint;
      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      if (useOptimizedGas) {
        // Conservative gas settings for low-funded wallets on Redstone
        gasLimit = BigInt(process.env.GAS_LIMIT || "200000"); // Much lower default
        maxFeePerGas = ethers.parseUnits("0.000002", "gwei"); // Very low for Redstone
        maxPriorityFeePerGas = ethers.parseUnits("0.0000001", "gwei"); // Minimal priority fee

        console.log(
          `⛽ Using optimized gas: limit=${gasLimit}, maxFee=${ethers.formatUnits(
            maxFeePerGas,
            "gwei"
          )} gwei`
        );
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
      console.log(
        `to: ${process.env.WORLD_ADDRESS}, from: ${this.wallet.address}, function: ${functionSig}, params: ${params}`
      );

      console.log(`🔄 Transaction sent: ${tx.hash}`);
      console.log("⏳ Waiting for confirmation...");

      const receipt = await tx.wait(1);

      if (receipt && receipt.status === 1) {
        console.log(`✅ ${description} successful!`);
        console.log(`🧾 Gas used: ${receipt.gasUsed}`);
        return receipt;
      } else {
        throw new Error(
          `${description} transaction failed - status: ${
            receipt?.status || "unknown"
          }`
        );
      }
    } catch (error) {
      console.error(`❌ ${description} failed:`, error);
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
      console.error("❌ Failed to read game state:", error);
      throw error;
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
