#!/usr/bin/env tsx

import { BehaviorRegistry } from "./behaviorRegistry.js";
import { IBehaviorMode, BaseBehaviorMode } from "./behaviorMode.js";
import { BotState, UtilityAction } from "../../types/base.js";
import { DustBot } from "../../index.js";

// Test behavior modes for registry testing
class TestModeA extends BaseBehaviorMode {
  readonly name = "TEST_MODE_A";
  protected priority = 100;
  protected actions: UtilityAction[] = [
    {
      name: "ACTION_A",
      canExecute: () => true,
      calculateScore: () => 100,
      execute: async () => console.log("Executing Action A"),
    },
  ];

  async isAvailable(bot: DustBot): Promise<boolean> {
    return true;
  }

  async assessState(bot: DustBot): Promise<BotState> {
    return {
      location: "unknown",
      position: { x: 0, y: 0, z: 0 },
      energy: 5000,
      emptyBuckets: 0,
      waterBuckets: 0,
      wheatSeeds: 0,
      wheat: 0,
      slop: 0,
      unwateredPlots: 0,
      unseededPlots: 0,
      ungrownPlots: 0,
      unharvestedPlots: 0,
      totalPlots: 0,
      inventory: [],
    };
  }
}

class TestModeB extends BaseBehaviorMode {
  readonly name = "TEST_MODE_B";
  protected priority = 50;
  protected actions: UtilityAction[] = [
    {
      name: "ACTION_B",
      canExecute: () => true,
      calculateScore: () => 50,
      execute: async () => console.log("Executing Action B"),
    },
  ];

  async isAvailable(bot: DustBot): Promise<boolean> {
    return false; // Not available for testing
  }

  async assessState(bot: DustBot): Promise<BotState> {
    return {
      location: "unknown",
      position: { x: 0, y: 0, z: 0 },
      energy: 3000,
      emptyBuckets: 0,
      waterBuckets: 0,
      wheatSeeds: 0,
      wheat: 0,
      slop: 0,
      unwateredPlots: 0,
      unseededPlots: 0,
      ungrownPlots: 0,
      unharvestedPlots: 0,
      totalPlots: 0,
      inventory: [],
    };
  }
}

class TestModeC extends BaseBehaviorMode {
  readonly name = "TEST_MODE_C";
  protected priority = 75;
  protected actions: UtilityAction[] = [
    {
      name: "ACTION_C",
      canExecute: () => true,
      calculateScore: () => 75,
      execute: async () => console.log("Executing Action C"),
    },
  ];

  async isAvailable(bot: DustBot): Promise<boolean> {
    return true;
  }

  async assessState(bot: DustBot): Promise<BotState> {
    return {
      location: "unknown",
      position: { x: 0, y: 0, z: 0 },
      energy: 4000,
      emptyBuckets: 0,
      waterBuckets: 0,
      wheatSeeds: 0,
      wheat: 0,
      slop: 0,
      unwateredPlots: 0,
      unseededPlots: 0,
      ungrownPlots: 0,
      unharvestedPlots: 0,
      totalPlots: 0,
      inventory: [],
    };
  }
}

// Simple test framework (reused from behaviorMode.test.ts)
class TestRunner {
  private testCount = 0;
  private passCount = 0;
  private failCount = 0;

  test(name: string, testFn: () => void | Promise<void>): void {
    this.testCount++;
    console.log(`\n🧪 Test ${this.testCount}: ${name}`);

    try {
      const result = testFn();
      if (result instanceof Promise) {
        result
          .then(() => {
            console.log("  ✅ PASS");
            this.passCount++;
          })
          .catch((error) => {
            console.log(`  ❌ FAIL: ${error.message}`);
            this.failCount++;
          });
      } else {
        console.log("  ✅ PASS");
        this.passCount++;
      }
    } catch (error: any) {
      console.log(`  ❌ FAIL: ${error.message}`);
      this.failCount++;
    }
  }

  async asyncTest(name: string, testFn: () => Promise<void>): Promise<void> {
    this.testCount++;
    console.log(`\n🧪 Test ${this.testCount}: ${name}`);

    try {
      await testFn();
      console.log("  ✅ PASS");
      this.passCount++;
    } catch (error: any) {
      console.log(`  ❌ FAIL: ${error.message}`);
      this.failCount++;
    }
  }

  assertEquals(actual: any, expected: any, message?: string): void {
    if (actual !== expected) {
      throw new Error(
        `${message || "Assertion failed"}: expected ${expected}, got ${actual}`
      );
    }
  }

  assertTrue(condition: boolean, message?: string): void {
    if (!condition) {
      throw new Error(message || "Expected condition to be true");
    }
  }

