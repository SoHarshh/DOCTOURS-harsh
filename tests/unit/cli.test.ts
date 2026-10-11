import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseArgs, parseMessages, runAll } from "../../src/cli.js";
import { ROOT } from "../../src/paths.js";
import { textResponse, baseReply } from "./fakeClient.js";

vi.mock("../../src/pipeline/runMessage.js", async () => {
  const { baseReply } = await import("./fakeClient.js");
  const { emptyTrace } = await import("../../src/types.js");
  return {
    runMessage: vi.fn(async (_ctx: unknown, text: string, opts: any) => ({
      reply: baseReply({ response: `new:${text}` }),
      trace: { ...emptyTrace(opts.id, "new", opts.deps.model), notes: [`model=${opts.deps.model}`] },
    })),
  };
});

/** Replies "re:<message text>" after a random delay, so out-of-order completion is likely. */
function echoClient(failOn: string[] = []) {
  const calls: any[] = [];
  return {
    calls,
    messages: {
      async create(p: any) {
        calls.push(p);
        const text = /"([^"]*)"/.exec(p.messages[0].content)![1];
        await new Promise((r) => setTimeout(r, Math.random() * 15));
        if (failOn.includes(text)) throw new Error(`boom on ${text}`);
        return textResponse(baseReply({ response: `re:${text}` }));
      },
    },
  };
}

const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, text: `t${i}` }));

describe("cli parsing", () => {
  it("parses flags with defaults", () => {
    const a = parseArgs(["--system", "baseline", "--in", "x.json", "--out", "y.json", "--trace", "t.jsonl", "--model", "m"]);
    expect(a).toMatchObject({ system: "baseline", in: "x.json", out: "y.json", trace: "t.jsonl", model: "m" });
    expect(parseArgs([]).system).toBe("new");
  });
  it("rejects an unknown system", () => { expect(() => parseArgs(["--system", "old"])).toThrow(/system/); });
  it("rejects a flag with no value", () => { expect(() => parseArgs(["--in"])).toThrow(/--in/); });
  it("rejects unknown flags", () => { expect(() => parseArgs(["--input", "x"])).toThrow(/--input/); });
  it("parses --concurrency as a number and leaves it unset by default", () => {
    expect(parseArgs(["--concurrency", "8"]).concurrency).toBe(8);
    expect(parseArgs([]).concurrency).toBeUndefined();
  });
  it("rejects a --concurrency that is not a positive whole number", () => {
    for (const bad of ["0", "-2", "abc", "2.5"]) expect(() => parseArgs(["--concurrency", bad])).toThrow(/--concurrency must be a positive whole number/);
  });

  it("rejects invalid JSON", () => { expect(() => parseMessages("[{")).toThrow(/JSON/); });
  it("rejects a non-array", () => { expect(() => parseMessages('{"id":1}')).toThrow(/array/); });
  it("rejects an item without text", () => { expect(() => parseMessages('[{"id":"a"}]')).toThrow(/text/); });
  it("rejects an item whose text is not a string", () => { expect(() => parseMessages('[{"id":"a","text":5}]')).toThrow(/text/); });
  it("rejects an item that is not an object", () => { expect(() => parseMessages('["hi"]')).toThrow(/text/); });
  it("names the offending item", () => { expect(() => parseMessages('[{"id":"a","text":"x"},{"id":"b"}]')).toThrow(/item 1/); });
  it("accepts a valid array", () => { expect(parseMessages('[{"id":"a","text":"hi"}]')).toEqual([{ id: "a", text: "hi" }]); });
  it("accepts an empty array and empty text", () => {
    expect(parseMessages("[]")).toEqual([]);
    expect(parseMessages('[{"id":"a","text":""}]')).toEqual([{ id: "a", text: "" }]);
  });
  it("stringifies numeric ids and fills a missing id from the position", () => {
    expect(parseMessages('[{"id":7,"text":"a"},{"text":"b"}]')).toEqual([{ id: "7", text: "a" }, { id: "msg-1", text: "b" }]);
  });
});

