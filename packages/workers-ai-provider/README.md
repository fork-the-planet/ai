# workers-ai-provider

[Workers AI](https://developers.cloudflare.com/workers-ai/) provider for the [AI SDK](https://sdk.vercel.ai/). Use Cloudflare's models for chat, tool calling, structured output, embeddings, image generation, and [AI Search](https://developers.cloudflare.com/ai-search/).

## Quick Start

```jsonc
// wrangler.jsonc
{
  "ai": { "binding": "AI" }
}
```

```ts
import { createWorkersAI } from "workers-ai-provider";
import { streamText } from "ai";

export default {
  async fetch(req: Request, env: { AI: Ai }) {
    const workersai = createWorkersAI({ binding: env.AI });

    const result = streamText({
      model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),
      messages: [{ role: "user", content: "Write a haiku about Cloudflare" }],
    });

    return result.toTextStreamResponse();
  },
};
```

```bash
npm install workers-ai-provider ai
```

## Configuration

### Workers binding (recommended)

Inside a Cloudflare Worker, pass the `env.AI` binding directly. No API keys needed.

```ts
const workersai = createWorkersAI({ binding: env.AI });
```

### REST API

Outside of Workers (Node.js, Bun, etc.), use your Cloudflare credentials:

```ts
const workersai = createWorkersAI({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  apiKey: process.env.CLOUDFLARE_API_TOKEN,
});
```

### AI Gateway

Route requests through [AI Gateway](https://developers.cloudflare.com/ai-gateway/) for caching, rate limiting, and observability:

```ts
const workersai = createWorkersAI({
  binding: env.AI,
  gateway: { id: "my-gateway" },
});
```

## Models

Browse the full catalog at [developers.cloudflare.com/workers-ai/models](https://developers.cloudflare.com/workers-ai/models/).

Some good defaults:

| Task | Model | Notes |
|------|-------|-------|
| Chat | `@cf/meta/llama-4-scout-17b-16e-instruct` | Fast, strong tool calling |
| Chat | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Largest Llama, best quality |
| Reasoning | `@cf/qwen/qwq-32b` | Emits `reasoning_content` |
| Embeddings | `@cf/baai/bge-base-en-v1.5` | 768-dim, English |
| Images | `@cf/black-forest-labs/flux-1-schnell` | Fast image generation |

## Text Generation

```ts
import { generateText } from "ai";

const { text } = await generateText({
  model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
  prompt: "Explain Workers AI in one paragraph",
});
```

Streaming:

```ts
import { streamText } from "ai";

const result = streamText({
  model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),
  messages: [{ role: "user", content: "Write a short story" }],
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Tool Calling

```ts
import { generateText, stepCountIs } from "ai";
import { z } from "zod";

const { text } = await generateText({
  model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),
  prompt: "What's the weather in London?",
  tools: {
    getWeather: {
      description: "Get the current weather for a city",
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, temperature: 18, condition: "Cloudy" }),
    },
  },
  stopWhen: stepCountIs(2),
});
```

## Structured Output

```ts
import { generateText, Output } from "ai";
import { z } from "zod";

const { output } = await generateText({
  model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
  prompt: "Recipe for spaghetti bolognese",
  output: Output.object({
    schema: z.object({
      name: z.string(),
      ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
      steps: z.array(z.string()),
    }),
  }),
});
```

## Embeddings

```ts
import { embedMany } from "ai";

const { embeddings } = await embedMany({
  model: workersai.textEmbedding("@cf/baai/bge-base-en-v1.5"),
  values: ["sunny day at the beach", "rainy afternoon in the city"],
});
```

## Image Generation

```ts
import { generateImage } from "ai";

const { images } = await generateImage({
  model: workersai.image("@cf/black-forest-labs/flux-1-schnell"),
  prompt: "A mountain landscape at sunset",
  size: "1024x1024",
});

// images[0].uint8Array contains the PNG bytes
```

## AI Search

[AI Search](https://developers.cloudflare.com/ai-search/) is Cloudflare's managed RAG service. Connect your data and query it with natural language.

```jsonc
// wrangler.jsonc
{
  "ai_search": [{ "binding": "AI_SEARCH", "name": "my-search-index" }]
}
```

```ts
import { createAISearch } from "workers-ai-provider";
import { generateText } from "ai";

const aisearch = createAISearch({ binding: env.AI_SEARCH });

const { text } = await generateText({
  model: aisearch(),
  messages: [{ role: "user", content: "How do I setup AI Gateway?" }],
});
```

Streaming works the same way -- use `streamText` instead of `generateText`.

> `createAutoRAG` still works but is deprecated. Use `createAISearch` instead.

## API Reference

### `createWorkersAI(options)`

| Option | Type | Description |
|--------|------|-------------|
| `binding` | `Ai` | Workers AI binding (`env.AI`). Use this OR credentials. |
| `accountId` | `string` | Cloudflare account ID. Required with `apiKey`. |
| `apiKey` | `string` | Cloudflare API token. Required with `accountId`. |
| `gateway` | `GatewayOptions` | Optional [AI Gateway](https://developers.cloudflare.com/ai-gateway/) config. |

Returns a provider with model factories for each AI SDK function:

```ts
// For generateText / streamText:
workersai(modelId)
workersai.chat(modelId)

// For embedMany / embed:
workersai.textEmbedding(modelId)

// For generateImage:
workersai.image(modelId)
```

### `createAISearch(options)`

| Option | Type | Description |
|--------|------|-------------|
| `binding` | `AutoRAG` | AI Search binding (`env.AI_SEARCH`). |

Returns a callable provider:

```ts
aisearch()       // AI Search model (shorthand)
aisearch.chat()  // AI Search model
```