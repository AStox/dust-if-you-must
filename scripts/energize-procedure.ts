#!/usr/bin/env tsx
import { runProcedure } from "./universal-procedure.js";
import { EnergizeMode } from "../src/modules/behaviour/energize/energizeMode.js";

// Run the energize procedure using the universal system
runProcedure({
  mode: new EnergizeMode(),
  configRequirements: { requireEnergizeAreas: true },
}).catch((error: any) => {
  console.error("💥 Fatal error in energize procedure:", error);
  process.exit(1);
});
