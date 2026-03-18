---
"workers-ai-provider": patch
---

Remove tool_call_id sanitization that truncated IDs to 9 alphanumeric chars, which caused all tool call IDs to collide after round-trip
