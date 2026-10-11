import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PROMPTS_DIR = join(ROOT, "prompts");
export const SKILLS_DIR = join(ROOT, "skills");
export const CASES_DIR = join(ROOT, "tests", "cases");
export const RESULTS_DIR = join(ROOT, "results");
