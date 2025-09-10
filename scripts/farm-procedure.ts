#!/usr/bin/env tsx
import { runProcedure } from "./universal-procedure.js";
import { FarmingMode } from "../src/modules/behaviour/farming/farmingMode.js";

// Run the farming procedure using the universal system
runProcedure({
  mode: new FarmingMode(),
  logInterval: 5,
}).catch((error: any) => {
  console.error("💥 Fatal error in farming procedure:", error);
  process.exit(1);
});
