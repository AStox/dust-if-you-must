#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";
import { ConfigLoader } from "./loader.js";
import { ConfigValidator, generateValidationReport } from "./validator.js";
import { OperationalConfig } from "./types.js";

/**
 * Simple test runner for configuration system
 */
class ConfigTestRunner {
  private testsPassed = 0;
  private testsFailed = 0;
  private testResults: { name: string; passed: boolean; error?: string }[] = [];

  /**
   * Run a test case
   */
  private runTest(name: string, testFn: () => void | Promise<void>): void {
    try {
      const result = testFn();
      if (result instanceof Promise) {
        result
          .then(() => {
            this.testsPassed++;
            this.testResults.push({ name, passed: true });
            console.log(`✅ ${name}`);
          })
          .catch((error) => {
            this.testsFailed++;
            this.testResults.push({
              name,
              passed: false,
              error: error.message,
            });
            console.log(`❌ ${name}: ${error.message}`);
          });
      } else {
        this.testsPassed++;
        this.testResults.push({ name, passed: true });
        console.log(`✅ ${name}`);
      }
    } catch (error) {
      this.testsFailed++;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.testResults.push({ name, passed: false, error: errorMessage });
      console.log(`❌ ${name}: ${errorMessage}`);
    }
  }

  /**
   * Simple assertion functions
   */
  private assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  private assertThrows(
    fn: () => void | Promise<void>,
    expectedMessage?: string
  ): void {
    try {
      const result = fn();
      if (result instanceof Promise) {
        result
          .then(() => {
            throw new Error("Expected function to throw, but it did not");
          })
          .catch(() => {
            // Expected to throw
          });
      } else {
        throw new Error("Expected function to throw, but it did not");
      }
    } catch (error) {
      if (
        expectedMessage &&
        error instanceof Error &&
        !error.message.includes(expectedMessage)
      ) {
        throw new Error(
          `Expected error to contain "${expectedMessage}", but got: ${error.message}`
        );
      }
    }
  }

