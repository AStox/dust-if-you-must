#!/usr/bin/env tsx
import { runProcedure, type ProcedureConfig } from "./universal-procedure.js";
import { SurvivalMode, logSurvivalState } from "../src/modules/behaviour/survival/survivalMode.js";

const config: ProcedureConfig = {
  mode: new SurvivalMode(),
  logState: logSurvivalState,
  logInterval: 3,
};

console.log("🚨 Starting SURVIVAL procedure");
runProcedure(config).catch((error: any) => {
  console.error("💥 Fatal error in survival procedure:", error);
  process.exit(1);
});
