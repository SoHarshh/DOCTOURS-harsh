/** Test helper: a fake Anthropic client whose messages.create returns scripted responses in order. */
export function fakeClient(responses: any[]) {
  const calls: any[] = [];
  return {
    calls,
    messages: {
      async create(params: any) {
        calls.push(structuredClone(params));
        const r = responses.shift();
        if (!r) throw new Error("fakeClient: no more scripted responses");
        return r;
      },
    },
  };
}
export const usage = (input = 100, output = 50, cacheRead = 0, cacheWrite = 0) =>
  ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite });
export const textResponse = (json: object, model = "claude-haiku-5-5") =>
  ({ model, stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(json) }], usage: usage() });
export const toolResponse = (name: string, input: object, id = "tu_1", model = "claude-haiku-5-5") =>
  ({ model, stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }], usage: usage() });
export const baseReply = (over: Record<string, unknown> = {}) => ({
  response: "ok", escalate: false, escalationReason: null, templateId: null, intent: "x",
  shouldFollowUp: false, followUpTiming: null, attachmentUrls: null, highEngagement: false, workingMemoryUpdates: null, ...over,
});
