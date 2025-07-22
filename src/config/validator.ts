import {
  OperationalConfig,
  ConfigValidationResult,
  Position3D,
  AreaBounds,
} from "./types.js";

/**
 * Enhanced configuration validator with detailed error messages and suggestions
 */
export class ConfigValidator {
  /**
   * Perform comprehensive validation of operational configuration
   */
  public static validate(
    config: OperationalConfig,
    requireEnergizeAreas: boolean = false
  ): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate top-level structure
    this.validateTopLevel(config, errors);

    // Validate areas
    if (config.areas) {
      this.validateAreas(config.areas, errors, warnings, requireEnergizeAreas);
    }

    // Validate entities
    if (config.entities) {
      this.validateEntities(config.entities, errors, warnings);
    }

    // Validate parameters
    if (config.parameters) {
      this.validateParameters(config.parameters, errors, warnings);
    }

    // Cross-validation checks
    this.performCrossValidation(config, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate top-level required fields
   */
  private static validateTopLevel(
    config: OperationalConfig,
    errors: string[]
  ): void {
    if (!config.version) {
      errors.push(
        '❌ Configuration version is required. Add: "version": "1.0.0"'
      );
    } else if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
      errors.push(
        `❌ Version "${config.version}" must follow semantic versioning format (e.g., "1.0.0", "2.1.3")`
      );
    }

    if (!config.name) {
      errors.push(
        '❌ Configuration name is required. Add: "name": "My Farm Setup"'
      );
    } else if (config.name.length < 3) {
      errors.push(
        `❌ Configuration name "${config.name}" is too short. Use a descriptive name (min 3 characters)`
      );
    }

    if (!config.areas) {
      errors.push(
        '❌ Areas configuration is required. Add an "areas" section with farming coordinates'
      );
    }

    if (!config.entities) {
      errors.push(
        '❌ Entities configuration is required. Add an "entities" section with chest IDs'
      );
    }

    if (!config.parameters) {
      errors.push(
        '❌ Parameters configuration is required. Add a "parameters" section with locationThreshold'
      );
    }
  }

  /**
   * Validate operational areas
   */
  private static validateAreas(
    areas: any,
    errors: string[],
    warnings: string[],
    requireEnergizeAreas: boolean
  ): void {
    // Validate farming areas (required)
    if (!areas.farming) {
      errors.push(
        '❌ Farming areas are required. Add a "farming" section under "areas" with farm coordinates'
      );
    } else {
      this.validateFarmingAreas(areas.farming, errors, warnings);
    }

    // Validate energize areas (optional unless required)
    if (requireEnergizeAreas) {
      if (!areas.energize) {
        errors.push(
          '❌ Energize areas are required for this configuration. Add an "energize" section under "areas"'
        );
      } else {
        this.validateEnergizeAreas(areas.energize, errors, warnings);
      }
    } else if (areas.energize) {
      this.validateEnergizeAreas(areas.energize, errors, warnings);
    }
  }

  /**
   * Validate farming area coordinates
   */
  private static validateFarmingAreas(
    farming: any,
    errors: string[],
    warnings: string[]
  ): void {
    // Farm center
    if (!this.isValidPosition(farming.farmCenter)) {
      errors.push(
        '❌ Farm center coordinates are invalid. Example: "farmCenter": {"x": -401, "y": 72, "z": 483}'
      );
    }

    // Farm bounds
    if (!farming.farmBounds) {
      errors.push(
        '❌ Farm bounds are required. Add: "farmBounds": {"corner1": {"x": -405, "y": 72, "z": 479}, "corner2": {"x": -398, "y": 72, "z": 486}}'
      );
    } else {
      if (!this.isValidPosition(farming.farmBounds.corner1)) {
        errors.push(
          "❌ Farm bounds corner1 coordinates are invalid. Must have valid x, y, z coordinates"
        );
      }
      if (!this.isValidPosition(farming.farmBounds.corner2)) {
        errors.push(
          "❌ Farm bounds corner2 coordinates are invalid. Must have valid x, y, z coordinates"
        );
      }

      // Validate farm area makes sense
      if (
        this.isValidPosition(farming.farmBounds.corner1) &&
        this.isValidPosition(farming.farmBounds.corner2)
      ) {
        this.validateFarmBounds(farming.farmBounds, warnings);
      }
    }

    // Water source
    if (!this.isValidPosition(farming.waterSource)) {
      errors.push(
        '❌ Water source coordinates are invalid. Example: "waterSource": {"x": -444, "y": 62, "z": 489}'
      );
    }

    // Coast position
    if (!this.isValidPosition(farming.coastPosition)) {
      errors.push(
        '❌ Coast position coordinates are invalid. Example: "coastPosition": {"x": -443, "y": 63, "z": 489}'
      );
    }

    // House position
    if (!this.isValidPosition(farming.housePosition)) {
      errors.push(
        '❌ House position coordinates are invalid. Example: "housePosition": {"x": -401, "y": 72, "z": 489}'
      );
    }

    // Cross-validate farming area relationships
    if (
      this.isValidPosition(farming.farmCenter) &&
      this.isValidPosition(farming.waterSource) &&
      this.isValidPosition(farming.coastPosition) &&
      this.isValidPosition(farming.housePosition)
    ) {
      this.validateFarmingAreaProximity(farming, warnings);
    }
  }

