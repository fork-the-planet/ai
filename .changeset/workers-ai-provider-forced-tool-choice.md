---
"workers-ai-provider": patch
---

Map the AI SDK's forced single-tool choice to the documented named-function form.

Previously `toolChoice: { type: "tool", toolName }` was downgraded to
`tool_choice: "required"` (with the tool list filtered to the single function).
Workers AI treats `"required"` as advisory: on long contexts and reasoning
models (e.g. `@cf/google/gemma-4-26b-a4b-it`, `@cf/qwen/qwq-32b`,
`@cf/qwen/qwen3-30b-a3b-fp8`) the model would "fail open" and answer in prose
instead of calling the requested tool.

Now the provider sends the OpenAI-style named-function form
`tool_choice: { type: "function", function: { name } }`, which Workers AI
enforces server-side, and keeps the full tool list (matching OpenAI semantics
and preserving tool-result context fidelity).

Note: forcing a tool on a reasoning model with insufficient `max_tokens` is
validated server-side and now surfaces as a clear error (Workers AI `8006`)
rather than silently producing no tool call.

Additionally, recover forced tool calls that gpt-oss models leak as text.
When a tool is forced, gpt-oss (harmony format) sometimes emits the tool call
as raw JSON in `message.content` with an empty `tool_calls` array and
`finish_reason: "stop"`. The provider now detects this — only when a tool was
forced and the leaked JSON's `name` matches a requested tool — and
reinterprets it as a structured tool call (with `finishReason: "tool-calls"`
and a warning), across both `generateText` and `streamText`. Ambiguous leaks
(harmony channel/role names, hallucinated names) are left untouched to avoid
fabricating bogus calls.
