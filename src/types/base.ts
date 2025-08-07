export type EntityId = string; // bytes32 as hex string

export interface InventoryItem {
  type: number;
  amount: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface SlotAmount {
  slot: number;
  amount: number;
}

// Contract function signatures for encoding
export interface DustWorldFunctions {
  activate: string;
  fillBucket: string;
  wetFarmland: string;
  mine: string;
  build: string;
  craft: string;
  move: string;
}

// Function selectors (first 4 bytes of keccak256 hash)
export const FUNCTION_SELECTORS = {
  activate: "0x0f15f4c0",
  move: "0x803ba26d", // This might need to be updated with actual selector
  fillBucket: "0xa0b7bf44",
  wetFarmland: "0x2e1a7d4d",
  mine: "0xa8b8c58d",
  build: "0x6ea5b24e",
  craft: "0x37c8dabe",
} as const;

export interface BotState {
  location: "coast" | "house" | "farm" | "unknown";
  position: Vec3;
  energy: number;
  emptyBuckets: number;
  waterBuckets: number;
  wheatSeeds: number;
  wheat: number;
  slop: number;
  unwateredPlots: number;
  unseededPlots: number;
  ungrownPlots: number;
  unharvestedPlots: number;
  totalPlots: number;
  inventory: InventoryItem[];
  chestInventory: InventoryItem[];
}

export interface UtilityAction {
  name: string;
  calculateScore(state: BotState): number;
  execute(bot: any, state?: BotState): Promise<void>; // Using any to avoid circular import, state is optional for backward compatibility
  canExecute(state: BotState): boolean;
}