  /**
   * Validate energize area coordinates
   */
  private static validateEnergizeAreas(
    energize: any,
    errors: string[],
    warnings: string[]
  ): void {
    if (!energize.treeFarmBounds) {
      errors.push(
        '❌ Tree farm bounds are required. Add: "treeFarmBounds": {"corner1": {...}, "corner2": {...}}'
      );
    } else {
      if (!this.isValidPosition(energize.treeFarmBounds.corner1)) {
        errors.push("❌ Tree farm bounds corner1 coordinates are invalid");
      }
      if (!this.isValidPosition(energize.treeFarmBounds.corner2)) {
        errors.push("❌ Tree farm bounds corner2 coordinates are invalid");
      }
    }

    if (!this.isValidPosition(energize.powerStoneLocation)) {
      errors.push(
        '❌ Power stone location coordinates are invalid. Example: "powerStoneLocation": {"x": -320, "y": 75, "z": 420}'
      );
    }
  }

  /**
   * Validate entity IDs
   */
  private static validateEntities(
    entities: any,
    errors: string[],
    warnings: string[]
  ): void {
    if (!entities.chests) {
      errors.push(
        '❌ Chest entities are required. Add: "chests": {"rightChest": "0x..."}'
      );
    } else {
      if (!this.isValidEntityId(entities.chests.rightChest)) {
        errors.push(
          '❌ Right chest entity ID is invalid. Must be a 66-character hex string starting with \'0x\'. Example: "rightChest": "0x03fffffe7300000049000001e300000000000000000000000000000000000000"'
        );
      }

      if (
        entities.chests.leftChest &&
        !this.isValidEntityId(entities.chests.leftChest)
      ) {
        warnings.push(
          "⚠️ Left chest entity ID is invalid. It should be a 66-character hex string starting with '0x'"
        );
      }
    }

    if (
      entities.forceFields?.primaryForceField &&
      !this.isValidEntityId(entities.forceFields.primaryForceField)
    ) {
      warnings.push(
        "⚠️ Primary force field entity ID is invalid. It should be a 66-character hex string starting with '0x'"
      );
    }
  }

