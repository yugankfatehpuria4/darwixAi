import { defineConfig } from "vitest/config";

// The ingestion tests rewrite data/processed/kb.json while others read it;
// running files one at a time keeps that deterministic. The suite takes ~3s.
export default defineConfig({ test: { fileParallelism: false, env: { LOG_LEVEL: "silent" } } });