  /**
   * Run all configuration tests
   */
  public async runAllTests(): Promise<void> {
    console.log("🧪 Running Configuration System Tests");
    console.log("=".repeat(50));

    // Test 1: Valid configuration validation
    this.runTest("Valid configuration should pass validation", () => {
      const validConfig: OperationalConfig = {
        version: "1.0.0",
        name: "Test Configuration",
        description: "Test configuration for unit tests",
        areas: {
          farming: {
            farmCenter: { x: -401, y: 72, z: 483 },
            farmBounds: {
              corner1: { x: -405, y: 72, z: 479 },
              corner2: { x: -398, y: 72, z: 486 },
            },
            waterSource: { x: -444, y: 62, z: 489 },
            coastPosition: { x: -443, y: 63, z: 489 },
            housePosition: { x: -401, y: 72, z: 489 },
          },
        },
        entities: {
          chests: {
            rightChest:
              "0x03fffffe7300000049000001e300000000000000000000000000000000000000",
          },
        },
        parameters: {
          locationThreshold: 1,
          farming: {
            targetBuckets: 34,
            targetSeeds: 99,
            targetWheat: 99,
            lowEnergyThreshold: 0.25,
          },
        },
      };

      const result = ConfigValidator.validate(validConfig);
      this.assert(result.isValid, "Configuration should be valid");
      this.assert(
        result.errors.length === 0,
        "Should have no validation errors"
      );
    });

    // Test 2: Invalid configuration validation
    this.runTest("Invalid configuration should fail validation", () => {
      const invalidConfig = {} as OperationalConfig;

      const result = ConfigValidator.validate(invalidConfig);
      this.assert(!result.isValid, "Configuration should be invalid");
      this.assert(result.errors.length > 0, "Should have validation errors");
      this.assert(
        result.errors.some((error) => error.includes("version")),
        "Should have version error"
      );
    });

    // Test 3: Semantic versioning validation
    this.runTest("Should validate semantic versioning format", () => {
      const invalidVersionConfig: OperationalConfig = {
        version: "invalid-version",
        name: "Test",
        areas: {
          farming: {
            farmCenter: { x: 0, y: 0, z: 0 },
            farmBounds: {
              corner1: { x: 0, y: 0, z: 0 },
              corner2: { x: 1, y: 0, z: 1 },
            },
            waterSource: { x: 0, y: 0, z: 0 },
            coastPosition: { x: 0, y: 0, z: 0 },
            housePosition: { x: 0, y: 0, z: 0 },
          },
        },
        entities: {
          chests: {
            rightChest:
              "0x03fffffe7300000049000001e300000000000000000000000000000000000000",
          },
        },
        parameters: {
          locationThreshold: 1,
        },
      };

      const result = ConfigValidator.validate(invalidVersionConfig);
      this.assert(!result.isValid, "Should reject invalid version format");
      this.assert(
        result.errors.some((error) => error.includes("semantic versioning")),
        "Should have semantic versioning error"
      );
    });

    // Test 4: Entity ID validation
    this.runTest("Should validate entity ID format", () => {
      const invalidEntityConfig: OperationalConfig = {
        version: "1.0.0",
        name: "Test",
        areas: {
          farming: {
            farmCenter: { x: 0, y: 0, z: 0 },
            farmBounds: {
              corner1: { x: 0, y: 0, z: 0 },
              corner2: { x: 1, y: 0, z: 1 },
            },
            waterSource: { x: 0, y: 0, z: 0 },
            coastPosition: { x: 0, y: 0, z: 0 },
            housePosition: { x: 0, y: 0, z: 0 },
          },
        },
        entities: {
          chests: {
            rightChest: "invalid-entity-id",
          },
        },
        parameters: {
          locationThreshold: 1,
        },
      };

      const result = ConfigValidator.validate(invalidEntityConfig);
      this.assert(!result.isValid, "Should reject invalid entity ID");
      this.assert(
        result.errors.some((error) => error.includes("hex string")),
        "Should have hex string error"
      );
    });

    // Test 5: Warnings for suboptimal values
    this.runTest("Should generate warnings for suboptimal values", () => {
      const suboptimalConfig: OperationalConfig = {
        version: "1.0.0",
        name: "Test",
        areas: {
          farming: {
            farmCenter: { x: 0, y: 0, z: 0 },
            farmBounds: {
              corner1: { x: 0, y: 0, z: 0 },
              corner2: { x: 1, y: 0, z: 1 }, // Very small farm area
            },
            waterSource: { x: 0, y: 0, z: 0 },
            coastPosition: { x: 100, y: 0, z: 100 }, // Far from water source
            housePosition: { x: 0, y: 0, z: 0 },
          },
        },
        entities: {
          chests: {
            rightChest:
              "0x03fffffe7300000049000001e300000000000000000000000000000000000000",
          },
        },
        parameters: {
          locationThreshold: 1,
          farming: {
            targetBuckets: 50, // Above inventory limit
          },
        },
      };

      const result = ConfigValidator.validate(suboptimalConfig);
      this.assert(result.warnings.length > 0, "Should have warnings");
      this.assert(
        result.warnings.some((warning) => warning.includes("very small")),
        "Should warn about small farm area"
      );
    });

    // Test 6: Configuration loader error handling
    this.runTest("Should handle non-existent config file", async () => {
      const loader = ConfigLoader.getInstance();
      (loader as any).loadedConfig = null; // Reset singleton

      try {
        await loader.loadConfig({
          configPath: "/non/existent/config.json",
        });
        throw new Error("Expected error but none was thrown");
      } catch (error) {
        this.assert(
          error instanceof Error &&
            error.message.includes("Configuration file not found"),
          "Should throw file not found error"
        );
      }
    });

    // Test 7: Configuration getter before loading
    this.runTest(
      "Should throw error when getting config before loading",
      () => {
        const loader = ConfigLoader.getInstance();
        (loader as any).loadedConfig = null; // Reset singleton

        try {
          loader.getConfig();
          throw new Error("Expected error but none was thrown");
        } catch (error) {
          this.assert(
            error instanceof Error &&
              error.message.includes("Configuration not loaded"),
            "Should throw not loaded error"
          );
        }
      }
    );

    // Test 8: Validation report generation
    this.runTest("Should generate helpful validation reports", () => {
      const invalidConfig = {} as OperationalConfig;
      const result = ConfigValidator.validate(invalidConfig);
      const report = generateValidationReport(result);

      this.assert(
        report.includes("Configuration Validation Report"),
        "Should have report header"
      );
      this.assert(
        report.includes("Configuration has errors"),
        "Should indicate errors"
      );
      this.assert(
        report.includes("Tips for fixing"),
        "Should have helpful tips"
      );
    });

    // Test 9: Default values application
    this.runTest("Should apply default values correctly", async () => {
      // Create a temporary config file for testing
      const testConfigDir = path.join(__dirname, "../../test-configs");
      const testConfigPath = path.join(testConfigDir, "minimal-config.json");

      try {
        // Create test directory
        if (!fs.existsSync(testConfigDir)) {
          fs.mkdirSync(testConfigDir, { recursive: true });
        }

        const minimalConfig = {
          version: "1.0.0",
          name: "Minimal Configuration",
          areas: {
            farming: {
              farmCenter: { x: 0, y: 0, z: 0 },
              farmBounds: {
                corner1: { x: 0, y: 0, z: 0 },
                corner2: { x: 1, y: 0, z: 1 },
              },
              waterSource: { x: 0, y: 0, z: 0 },
              coastPosition: { x: 0, y: 0, z: 0 },
              housePosition: { x: 0, y: 0, z: 0 },
            },
          },
          entities: {
            chests: {
              rightChest:
                "0x03fffffe7300000049000001e300000000000000000000000000000000000000",
            },
          },
          parameters: {
            locationThreshold: 1,
          },
        };

        fs.writeFileSync(
          testConfigPath,
          JSON.stringify(minimalConfig, null, 2)
        );

        const loader = ConfigLoader.getInstance();
        (loader as any).loadedConfig = null; // Reset singleton

        const result = await loader.loadConfig({
          configPath: testConfigPath,
          validateSchema: false, // Skip validation for this test
        });

        // Check that defaults are applied
        this.assert(
          result.parameters.farming.targetBuckets === 34,
          "Should apply default target buckets"
        );
        this.assert(
          result.parameters.farming.targetSeeds === 99,
          "Should apply default target seeds"
        );
        this.assert(
          result.parameters.farming.lowEnergyThreshold === 0.25,
          "Should apply default energy threshold"
        );

        // Clean up
        if (fs.existsSync(testConfigDir)) {
          fs.rmSync(testConfigDir, { recursive: true, force: true });
        }
      } catch (error) {
        // Clean up on error
        if (fs.existsSync(testConfigDir)) {
          fs.rmSync(testConfigDir, { recursive: true, force: true });
        }
        throw error;
      }
    });

    // Wait for async tests to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Print summary
    console.log("\n" + "=".repeat(50));
    console.log(
      `🧪 Test Summary: ${this.testsPassed} passed, ${this.testsFailed} failed`
    );

    if (this.testsFailed > 0) {
      console.log("\n❌ Failed tests:");
      this.testResults
        .filter((result) => !result.passed)
        .forEach((result) => {
          console.log(`  - ${result.name}: ${result.error}`);
        });
      process.exit(1);
    } else {
      console.log("✅ All tests passed!");
    }
  }
}

// Run tests if this file is executed directly
const isMainModule = require.main === module;
if (isMainModule) {
  const testRunner = new ConfigTestRunner();
  testRunner.runAllTests().catch(console.error);
}
