import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fill, templateValues, type Context } from "./context/buildContext.js";
import { PROMPTS_DIR } from "./paths.js";

export function loadPrompt(name: "baseline" | "userMessage" | "core"): string {
  return readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf8");
}

/** The packet's user message template, filled for one incoming message. */
export function renderUserMessage(ctx: Context, text: string): string {
  return fill(loadPrompt("userMessage"), { ...templateValues(ctx), HUMAN_MESSAGE: text });
}

/** The original monolith prompt with every {{NAME}} filled from the context, as the packet's Flow section says. */
export function renderBaselineSystem(ctx: Context): string {
  return fill(loadPrompt("baseline"), templateValues(ctx));
}