  /**
   * Validate operational parameters
   */
  private static validateParameters(
    parameters: any,
    errors: string[],
    warnings: string[]
  ): void {
    // Location threshold
    if (typeof parameters.locationThreshold !== "number") {
      errors.push(
        '❌ Location threshold must be a number. Example: "locationThreshold": 1'
      );
    } else if (
      parameters.locationThreshold < 0.1 ||
      parameters.locationThreshold > 50
    ) {
      errors.push(
        `❌ Location threshold ${parameters.locationThreshold} is out of range. Must be between 0.1 and 50 blocks`
      );
    }

    // Farming parameters
    if (parameters.farming) {
      const farming = parameters.farming;

      if (farming.targetBuckets !== undefined) {
        if (
          typeof farming.targetBuckets !== "number" ||
          !Number.isInteger(farming.targetBuckets)
        ) {
          errors.push("❌ Target buckets must be an integer");
        } else if (farming.targetBuckets < 1 || farming.targetBuckets > 40) {
          warnings.push(
            `⚠️ Target buckets ${farming.targetBuckets} should be between 1 and 40 (inventory limit)`
          );
        }
      }

      if (farming.targetSeeds !== undefined) {
        if (
          typeof farming.targetSeeds !== "number" ||
          !Number.isInteger(farming.targetSeeds)
        ) {
          errors.push("❌ Target seeds must be an integer");
        } else if (farming.targetSeeds < 1 || farming.targetSeeds > 99) {
          warnings.push(
            `⚠️ Target seeds ${farming.targetSeeds} should be between 1 and 99 (stack limit)`
          );
        }
      }

      if (farming.targetWheat !== undefined) {
        if (
          typeof farming.targetWheat !== "number" ||
          !Number.isInteger(farming.targetWheat)
        ) {
          errors.push("❌ Target wheat must be an integer");
        } else if (farming.targetWheat < 1 || farming.targetWheat > 99) {
          warnings.push(
            `⚠️ Target wheat ${farming.targetWheat} should be between 1 and 99 (stack limit)`
          );
        }
      }

      if (farming.lowEnergyThreshold !== undefined) {
        if (typeof farming.lowEnergyThreshold !== "number") {
          errors.push(
            "❌ Low energy threshold must be a number (decimal between 0 and 1)"
          );
        } else if (
          farming.lowEnergyThreshold < 0.01 ||
          farming.lowEnergyThreshold > 0.99
        ) {
          warnings.push(
            `⚠️ Low energy threshold ${farming.lowEnergyThreshold} should be between 0.01 (1%) and 0.99 (99%)`
          );
        }
      }
    }

    // Energize parameters
    if (parameters.energize) {
      const energize = parameters.energize;

      if (energize.targetBatteries !== undefined) {
        if (
          typeof energize.targetBatteries !== "number" ||
          !Number.isInteger(energize.targetBatteries)
        ) {
          errors.push("❌ Target batteries must be an integer");
        } else if (
          energize.targetBatteries < 1 ||
          energize.targetBatteries > 99
        ) {
          warnings.push(
            `⚠️ Target batteries ${energize.targetBatteries} should be between 1 and 99`
          );
        }
      }

      if (energize.treeChopRadius !== undefined) {
        if (typeof energize.treeChopRadius !== "number") {
          errors.push("❌ Tree chop radius must be a number");
        } else if (
          energize.treeChopRadius < 1 ||
          energize.treeChopRadius > 50
        ) {
          warnings.push(
            `⚠️ Tree chop radius ${energize.treeChopRadius} should be between 1 and 50 blocks`
          );
        }
      }
    }
  }

  /**
   * Perform cross-validation checks between different parts of config
   */
  private static performCrossValidation(
    config: OperationalConfig,
    errors: string[],
    warnings: string[]
  ): void {
    if (!config.areas?.farming) return;

    const farming = config.areas.farming;

    // Check if farm center is within farm bounds
    if (
      this.isValidPosition(farming.farmCenter) &&
      farming.farmBounds &&
      this.isValidPosition(farming.farmBounds.corner1) &&
      this.isValidPosition(farming.farmBounds.corner2)
    ) {
      const bounds = farming.farmBounds;
      const center = farming.farmCenter;
      const minX = Math.min(bounds.corner1.x, bounds.corner2.x);
      const maxX = Math.max(bounds.corner1.x, bounds.corner2.x);
      const minZ = Math.min(bounds.corner1.z, bounds.corner2.z);
      const maxZ = Math.max(bounds.corner1.z, bounds.corner2.z);

      if (
        center.x < minX ||
        center.x > maxX ||
        center.z < minZ ||
        center.z > maxZ
      ) {
        warnings.push(
          "⚠️ Farm center is outside farm bounds. This may cause navigation issues"
        );
      }
    }

    // Check if water source and coast position are close together
    if (
      this.isValidPosition(farming.waterSource) &&
      this.isValidPosition(farming.coastPosition)
    ) {
      const distance = this.calculateDistance(
        farming.waterSource,
        farming.coastPosition
      );
      if (distance > 10) {
        warnings.push(
          `⚠️ Water source and coast position are ${distance.toFixed(
            1
          )} blocks apart. Consider placing them closer for efficiency`
        );
      }
    }
  }

