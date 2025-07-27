import { Vec3, EntityId } from "../types/base.js";

/**
 * 3D position coordinate
 */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Rectangular area boundaries defined by two corners
 */
export interface AreaBounds {
  corner1: Position3D;
  corner2: Position3D;
}

/**
 * Farming operation areas and coordinates
 */
export interface FarmingAreas {
  farmCenter: Position3D;
  farmBounds: AreaBounds;
  waterSource: Position3D;
  coastPosition: Position3D;
  housePosition: Position3D;
}

/**
 * Energy/tree operation areas
 */
export interface EnergizeAreas {
  treeFarmBounds: AreaBounds;
  powerStoneLocation: Position3D;
  plantingBlockType?: "Grass" | "Dirt" | "Moss"; // Block type to plant saplings on, defaults to "Dirt"
}

/**
 * All operational area definitions
 */
export interface OperationalAreas {
  farming: FarmingAreas;
  energize?: EnergizeAreas; // Optional for configurations that only need farming
}

/**
 * Storage chest entity configurations
 */
export interface ChestEntities {
  rightChest: EntityId;
  leftChest?: EntityId; // Optional secondary chest
}

/**
 * Force field entity configurations for energy operations
 */
export interface ForceFieldEntities {
  primaryForceField?: EntityId;
}

/**
 * Game entity IDs for chests, force fields, etc.
 */
export interface GameEntities {
  chests: ChestEntities;
  forceFields?: ForceFieldEntities;
}

/**
 * Farming-specific operational parameters
 */
export interface FarmingParameters {
  targetBuckets?: number; // Default: 34
  targetSeeds?: number; // Default: 99
  targetWheat?: number; // Default: 99
  lowEnergyThreshold?: number; // Default: 0.25 (25%)
}

/**
 * Energy operation parameters
 */
export interface EnergizeParameters {
  targetBatteries?: number; // Default: 10
  treeChopRadius?: number; // Default: 10
}

/**
 * Operational parameters and thresholds
 */
export interface OperationalParameters {
  locationThreshold: number; // Required, default: 1
  farming?: FarmingParameters;
  energize?: EnergizeParameters;
}

/**
 * Complete operational configuration structure
 */
export interface OperationalConfig {
  version: string; // Semantic versioning (e.g., "1.0.0")
  name: string; // Human-readable configuration name
  description?: string; // Optional description
  areas: OperationalAreas;
  entities: GameEntities;
  parameters: OperationalParameters;
}

/**
 * Configuration with resolved defaults applied
 */
export interface ResolvedOperationalConfig extends OperationalConfig {
  parameters: OperationalParameters & {
    farming: Required<FarmingParameters>;
    energize: Required<EnergizeParameters>;
  };
}

/**
 * Configuration loading options
 */
export interface ConfigLoadOptions {
  configPath?: string; // Path to config file (default: ./config/operational.json)
  validateSchema?: boolean; // Whether to validate against JSON schema (default: true)
  allowEnvironmentOverrides?: boolean; // Allow env var overrides (default: true)
  requireEnergizeAreas?: boolean; // Whether energize areas are required (default: false)
}

/**
 * Environment variable override mapping
 */
export interface EnvironmentOverrides {
  // Farm areas
  FARM_CENTER_X?: string;
  FARM_CENTER_Y?: string;
  FARM_CENTER_Z?: string;
  FARM_CORNER1_X?: string;
  FARM_CORNER1_Y?: string;
  FARM_CORNER1_Z?: string;
  FARM_CORNER2_X?: string;
  FARM_CORNER2_Y?: string;
  FARM_CORNER2_Z?: string;
  WATER_SOURCE_X?: string;
  WATER_SOURCE_Y?: string;
  WATER_SOURCE_Z?: string;
  COAST_POSITION_X?: string;
  COAST_POSITION_Y?: string;
  COAST_POSITION_Z?: string;
  HOUSE_POSITION_X?: string;
  HOUSE_POSITION_Y?: string;
  HOUSE_POSITION_Z?: string;

  // Entity IDs
  RIGHT_CHEST_ENTITY_ID?: string;
  LEFT_CHEST_ENTITY_ID?: string;
  PRIMARY_FORCE_FIELD_ID?: string;

  // Parameters
  LOCATION_THRESHOLD?: string;
  TARGET_BUCKETS?: string;
  TARGET_SEEDS?: string;
  TARGET_WHEAT?: string;
  LOW_ENERGY_THRESHOLD?: string;
  TARGET_BATTERIES?: string;
  TREE_CHOP_RADIUS?: string;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG_VALUES = {
  parameters: {
    locationThreshold: 1,
    farming: {
      targetBuckets: 34,
      targetSeeds: 99,
      targetWheat: 99,
      lowEnergyThreshold: 0.25,
    },
    energize: {
      targetBatteries: 10,
      treeChopRadius: 10,
    },
  },
} as const;