describe("runAll", () => {
  it("returns one baseline reply per message in input order", async () => {
    const c = echoClient();
    const { replies, traces } = await runAll("baseline", msgs(7), undefined, { client: c, concurrency: 3 });
    expect(replies.map((r) => r.response)).toEqual(msgs(7).map((m) => `re:${m.text}`));
    expect(traces.map((t) => t.id)).toEqual(msgs(7).map((m) => m.id));
    expect(traces.every((t) => t.system === "baseline")).toBe(true);
  });

  it("runs every message as an independent turn on the same history", async () => {
    const c = echoClient();
    await runAll("baseline", msgs(3), undefined, { client: c, concurrency: 1 });
    expect(c.calls.length).toBe(3);
    for (const call of c.calls) expect(call.messages.length).toBe(1);
    expect(c.calls[0].system[0].text).toBe(c.calls[2].system[0].text);
  });

  it("routes the new system through runMessage with deps, id and model", async () => {
    const { replies, traces } = await runAll("new", msgs(2), "claude-haiku-5-5", { client: echoClient() });
    expect(replies.map((r) => r.response)).toEqual(["new:t0", "new:t1"]);
    expect(traces[1].id).toBe("m1");
    expect(traces[0].notes).toContain("model=claude-haiku-5-5");
  });

  it("hands one failed message to a person and keeps the rest", async () => {
    const { replies, traces } = await runAll("baseline", msgs(3), undefined, { client: echoClient(["t1"]), concurrency: 2 });
    expect(replies[0].response).toBe("re:t0");
    expect(replies[2].response).toBe("re:t2");
    expect(replies[1].escalate).toBe(true);
    expect(replies[1].response).toMatch(/person/);
    expect(traces[1].escalation.source).toBe("validator");
    expect(traces[1].notes.join(" ")).toMatch(/boom on t1/);
  });

  it("counts the messages handed to a person after errors", async () => {
    expect((await runAll("baseline", msgs(3), undefined, { client: echoClient(["t1"]), retryDelayMs: 0 })).failed).toBe(1);
    expect((await runAll("baseline", msgs(3), undefined, { client: echoClient() })).failed).toBe(0);
  });

  it("retries a failed message once before handing it to a person", async () => {
    let failed = false;
    const flaky = {
      messages: {
        async create(p: any) {
          const text = /"([^"]*)"/.exec(p.messages[0].content)![1];
          if (text === "t1" && !failed) { failed = true; throw new Error("429 rate limited"); }
          return textResponse(baseReply({ response: `re:${text}` }));
        },
      },
    };
    const { replies } = await runAll("baseline", msgs(2), undefined, { client: flaky, concurrency: 1, retryDelayMs: 0 });
    expect(replies[1].escalate).toBe(false);
    expect(replies[1].response).toBe("re:t1");
  });

  it("the default client retries API errors more than the SDK default", async () => {
    const { createDeps } = await import("../../src/pipeline/model.js");
    expect((createDeps().client as any).maxRetries).toBeGreaterThanOrEqual(5);
  });

  it("throws when every message fails", async () => {
    await expect(runAll("baseline", msgs(2), undefined, { client: echoClient(["t0", "t1"]) })).rejects.toThrow(/boom/);
  });

  it("returns nothing for no messages without calling the model", async () => {
    const c = echoClient();
    expect(await runAll("baseline", [], undefined, { client: c })).toEqual({ replies: [], traces: [], failed: 0 });
    expect(c.calls.length).toBe(0);
  });
});

/** Echoes each message and records the most calls that were in flight at once. */
function countingClient() {
  const c = { inFlight: 0, maxInFlight: 0, messages: { async create(p: any) {
    c.inFlight++;
    c.maxInFlight = Math.max(c.maxInFlight, c.inFlight);
    await new Promise((r) => setTimeout(r, 5));
    c.inFlight--;
    return textResponse(baseReply({ response: `re:${/"([^"]*)"/.exec(p.messages[0].content)![1]}` }));
  } } };
  return c;
}