  /**
   * Validate farm bounds make sense
   */
  private static validateFarmBounds(
    bounds: AreaBounds,
    warnings: string[]
  ): void {
    const corner1 = bounds.corner1;
    const corner2 = bounds.corner2;

    // Check if farm area is reasonable size
    const width = Math.abs(corner2.x - corner1.x) + 1;
    const length = Math.abs(corner2.z - corner1.z) + 1;
    const area = width * length;

    if (area < 4) {
      warnings.push(
        `⚠️ Farm area is very small (${width}x${length} = ${area} plots). Consider expanding for better efficiency`
      );
    } else if (area > 200) {
      warnings.push(
        `⚠️ Farm area is very large (${width}x${length} = ${area} plots). This may cause performance issues`
      );
    }

    // Check if Y coordinates match
    if (corner1.y !== corner2.y) {
      warnings.push(
        `⚠️ Farm corners have different Y coordinates (${corner1.y} vs ${corner2.y}). Farm should be on a flat surface`
      );
    }
  }

  /**
   * Validate proximity of farming areas
   */
  private static validateFarmingAreaProximity(
    farming: any,
    warnings: string[]
  ): void {
    const farmCenter = farming.farmCenter;
    const housePos = farming.housePosition;
    const coastPos = farming.coastPosition;

    // Check distance from farm to house
    const farmToHouse = this.calculateDistance(farmCenter, housePos);
    if (farmToHouse > 50) {
      warnings.push(
        `⚠️ Farm is ${farmToHouse.toFixed(
          1
        )} blocks from house. Consider closer placement for efficiency`
      );
    }

    // Check distance from house to coast
    const houseToCoast = this.calculateDistance(housePos, coastPos);
    if (houseToCoast > 30) {
      warnings.push(
        `⚠️ House is ${houseToCoast.toFixed(
          1
        )} blocks from coast. Consider closer placement for water collection`
      );
    }
  }

  /**
   * Check if position has valid coordinates
   */
  private static isValidPosition(pos: Position3D | undefined): boolean {
    return (
      pos !== undefined &&
      typeof pos.x === "number" &&
      typeof pos.y === "number" &&
      typeof pos.z === "number" &&
      !isNaN(pos.x) &&
      !isNaN(pos.y) &&
      !isNaN(pos.z) &&
      Number.isInteger(pos.x) &&
      Number.isInteger(pos.y) &&
      Number.isInteger(pos.z)
    );
  }

  /**
   * Check if entity ID is valid hex string
   */
  private static isValidEntityId(entityId: string | undefined): boolean {
    if (!entityId) return false;
    return /^0x[0-9a-fA-F]{64}$/.test(entityId);
  }

  /**
   * Calculate 3D distance between two positions
   */
  private static calculateDistance(pos1: Position3D, pos2: Position3D): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

/**
 * Generate a helpful configuration validation report
 */
export function generateValidationReport(
  result: ConfigValidationResult
): string {
  const lines: string[] = [];

  lines.push("🔍 Configuration Validation Report");
  lines.push("=".repeat(50));

  if (result.isValid) {
    lines.push("✅ Configuration is valid!");
  } else {
    lines.push("❌ Configuration has errors that must be fixed:");
    lines.push("");
    result.errors.forEach((error, index) => {
      lines.push(`${index + 1}. ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("⚠️ Warnings (optional improvements):");
    lines.push("");
    result.warnings.forEach((warning, index) => {
      lines.push(`${index + 1}. ${warning}`);
    });
  }

  if (!result.isValid) {
    lines.push("");
    lines.push("💡 Tips for fixing configuration:");
    lines.push('- Check coordinate formats: {"x": 123, "y": 45, "z": 678}');
    lines.push(
      "- Verify entity IDs are 66-character hex strings starting with '0x'"
    );
    lines.push("- Ensure all required fields are present");
    lines.push("- Use integer coordinates for positions");
  }

  return lines.join("\n");
}
