import * as fs from "fs";
import * as path from "path";
import {
  OperationalConfig,
  ResolvedOperationalConfig,
  ConfigLoadOptions,
  EnvironmentOverrides,
  ConfigValidationResult,
  DEFAULT_CONFIG_VALUES,
  Position3D,
} from "./types.js";
import { ConfigValidator, generateValidationReport } from "./validator.js";

/**
 * Configuration loader with environment variable override support
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private loadedConfig: ResolvedOperationalConfig | null = null;

  private constructor() {}

  /**
   * Get singleton instance of ConfigLoader
   */
  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * Load operational configuration from file with environment overrides
   */
  public async loadConfig(
    options: ConfigLoadOptions = {}
  ): Promise<ResolvedOperationalConfig> {
    const {
      configPath = "./config/operational.json",
      validateSchema = true,
      allowEnvironmentOverrides = true,
    } = options;

    try {
      console.log(`📋 Loading configuration from: ${configPath}`);

      // Load base configuration from file
      const baseConfig = await this.loadConfigFromFile(configPath);

      // Apply environment variable overrides if enabled
      let config = baseConfig;
      if (allowEnvironmentOverrides) {
        config = this.applyEnvironmentOverrides(baseConfig);
      }

      // Validate configuration if enabled
      if (validateSchema) {
        const validation = ConfigValidator.validate(
          config
        );
        if (!validation.isValid) {
          const report = generateValidationReport(validation);
          console.error(report);
          throw new Error(
            "Configuration validation failed. See above for details."
          );
        }

        if (validation.warnings.length > 0) {
          console.warn(
            `⚠️ Configuration warnings:\n${validation.warnings.join("\n")}`
          );
        }
      }

      // Apply default values and resolve configuration
      const resolvedConfig = this.resolveDefaults(config);

      console.log(
        `✅ Configuration loaded successfully: ${resolvedConfig.name}`
      );

      this.loadedConfig = resolvedConfig;
      return resolvedConfig;
    } catch (error) {
      console.error(`❌ Failed to load configuration: ${error}`);
      throw error;
    }
  }

  /**
   * Get currently loaded configuration (throws if not loaded)
   */
  public getConfig(): ResolvedOperationalConfig {
    if (!this.loadedConfig) {
      throw new Error("Configuration not loaded! Call loadConfig() first.");
    }
    return this.loadedConfig;
  }

  /**
   * Check if configuration is loaded
   */
  public isConfigLoaded(): boolean {
    return this.loadedConfig !== null;
  }

  /**
   * Load configuration from JSON file
   */
  private async loadConfigFromFile(
    configPath: string
  ): Promise<OperationalConfig> {
    const fullPath = path.resolve(configPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Configuration file not found: ${fullPath}`);
    }

    try {
      const configData = fs.readFileSync(fullPath, "utf-8");
      const parsedConfig = JSON.parse(configData) as OperationalConfig;
      return parsedConfig;
    } catch (error) {
      throw new Error(`Failed to parse configuration file: ${error}`);
    }
  }

  /**
   * Apply environment variable overrides to configuration
   */
  private applyEnvironmentOverrides(
    config: OperationalConfig
  ): OperationalConfig {
    console.log("🔧 Applying environment variable overrides...");

    const env = process.env as EnvironmentOverrides;
    const updatedConfig = JSON.parse(JSON.stringify(config)); // Deep clone

    let overrideCount = 0;

    // Apply farm area overrides
    if (env.FARM_CENTER_X || env.FARM_CENTER_Y || env.FARM_CENTER_Z) {
      updatedConfig.areas.farming.farmCenter = {
        x: this.parseEnvNumber(
          env.FARM_CENTER_X,
          updatedConfig.areas.farming.farmCenter.x
        ),
        y: this.parseEnvNumber(
          env.FARM_CENTER_Y,
          updatedConfig.areas.farming.farmCenter.y
        ),
        z: this.parseEnvNumber(
          env.FARM_CENTER_Z,
          updatedConfig.areas.farming.farmCenter.z
        ),
      };
      overrideCount++;
    }

    if (env.FARM_CORNER1_X || env.FARM_CORNER1_Y || env.FARM_CORNER1_Z) {
      updatedConfig.areas.farming.farmBounds.corner1 = {
        x: this.parseEnvNumber(
          env.FARM_CORNER1_X,
          updatedConfig.areas.farming.farmBounds.corner1.x
        ),
        y: this.parseEnvNumber(
          env.FARM_CORNER1_Y,
          updatedConfig.areas.farming.farmBounds.corner1.y
        ),
        z: this.parseEnvNumber(
          env.FARM_CORNER1_Z,
          updatedConfig.areas.farming.farmBounds.corner1.z
        ),
      };
      overrideCount++;
    }

    if (env.FARM_CORNER2_X || env.FARM_CORNER2_Y || env.FARM_CORNER2_Z) {
      updatedConfig.areas.farming.farmBounds.corner2 = {
        x: this.parseEnvNumber(
          env.FARM_CORNER2_X,
          updatedConfig.areas.farming.farmBounds.corner2.x
        ),
        y: this.parseEnvNumber(
          env.FARM_CORNER2_Y,
          updatedConfig.areas.farming.farmBounds.corner2.y
        ),
        z: this.parseEnvNumber(
          env.FARM_CORNER2_Z,
          updatedConfig.areas.farming.farmBounds.corner2.z
        ),
      };
      overrideCount++;
    }

    if (env.WATER_SOURCE_X || env.WATER_SOURCE_Y || env.WATER_SOURCE_Z) {
      updatedConfig.areas.farming.waterSource = {
        x: this.parseEnvNumber(
          env.WATER_SOURCE_X,
          updatedConfig.areas.farming.waterSource.x
        ),
        y: this.parseEnvNumber(
          env.WATER_SOURCE_Y,
          updatedConfig.areas.farming.waterSource.y
        ),
        z: this.parseEnvNumber(
          env.WATER_SOURCE_Z,
          updatedConfig.areas.farming.waterSource.z
        ),
      };
      overrideCount++;
    }

    if (env.COAST_POSITION_X || env.COAST_POSITION_Y || env.COAST_POSITION_Z) {
      updatedConfig.areas.farming.coastPosition = {
        x: this.parseEnvNumber(
          env.COAST_POSITION_X,
          updatedConfig.areas.farming.coastPosition.x
        ),
        y: this.parseEnvNumber(
          env.COAST_POSITION_Y,
          updatedConfig.areas.farming.coastPosition.y
        ),
        z: this.parseEnvNumber(
          env.COAST_POSITION_Z,
          updatedConfig.areas.farming.coastPosition.z
        ),
      };
      overrideCount++;
    }

    if (env.HOUSE_POSITION_X || env.HOUSE_POSITION_Y || env.HOUSE_POSITION_Z) {
      updatedConfig.areas.farming.housePosition = {
        x: this.parseEnvNumber(
          env.HOUSE_POSITION_X,
          updatedConfig.areas.farming.housePosition.x
        ),
        y: this.parseEnvNumber(
          env.HOUSE_POSITION_Y,
          updatedConfig.areas.farming.housePosition.y
        ),
        z: this.parseEnvNumber(
          env.HOUSE_POSITION_Z,
          updatedConfig.areas.farming.housePosition.z
        ),
      };
      overrideCount++;
    }

    // Apply entity ID overrides
    if (env.RIGHT_CHEST_ENTITY_ID) {
      updatedConfig.entities.chests.rightChest = env.RIGHT_CHEST_ENTITY_ID;
      overrideCount++;
    }

    if (env.LEFT_CHEST_ENTITY_ID) {
      if (!updatedConfig.entities.chests.leftChest) {
        updatedConfig.entities.chests.leftChest = env.LEFT_CHEST_ENTITY_ID;
      } else {
        updatedConfig.entities.chests.leftChest = env.LEFT_CHEST_ENTITY_ID;
      }
      overrideCount++;
    }

    if (env.PRIMARY_FORCE_FIELD_ID) {
      if (!updatedConfig.entities.forceFields) {
        updatedConfig.entities.forceFields = {};
      }
      updatedConfig.entities.forceFields.primaryForceField =
        env.PRIMARY_FORCE_FIELD_ID;
      overrideCount++;
    }

    // Apply parameter overrides
    if (env.LOCATION_THRESHOLD) {
      updatedConfig.parameters.locationThreshold = this.parseEnvNumber(
        env.LOCATION_THRESHOLD,
        updatedConfig.parameters.locationThreshold
      );
      overrideCount++;
    }

    if (
      env.TARGET_BUCKETS ||
      env.TARGET_SEEDS ||
      env.TARGET_WHEAT ||
      env.LOW_ENERGY_THRESHOLD
    ) {
      if (!updatedConfig.parameters.farming) {
        updatedConfig.parameters.farming = {};
      }

      if (env.TARGET_BUCKETS) {
        updatedConfig.parameters.farming.targetBuckets = this.parseEnvNumber(
          env.TARGET_BUCKETS,
          DEFAULT_CONFIG_VALUES.parameters.farming.targetBuckets
        );
        overrideCount++;
      }
      if (env.TARGET_SEEDS) {
        updatedConfig.parameters.farming.targetSeeds = this.parseEnvNumber(
          env.TARGET_SEEDS,
          DEFAULT_CONFIG_VALUES.parameters.farming.targetSeeds
        );
        overrideCount++;
      }
      if (env.TARGET_WHEAT) {
        updatedConfig.parameters.farming.targetWheat = this.parseEnvNumber(
          env.TARGET_WHEAT,
          DEFAULT_CONFIG_VALUES.parameters.farming.targetWheat
        );
        overrideCount++;
      }
      if (env.LOW_ENERGY_THRESHOLD) {
        updatedConfig.parameters.farming.lowEnergyThreshold =
          this.parseEnvNumber(
            env.LOW_ENERGY_THRESHOLD,
            DEFAULT_CONFIG_VALUES.parameters.farming.lowEnergyThreshold
          );
        overrideCount++;
      }
    }

    if (env.TARGET_BATTERIES || env.TREE_CHOP_RADIUS) {
      if (!updatedConfig.parameters.energize) {
        updatedConfig.parameters.energize = {};
      }

      if (env.TARGET_BATTERIES) {
        updatedConfig.parameters.energize.targetBatteries = this.parseEnvNumber(
          env.TARGET_BATTERIES,
          DEFAULT_CONFIG_VALUES.parameters.energize.targetBatteries
        );
        overrideCount++;
      }
      if (env.TREE_CHOP_RADIUS) {
        updatedConfig.parameters.energize.treeChopRadius = this.parseEnvNumber(
          env.TREE_CHOP_RADIUS,
          DEFAULT_CONFIG_VALUES.parameters.energize.treeChopRadius
        );
        overrideCount++;
      }
    }

    return updatedConfig;
  }

  /**
   * Parse environment variable as number with fallback
   */
  private parseEnvNumber(
    envValue: string | undefined,
    fallback: number
  ): number {
    if (!envValue) return fallback;
    const parsed = Number(envValue);
    if (isNaN(parsed)) {
      console.warn(
        `⚠️ Invalid number in environment variable: ${envValue}, using fallback: ${fallback}`
      );
      return fallback;
    }
    return parsed;
  }

  /**
   * Validate configuration structure and values
   */
  private validateConfig(
    config: OperationalConfig,
  ): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!config.version) errors.push("Configuration version is required");
    if (!config.name) errors.push("Configuration name is required");
    if (!config.areas) errors.push("Configuration areas are required");
    if (!config.entities) errors.push("Configuration entities are required");
    if (!config.parameters)
      errors.push("Configuration parameters are required");

    // Validate version format (semantic versioning)
    if (config.version && !/^\d+\.\d+\.\d+$/.test(config.version)) {
      errors.push("Version must follow semantic versioning (e.g., '1.0.0')");
    }

    // Validate farming areas
    if (config.areas?.farming) {
      if (!this.isValidPosition(config.areas.farming.farmCenter)) {
        errors.push("Farm center must have valid x, y, z coordinates");
      }
      if (
        !this.isValidPosition(config.areas.farming.farmBounds?.corner1) ||
        !this.isValidPosition(config.areas.farming.farmBounds?.corner2)
      ) {
        errors.push("Farm bounds must have valid corner coordinates");
      }
      if (!this.isValidPosition(config.areas.farming.waterSource)) {
        errors.push("Water source must have valid x, y, z coordinates");
      }
      if (!this.isValidPosition(config.areas.farming.coastPosition)) {
        errors.push("Coast position must have valid x, y, z coordinates");
      }
      if (!this.isValidPosition(config.areas.farming.housePosition)) {
        errors.push("House position must have valid x, y, z coordinates");
      }
    } else {
      errors.push("Farming areas configuration is required");
    }

    // Validate energize areas if required
      if (!config.areas?.energize) {
        errors.push("Energize areas are required but not configured");
      } else {
        if (
          !this.isValidPosition(
            config.areas.energize.treeFarmBounds?.corner1
          ) ||
          !this.isValidPosition(config.areas.energize.treeFarmBounds?.corner2)
        ) {
          errors.push("Tree farm bounds must have valid corner coordinates");
        }
        if (!this.isValidPosition(config.areas.energize.powerStoneLocation)) {
          errors.push(
            "Power stone location must have valid x, y, z coordinates"
          );
        }
      }

    // Validate entity IDs
    if (config.entities?.chests) {
      if (!this.isValidEntityId(config.entities.chests.rightChest)) {
        errors.push(
          "Right chest entity ID must be a valid 64-character hex string starting with 0x"
        );
      }
      if (
        config.entities.chests.leftChest &&
        !this.isValidEntityId(config.entities.chests.leftChest)
      ) {
        warnings.push("Left chest entity ID is invalid");
      }
    } else {
      errors.push("Chest entities configuration is required");
    }

    // Validate parameters
    if (config.parameters) {
      if (
        typeof config.parameters.locationThreshold !== "number" ||
        config.parameters.locationThreshold < 0.1 ||
        config.parameters.locationThreshold > 50
      ) {
        errors.push("Location threshold must be a number between 0.1 and 50");
      }

      // Validate farming parameters
      if (config.parameters.farming) {
        const farming = config.parameters.farming;
        if (
          farming.targetBuckets !== undefined &&
          (farming.targetBuckets < 1 || farming.targetBuckets > 40)
        ) {
          warnings.push("Target buckets should be between 1 and 40");
        }
        if (
          farming.targetSeeds !== undefined &&
          (farming.targetSeeds < 1 || farming.targetSeeds > 99)
        ) {
          warnings.push("Target seeds should be between 1 and 99");
        }
        if (
          farming.targetWheat !== undefined &&
          (farming.targetWheat < 1 || farming.targetWheat > 99)
        ) {
          warnings.push("Target wheat should be between 1 and 99");
        }
        if (
          farming.lowEnergyThreshold !== undefined &&
          (farming.lowEnergyThreshold < 0.01 ||
            farming.lowEnergyThreshold > 0.99)
        ) {
          warnings.push("Low energy threshold should be between 0.01 and 0.99");
        }
      }
    } else {
      errors.push("Parameters configuration is required");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if position has valid coordinates
   */
  private isValidPosition(pos: Position3D | undefined): boolean {
    return (
      pos !== undefined &&
      typeof pos.x === "number" &&
      typeof pos.y === "number" &&
      typeof pos.z === "number" &&
      !isNaN(pos.x) &&
      !isNaN(pos.y) &&
      !isNaN(pos.z)
    );
  }

  /**
   * Check if entity ID is valid hex string
   */
  private isValidEntityId(entityId: string | undefined): boolean {
    if (!entityId) return false;
    return /^0x[0-9a-fA-F]{64}$/.test(entityId);
  }

  /**
   * Resolve default values for optional parameters
   */
  private resolveDefaults(
    config: OperationalConfig
  ): ResolvedOperationalConfig {
    const resolved = JSON.parse(
      JSON.stringify(config)
    ) as ResolvedOperationalConfig;

    // Apply farming parameter defaults
    resolved.parameters.farming = {
      targetBuckets:
        config.parameters.farming?.targetBuckets ??
        DEFAULT_CONFIG_VALUES.parameters.farming.targetBuckets,
      targetSeeds:
        config.parameters.farming?.targetSeeds ??
        DEFAULT_CONFIG_VALUES.parameters.farming.targetSeeds,
      targetWheat:
        config.parameters.farming?.targetWheat ??
        DEFAULT_CONFIG_VALUES.parameters.farming.targetWheat,
      lowEnergyThreshold:
        config.parameters.farming?.lowEnergyThreshold ??
        DEFAULT_CONFIG_VALUES.parameters.farming.lowEnergyThreshold,
    };

    // Apply energize parameter defaults
    resolved.parameters.energize = {
      targetBatteries:
        config.parameters.energize?.targetBatteries ??
        DEFAULT_CONFIG_VALUES.parameters.energize.targetBatteries,
      treeChopRadius:
        config.parameters.energize?.treeChopRadius ??
        DEFAULT_CONFIG_VALUES.parameters.energize.treeChopRadius,
    };

    return resolved;
  }
}

/**
 * Convenience function to load configuration
 */
export async function loadOperationalConfig(
  options?: ConfigLoadOptions
): Promise<ResolvedOperationalConfig> {
  const loader = ConfigLoader.getInstance();
  return await loader.loadConfig(options);
}

/**
 * Convenience function to get current configuration
 */
export function getOperationalConfig(): ResolvedOperationalConfig {
  const loader = ConfigLoader.getInstance();
  return loader.getConfig();
}
