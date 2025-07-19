#!/usr/bin/env tsx

import { IBehaviorMode, BaseBehaviorMode } from "./behaviorMode.js";
import { BotState, UtilityAction } from "../../types/base.js";
import { DustBot } from "../../index.js";

// Test implementation of behavior mode
class TestBehaviorMode extends BaseBehaviorMode {
  readonly name = "TEST_MODE";
  protected priority = 50;
  protected actions: UtilityAction[] = [
    {
      name: "TEST_ACTION",
      canExecute: (state) => state.energy > 1000,
      calculateScore: (state) => (state.energy > 1000 ? 100 : 0),
      execute: async (bot) => {
        console.log("  Executing test action");
      },
    },
    {
      name: "WAIT_ACTION",
      canExecute: () => true,
      calculateScore: () => 1,
      execute: async (bot) => {
        console.log("  Executing wait action");
      },
    },
  ];

  async isAvailable(bot: DustBot): Promise<boolean> {
    return true; // Always available for testing
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

// Simple test framework
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

async function runBehaviorModeTests() {
  console.log("🧠 BEHAVIOR MODE INTERFACE TESTS");
  console.log("=".repeat(50));

  const runner = new TestRunner();
  const testMode = new TestBehaviorMode();

  // Test basic properties
  runner.test("Behavior mode has correct name", () => {
    runner.assertEquals(
      testMode.name,
      "TEST_MODE",
      "Mode name should be TEST_MODE"
    );
  });

  runner.test("Behavior mode has correct priority", () => {
    runner.assertEquals(testMode.getPriority(), 50, "Priority should be 50");
  });

  runner.test("Behavior mode has actions", () => {
    const actions = testMode.getActions();
    runner.assertTrue(actions.length > 0, "Should have at least one action");
    runner.assertEquals(actions.length, 2, "Should have exactly 2 actions");
  });

  runner.test("Actions have required properties", () => {
    const actions = testMode.getActions();
    const testAction = actions.find((a) => a.name === "TEST_ACTION");

    runner.assertTrue(!!testAction, "Should have TEST_ACTION");
    runner.assertTrue(
      typeof testAction!.canExecute === "function",
      "Should have canExecute function"
    );
    runner.assertTrue(
      typeof testAction!.calculateScore === "function",
      "Should have calculateScore function"
    );
    runner.assertTrue(
      typeof testAction!.execute === "function",
      "Should have execute function"
    );
  });

  // Test availability check
  await runner.asyncTest("Behavior mode availability check", async () => {
    // We don't have a real bot instance, so we'll mock what we need
    const mockBot = {} as DustBot;
    const isAvailable = await testMode.isAvailable(mockBot);
    runner.assertTrue(isAvailable, "Test mode should always be available");
  });

  // Test state assessment
  await runner.asyncTest("Behavior mode state assessment", async () => {
    const mockBot = {} as DustBot;
    const state = await testMode.assessState(mockBot);

    runner.assertTrue(!!state, "Should return a state object");
    runner.assertEquals(state.energy, 5000, "Energy should be 5000");
    runner.assertEquals(
      state.location,
      "unknown",
      "Location should be unknown"
    );
  });

  // Test action selection
  await runner.asyncTest("Action selection with high energy", async () => {
    const mockBot = {} as DustBot;
    const state = await testMode.assessState(mockBot);

    const selectedAction = await testMode.selectAction(state);
    runner.assertEquals(
      selectedAction.name,
      "TEST_ACTION",
      "Should select TEST_ACTION with high energy"
    );
  });

  await runner.asyncTest("Action selection with low energy", async () => {
    const mockBot = {} as DustBot;
    const lowEnergyState: BotState = {
      location: "unknown",
      position: { x: 0, y: 0, z: 0 },
      energy: 500, // Low energy
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

    const selectedAction = await testMode.selectAction(lowEnergyState);
    runner.assertEquals(
      selectedAction.name,
      "WAIT_ACTION",
      "Should select WAIT_ACTION with low energy"
    );
  });

  // Test action execution
  await runner.asyncTest("Action execution", async () => {
    const mockBot = {} as DustBot;
    const testAction = testMode
      .getActions()
      .find((a) => a.name === "TEST_ACTION")!;

    // Should not throw
    await testMode.execute(mockBot, testAction);
    runner.assertTrue(true, "Action execution should complete without error");
  });

  // Test interface compliance
  runner.test("Implements IBehaviorMode interface", () => {
    const mode: IBehaviorMode = testMode;

    runner.assertTrue(
      typeof mode.name === "string",
      "Should have name property"
    );
    runner.assertTrue(
      typeof mode.isAvailable === "function",
      "Should have isAvailable method"
    );
    runner.assertTrue(
      typeof mode.assessState === "function",
      "Should have assessState method"
    );
    runner.assertTrue(
      typeof mode.selectAction === "function",
      "Should have selectAction method"
    );
    runner.assertTrue(
      typeof mode.execute === "function",
      "Should have execute method"
    );
    runner.assertTrue(
      typeof mode.getPriority === "function",
      "Should have getPriority method"
    );
    runner.assertTrue(
      typeof mode.getActions === "function",
      "Should have getActions method"
    );
  });

  // Wait a moment for async tests to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  runner.summary();
}

// Run the tests
runBehaviorModeTests().catch(console.error);
