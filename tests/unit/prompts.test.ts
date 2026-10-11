import { describe, it, expect } from "vitest";
import { loadPrompt, renderBaselineSystem, renderUserMessage } from "../../src/prompts.js";
import { buildContext } from "../../src/context/buildContext.js";
import * as P from "../../src/context/packet.js";

describe("prompts", () => {
  it("baseline fills every packet placeholder", () => {
    const s = renderBaselineSystem(buildContext());
    expect(s.startsWith("# IDENTITY")).toBe(true);
    for (const k of ["PATIENT_SUMMARY", "CLINIC_FLAGS", "CHAT_LIST", "COLLECTION_STATUS", "WORKING_MEMORY", "COORDINATOR_DISPLAY_NAME", "SAVED_CLINIC_COUNT", "PATIENT_IMAGE_COUNT", "RECENT_CALLS", "CHAT_KIND", "SENDER_DISPLAY_NAME", "SENDER_PARTICIPANT_ROLE"]) {
      expect(s).not.toContain(`{{${k}}}`);
    }
    expect(s).toContain("{{clinic.slug}}"); // literal in the packet, must survive
    expect(s).toContain("Jordan Hale");
  });

  it("baseline with default context carries the packet constants verbatim", () => {
    const s = renderBaselineSystem(buildContext());
    for (const v of [P.PATIENT_SUMMARY, P.CLINIC_FLAGS, P.CHAT_LIST, P.COLLECTION_STATUS, P.WORKING_MEMORY, P.RECENT_CALLS]) {
      expect(s).toContain(v);
    }
  });

  it("baseline template is the packet prompt unedited, start to end", () => {
    const raw = loadPrompt("baseline");
    expect(raw.split("\n")[0]).toBe("# IDENTITY");
    expect(raw.trimEnd().endsWith("Use Mastra memory for durable patient context, not as an exact transcript.")).toBe(true);
    expect(raw).not.toContain("```");
  });

  it("baseline follows context overrides", () => {
    const s = renderBaselineSystem(buildContext({ COORDINATOR_DISPLAY_NAME: "Sam" }));
    expect(s).toContain("Sam");
  });

  it("user message fills text and summary", () => {
    const u = renderUserMessage(buildContext(), "hello?");
    expect(u).toContain('"hello?"');
    expect(u).toContain("Recent conversation summary:");
    expect(u).toContain(P.RECENT_CONVERSATION_SUMMARY);
    expect(u).not.toContain("{{");
  });

  it("user message matches the packet template for the default context", () => {
    const u = renderUserMessage(buildContext(), "Is the consultation free?");
    expect(u).toBe(
      `Incoming thread message:\n"Is the consultation free?"\nIncoming image count: 0\nChat kind: DIRECT\nTriggering sender: Jordan Hale\n\nRecent conversation summary:\n${P.RECENT_CONVERSATION_SUMMARY}`,
    );
  });

  it("message text is inserted literally, never re-filled", () => {
    const u = renderUserMessage(buildContext(), "what is {{CHAT_LIST}} and $& ?");
    expect(u).toContain('"what is {{CHAT_LIST}} and $& ?"');
  });
});
