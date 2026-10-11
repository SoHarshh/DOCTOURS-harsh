import type { ToolCallRecord } from "../types.js";

/** Records every tool call in one turn and exposes the facts the validators check against. */
export class ToolLog {
  calls: ToolCallRecord[] = [];
  private results: string[] = [];

  record(name: string, args: unknown, result: unknown): string {
    const text = JSON.stringify(result ?? null);
    this.calls.push({ name, args, ok: result !== null && result !== undefined, resultChars: text.length });
    this.results.push(text);
    return text;
  }

  private allText(): string { return this.results.join("\n"); }

  /** Raw JSON of every tool result this turn, for name and value lookups. */
  resultsText(): string { return this.allText(); }

  urls(): Set<string> {
    return new Set((this.allText().match(/https?:\/\/[^\s"\\]+/g) ?? []).map((u) => u.replace(/[.,;:)]+$/, "")));
  }

  prices(): Set<number> {
    const out = new Set<number>();
    for (const m of this.allText().matchAll(/"(basePrice|depositAmount|pricePerUnit|amount)":\s*(\d+(?:\.\d+)?)/g)) out.add(Number(m[2]));
    return out;
  }

  slugs(): Set<string> {
    return new Set([...this.allText().matchAll(/"slug":\s*"([^"]+)"/g)].map((m) => m[1]));
  }

  imageUrls(): Set<string> {
    return new Set(this.allText().match(/https:\/\/assets\.example\.invalid\/[^\s"\\]+/g) ?? []);
  }

  called(name: string): boolean { return this.calls.some((c) => c.name.replace(/Tool$/, "") === name); }
}