  assertArrayEquals(actual: any[], expected: any[], message?: string): void {
    if (actual.length !== expected.length) {
      throw new Error(
        `${message || "Array length mismatch"}: expected length ${
          expected.length
        }, got ${actual.length}`
      );
    }
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        throw new Error(
          `${message || "Array element mismatch"} at index ${i}: expected ${
            expected[i]
          }, got ${actual[i]}`
        );
      }
    }
  }

  summary(): void {
    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total tests: ${this.testCount}`);
    console.log(`✅ Passed: ${this.passCount}`);
    console.log(`❌ Failed: ${this.failCount}`);

    if (this.failCount > 0) {
      console.log(
        `\n❌ Tests failed! ${this.failCount}/${this.testCount} tests failed.`
      );
      process.exit(1);
    } else {
      console.log(
        `\n🎉 All tests passed! ${this.passCount}/${this.testCount} tests successful.`
      );
    }
  }
}

async function runBehaviorRegistryTests() {
  console.log("📋 BEHAVIOR REGISTRY TESTS");
  console.log("=".repeat(50));

  const runner = new TestRunner();

  // Test registry creation
  runner.test("Registry creation", () => {
    const registry = new BehaviorRegistry();
    runner.assertEquals(registry.getCount(), 0, "New registry should be empty");
  });

  runner.test("Registry creation with config", () => {
    const config = { testConfig: "value" };
    const registry = new BehaviorRegistry(config);
    runner.assertEquals(
      registry.getConfig().testConfig,
      "value",
      "Config should be stored"
    );
  });

  // Test mode registration
  runner.test("Register single mode", () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA();

    registry.register(modeA);

    runner.assertEquals(registry.getCount(), 1, "Registry should have 1 mode");
    runner.assertTrue(
      registry.isRegistered("TEST_MODE_A"),
      "Mode A should be registered"
    );
  });

  runner.test("Register multiple modes", () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA();
    const modeB = new TestModeB();
    const modeC = new TestModeC();

    registry.register(modeA);
    registry.register(modeB);
    registry.register(modeC);

    runner.assertEquals(registry.getCount(), 3, "Registry should have 3 modes");
    runner.assertTrue(
      registry.isRegistered("TEST_MODE_A"),
      "Mode A should be registered"
    );
    runner.assertTrue(
      registry.isRegistered("TEST_MODE_B"),
      "Mode B should be registered"
    );
    runner.assertTrue(
      registry.isRegistered("TEST_MODE_C"),
      "Mode C should be registered"
    );
  });

  runner.test("Prevent duplicate registration", () => {
    const registry = new BehaviorRegistry();
    const modeA1 = new TestModeA();
    const modeA2 = new TestModeA();

    registry.register(modeA1);

    try {
      registry.register(modeA2);
      runner.assertTrue(false, "Should throw error on duplicate registration");
    } catch (error) {
      runner.assertTrue(true, "Should throw error on duplicate registration");
    }
  });

  // Test mode retrieval
  runner.test("Get mode by name", () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA();

    registry.register(modeA);

    const retrieved = registry.getMode("TEST_MODE_A");
    runner.assertTrue(!!retrieved, "Should retrieve registered mode");
    runner.assertEquals(
      retrieved?.name,
      "TEST_MODE_A",
      "Retrieved mode should have correct name"
    );
  });

  runner.test("Get non-existent mode", () => {
    const registry = new BehaviorRegistry();

    const retrieved = registry.getMode("NON_EXISTENT");
    runner.assertTrue(
      retrieved === undefined,
      "Should return undefined for non-existent mode"
    );
  });

  runner.test("Get all modes", () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA();
    const modeB = new TestModeB();

    registry.register(modeA);
    registry.register(modeB);

    const allModes = registry.getAllModes();
    runner.assertEquals(
      allModes.length,
      2,
      "Should return all registered modes"
    );
  });

  // Test priority sorting
  runner.test("Get modes by priority", () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA(); // priority 100
    const modeB = new TestModeB(); // priority 50
    const modeC = new TestModeC(); // priority 75

    registry.register(modeA);
    registry.register(modeB);
    registry.register(modeC);

    const sortedModes = registry.getModesByPriority();
    runner.assertEquals(sortedModes.length, 3, "Should return all modes");
    runner.assertEquals(
      sortedModes[0].name,
      "TEST_MODE_A",
      "First should be highest priority (100)"
    );
    runner.assertEquals(
      sortedModes[1].name,
      "TEST_MODE_C",
      "Second should be middle priority (75)"
    );
    runner.assertEquals(
      sortedModes[2].name,
      "TEST_MODE_B",
      "Third should be lowest priority (50)"
    );
  });

  // Test availability filtering
  await runner.asyncTest("Get available modes", async () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA(); // available = true
    const modeB = new TestModeB(); // available = false
    const modeC = new TestModeC(); // available = true

    registry.register(modeA);
    registry.register(modeB);
    registry.register(modeC);

    const mockBot = {} as DustBot;
    const availableModes = await registry.getAvailableModes(mockBot);

    runner.assertEquals(
      availableModes.length,
      2,
      "Should return only available modes"
    );
    const names = availableModes.map((m) => m.name);
    runner.assertTrue(
      names.includes("TEST_MODE_A"),
      "Should include available mode A"
    );
    runner.assertTrue(
      names.includes("TEST_MODE_C"),
      "Should include available mode C"
    );
    runner.assertTrue(
      !names.includes("TEST_MODE_B"),
      "Should not include unavailable mode B"
    );
  });

  await runner.asyncTest("Get available modes by priority", async () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA(); // priority 100, available = true
    const modeB = new TestModeB(); // priority 50, available = false
    const modeC = new TestModeC(); // priority 75, available = true

    registry.register(modeA);
    registry.register(modeB);
    registry.register(modeC);

    const mockBot = {} as DustBot;
    const availableModes = await registry.getAvailableModesByPriority(mockBot);

    runner.assertEquals(
      availableModes.length,
      2,
      "Should return only available modes"
    );
    runner.assertEquals(
      availableModes[0].name,
      "TEST_MODE_A",
      "First should be highest priority available (100)"
    );
    runner.assertEquals(
      availableModes[1].name,
      "TEST_MODE_C",
      "Second should be lower priority available (75)"
    );
  });

  // Test mode unregistration
  runner.test("Unregister mode", () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA();

    registry.register(modeA);
    runner.assertEquals(
      registry.getCount(),
      1,
      "Should have 1 mode before unregister"
    );

    const removed = registry.unregister("TEST_MODE_A");
    runner.assertTrue(removed, "Should return true when mode is removed");
    runner.assertEquals(
      registry.getCount(),
      0,
      "Should have 0 modes after unregister"
    );
    runner.assertTrue(
      !registry.isRegistered("TEST_MODE_A"),
      "Mode should no longer be registered"
    );
  });

  runner.test("Unregister non-existent mode", () => {
    const registry = new BehaviorRegistry();

    const removed = registry.unregister("NON_EXISTENT");
    runner.assertTrue(!removed, "Should return false when mode doesn't exist");
  });

  // Test registry utilities
  runner.test("Get registered names", () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA();
    const modeB = new TestModeB();

    registry.register(modeA);
    registry.register(modeB);

    const names = registry.getRegisteredNames();
    runner.assertEquals(names.length, 2, "Should return all registered names");
    runner.assertTrue(
      names.includes("TEST_MODE_A"),
      "Should include mode A name"
    );
    runner.assertTrue(
      names.includes("TEST_MODE_B"),
      "Should include mode B name"
    );
  });

  runner.test("Clear registry", () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA();
    const modeB = new TestModeB();

    registry.register(modeA);
    registry.register(modeB);
    runner.assertEquals(
      registry.getCount(),
      2,
      "Should have 2 modes before clear"
    );

    registry.clear();
    runner.assertEquals(
      registry.getCount(),
      0,
      "Should have 0 modes after clear"
    );
  });

  runner.test("Update config", () => {
    const registry = new BehaviorRegistry({ initial: "value" });

    registry.updateConfig({ newConfig: "newValue" });

    const config = registry.getConfig();
    runner.assertEquals(
      config.initial,
      "value",
      "Should preserve original config"
    );
    runner.assertEquals(config.newConfig, "newValue", "Should add new config");
  });

  runner.test("Get status", () => {
    const registry = new BehaviorRegistry();
    const modeA = new TestModeA();
    const modeC = new TestModeC();

    registry.register(modeA);
    registry.register(modeC);

    const status = registry.getStatus();
    runner.assertEquals(
      status.totalModes,
      2,
      "Status should show correct total modes"
    );
    runner.assertEquals(
      status.registeredModes.length,
      2,
      "Status should list all registered modes"
    );
    runner.assertEquals(
      status.modesByPriority.length,
      2,
      "Status should show priority sorted modes"
    );
    runner.assertEquals(
      status.modesByPriority[0].name,
      "TEST_MODE_A",
      "Status should show highest priority first"
    );
    runner.assertEquals(
      status.modesByPriority[0].priority,
      100,
      "Status should show correct priority"
    );
  });

  // Wait a moment for async tests to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  runner.summary();
}

// Run the tests
runBehaviorRegistryTests().catch(console.error);
