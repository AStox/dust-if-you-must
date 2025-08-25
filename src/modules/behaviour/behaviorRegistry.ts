import { IBehaviorMode, BehaviorModeConfig } from "./behaviorMode.js";
import { DustBot } from "../../index.js";

/**
 * Registry for managing multiple behavior modes
 * Provides centralized registration, retrieval, and lifecycle management
 */
export class BehaviorRegistry {
  private modes: Map<string, IBehaviorMode> = new Map();
  private config: BehaviorModeConfig;

  constructor(config: BehaviorModeConfig = {}) {
    this.config = config;
  }

  /**
   * Register a behavior mode with the registry
   * @param mode - The behavior mode to register
   * @throws Error if a mode with the same name is already registered
   */
  register(mode: IBehaviorMode): void {
    if (this.modes.has(mode.name)) {
      throw new Error(`Behavior mode '${mode.name}' is already registered`);
    }

    this.modes.set(mode.name, mode);
    console.log(
      `📝 Registered behavior mode: ${
        mode.name
      } (priority: ${mode.getPriority()})`
    );
  }

  /**
   * Unregister a behavior mode from the registry
   * @param name - Name of the behavior mode to unregister
   * @returns boolean - true if mode was found and removed, false otherwise
   */
  unregister(name: string): boolean {
    const removed = this.modes.delete(name);
    if (removed) {
      console.log(`🗑️ Unregistered behavior mode: ${name}`);
    }
    return removed;
  }

  /**
   * Get a specific behavior mode by name
   * @param name - Name of the behavior mode to retrieve
   * @returns IBehaviorMode | undefined - The mode if found, undefined otherwise
   */
  getMode(name: string): IBehaviorMode | undefined {
    return this.modes.get(name);
  }

  /**
   * Get all registered behavior modes
   * @returns IBehaviorMode[] - Array of all registered modes
   */
  getAllModes(): IBehaviorMode[] {
    return Array.from(this.modes.values());
  }

  /**
   * Get all available behavior modes (modes that can currently operate)
   * @param bot - The bot instance to check availability against
   * @returns Promise<IBehaviorMode[]> - Array of available modes
   */
  async getAvailableModes(bot: DustBot): Promise<IBehaviorMode[]> {
    const availableModes: IBehaviorMode[] = [];

    for (const mode of this.modes.values()) {
      try {
        const isAvailable = await mode.isAvailable(bot.state);
        if (isAvailable) {
          availableModes.push(mode);
        }
      } catch (error) {
        console.warn(
          `⚠️ Error checking availability for mode ${mode.name}:`,
          error
        );
      }
    }

    return availableModes;
  }

  /**
   * Get modes sorted by priority (highest first)
   * @returns IBehaviorMode[] - Array of modes sorted by priority
   */
  getModesByPriority(): IBehaviorMode[] {
    return Array.from(this.modes.values()).sort(
      (a, b) => b.getPriority() - a.getPriority()
    );
  }

  /**
   * Get available modes sorted by priority
   * @param bot - The bot instance to check availability against
   * @returns Promise<IBehaviorMode[]> - Array of available modes sorted by priority
   */
  async getAvailableModesByPriority(bot: DustBot): Promise<IBehaviorMode[]> {
    const availableModes = await this.getAvailableModes(bot);
    return availableModes.sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * Check if a behavior mode is registered
   * @param name - Name of the behavior mode to check
   * @returns boolean - true if registered, false otherwise
   */
  isRegistered(name: string): boolean {
    return this.modes.has(name);
  }

  /**
   * Get the count of registered behavior modes
   * @returns number - Number of registered modes
   */
  getCount(): number {
    return this.modes.size;
  }

  /**
   * Get names of all registered behavior modes
   * @returns string[] - Array of mode names
   */
  getRegisteredNames(): string[] {
    return Array.from(this.modes.keys());
  }

  /**
   * Clear all registered behavior modes
   */
  clear(): void {
    const count = this.modes.size;
    this.modes.clear();
    console.log(`🧹 Cleared ${count} behavior modes from registry`);
  }

  /**
   * Get configuration for the registry
   * @returns BehaviorModeConfig - Current configuration
   */
  getConfig(): BehaviorModeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration for the registry
   * @param config - New configuration to merge
   */
  updateConfig(config: Partial<BehaviorModeConfig>): void {
    this.config = { ...this.config, ...config };
    console.log("⚙️ Updated behavior registry configuration");
  }

  /**
   * Get registry status and information
   * @returns object - Registry status information
   */
  getStatus(): {
    totalModes: number;
    registeredModes: string[];
    modesByPriority: Array<{ name: string; priority: number }>;
  } {
    const modesByPriority = this.getModesByPriority().map((mode) => ({
      name: mode.name,
      priority: mode.getPriority(),
    }));

    return {
      totalModes: this.getCount(),
      registeredModes: this.getRegisteredNames(),
      modesByPriority,
    };
  }

  /**
   * Log current registry status to console
   */
  logStatus(): void {
    const status = this.getStatus();
    console.log("\n📋 Behavior Registry Status:");
    console.log(`  Total modes: ${status.totalModes}`);
    console.log("  Registered modes:");
    status.modesByPriority.forEach((mode) => {
      console.log(`    - ${mode.name} (priority: ${mode.priority})`);
    });
  }
}

/**
 * Global behavior registry instance
 * Can be used as a singleton across the application
 */
export const globalBehaviorRegistry = new BehaviorRegistry();
