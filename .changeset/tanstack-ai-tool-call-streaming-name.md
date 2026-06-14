---
"@cloudflare/tanstack-ai": patch
---

Fix broken streamed tool calls in the Workers AI adapter ([#523](https://github.com/cloudflare/ai/issues/523)).

Some Workers AI models stream a tool call's argument fragments before the function `name` arrives. The adapter buffers those fragments while waiting for the name (it must, because TanStack AI's `StreamProcessor` reads the tool name only once, from `TOOL_CALL_START`), but it previously dropped the buffered prefix and forwarded only the post-name fragment. The result was a `tool-call` message part with truncated/empty `arguments` (and, in earlier versions, a missing `name`), so tool dispatch silently failed.

The adapter now tracks how many argument characters have been emitted and flushes any buffered fragments via `TOOL_CALL_ARGS` as soon as `TOOL_CALL_START` is emitted, guaranteeing the full argument string and the tool name reach the consumer regardless of the order in which the model streams `name` and `arguments`.
