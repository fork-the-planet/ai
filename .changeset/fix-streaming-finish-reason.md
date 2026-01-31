---
"workers-ai-provider": patch
---

fix(workers-ai-provider): extract actual finish reason in streaming instead of hardcoded "stop"

Previously, the streaming implementation always returned `finishReason: "stop"` regardless of the actual completion reason. This caused:
- Tool calling scenarios to incorrectly report "stop" instead of "tool-calls"  
- Multi-turn tool conversations to fail because the AI SDK couldn't detect when tools were requested
- Length limit scenarios to show "stop" instead of "length"
- Error scenarios to show "stop" instead of "error"

The fix extracts the actual `finish_reason` from streaming chunks and uses the existing `mapWorkersAIFinishReason()` function to properly map it to the AI SDK's finish reason format. This enables proper multi-turn tool calling and accurate completion status reporting.