describe("main", () => {
  const files = (n: number) => {
    const dir = mkdtempSync(join(tmpdir(), "cli-"));
    const f = { in: join(dir, "in.json"), out: join(dir, "out.json"), trace: join(dir, "t.jsonl") };
    writeFileSync(f.in, JSON.stringify(msgs(n)));
    return f;
  };
  const args = (f: ReturnType<typeof files>, ...extra: string[]) =>
    ["--system", "baseline", "--in", f.in, "--out", f.out, "--trace", f.trace, ...extra];
  const stderrOf = async (fn: () => Promise<void>) => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try { await fn(); return spy.mock.calls.map((c) => String(c[0])).join(""); } finally { spy.mockRestore(); }
  };

  it("runs at most --concurrency messages at once", async () => {
    for (const n of [1, 3]) {
      const c = countingClient();
      const f = files(6);
      await stderrOf(() => main(args(f, "--concurrency", String(n)), { client: c }));
      expect(c.maxInFlight).toBe(n);
      expect(JSON.parse(readFileSync(f.out, "utf8"))).toHaveLength(6);
    }
  });

  it("still reads CONCURRENCY from the environment, and the flag wins over it", async () => {
    const saved = process.env.CONCURRENCY;
    process.env.CONCURRENCY = "2";
    try {
      const c = countingClient();
      await stderrOf(() => main(args(files(6)), { client: c }));
      expect(c.maxInFlight).toBe(2);
      const d = countingClient();
      await stderrOf(() => main(args(files(6), "--concurrency", "1"), { client: d }));
      expect(d.maxInFlight).toBe(1);
    } finally {
      if (saved === undefined) delete process.env.CONCURRENCY; else process.env.CONCURRENCY = saved;
    }
  });

  it("ends the stderr summary with how many messages were handed off after errors", async () => {
    const f = files(3);
    const err = await stderrOf(() => main(args(f), { client: echoClient(["t1"]), retryDelayMs: 0 }));
    expect(err.trim().split("\n").at(-1)).toBe(`wrote 3 replies; 1 handed off after errors; traces in ${f.trace}`);
    expect(process.exitCode).toBeFalsy();
  });
});

describe("cli process", () => {
  const tsx = join(ROOT, "node_modules", ".bin", "tsx");
  const run = (args: string[], input?: string) =>
    spawnSync(tsx, [join(ROOT, "src", "cli.ts"), ...args], { input, encoding: "utf8", cwd: ROOT, env: { ...process.env, ANTHROPIC_API_KEY: "test-key-unused" } });
  const oneLineError = (r: ReturnType<typeof run>, pattern: RegExp) => {
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    const lines = r.stderr.trim().split("\n");
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/^error: /);
    expect(lines[0]).toMatch(pattern);
  };

  it("exits 1 with one stderr line for a non-array", () => { oneLineError(run([], '{"id":1}'), /array/); });
  it("exits 1 with one stderr line for an item without text", () => { oneLineError(run([], '[{"id":"a"}]'), /text/); });
  it("exits 1 with one stderr line for invalid JSON", () => { oneLineError(run([], "not json"), /JSON/); });
  it("exits 1 with one stderr line for an unknown system", () => { oneLineError(run(["--system", "old"], "[]"), /system/); });
  it("exits 1 with one stderr line for a bad --concurrency", () => { oneLineError(run(["--concurrency", "0"], "[]"), /--concurrency must be a positive whole number/); });
  it("exits 1 with one stderr line for a missing input file", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-"));
    oneLineError(run(["--in", join(dir, "nope.json")]), /nope\.json/);
  });
  it("runs when started through a symlinked path", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-"));
    symlinkSync(ROOT, join(dir, "repo"));
    const r = spawnSync(tsx, [join(dir, "repo", "src", "cli.ts"), "--system", "baseline", "--trace", join(dir, "t.jsonl")], { input: "[]", encoding: "utf8", cwd: ROOT });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it("writes an empty array for empty input, reading --in", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-"));
    const f = join(dir, "in.json");
    writeFileSync(f, "[]");
    const r = run(["--system", "baseline", "--in", f, "--trace", join(dir, "t.jsonl")]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
    expect(r.stderr).toBe(`wrote 0 replies; 0 handed off after errors; traces in ${join(dir, "t.jsonl")}\n`);
  });
});
