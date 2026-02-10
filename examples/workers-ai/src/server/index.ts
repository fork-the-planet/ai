import { streamText, tool, embedMany, convertToModelMessages, generateImage } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod/v4";

interface Env {
	AI: Ai;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method !== "POST") {
			return new Response("Not found", { status: 404 });
		}

		const workersai = createWorkersAI({ binding: env.AI });

		try {
			switch (url.pathname) {
				// ---- Streaming chat with tool calling ----
				case "/api/chat": {
					const body = (await request.json()) as {
						messages: Array<Record<string, unknown>>;
						model?: string;
					};

					const model = body.model || "@cf/meta/llama-4-scout-17b-16e-instruct";
					const messages = await convertToModelMessages(body.messages as any);

					const result = streamText({
						model: workersai(model as any),
						messages,
						tools: {
							getWeather: tool({
								description:
									"Get the current weather for a city. Use this when the user asks about weather.",
								inputSchema: z.object({
									city: z.string().describe("City name"),
								}),
								execute: async ({ city }) => {
									const conditions = [
										"Sunny",
										"Cloudy",
										"Rainy",
										"Snowy",
										"Windy",
									];
									const condition =
										conditions[
											Math.abs(
												city
													.split("")
													.reduce((a, c) => a + c.charCodeAt(0), 0),
											) % conditions.length
										];
									return {
										city,
										temperature: 15 + (city.length % 20),
										condition,
										humidity: 40 + (city.length % 50),
									};
								},
							}),
						},
					});

					return result.toUIMessageStreamResponse({
						sendReasoning: true,
					});
				}

				// ---- Image generation ----
				case "/api/image": {
					const body = (await request.json()) as {
						prompt: string;
						model?: string;
					};

					const model = body.model || "@cf/black-forest-labs/flux-1-schnell";

					const result = await generateImage({
						model: workersai.image(model as any),
						prompt: body.prompt,
						size: "1024x1024",
					});

					const imageBytes = result.images[0].uint8Array;
					const base64 = btoa(
						Array.from(imageBytes)
							.map((byte) => String.fromCharCode(byte))
							.join(""),
					);

					return Response.json({ image: `data:image/png;base64,${base64}` });
				}

				// ---- Embeddings ----
				case "/api/embed": {
					const body = (await request.json()) as {
						texts: string[];
						model?: string;
					};

					const model = body.model || "@cf/baai/bge-base-en-v1.5";

					const { embeddings } = await embedMany({
						model: workersai.textEmbedding(model as any),
						values: body.texts,
					});

					const similarities: number[][] = [];
					for (let i = 0; i < embeddings.length; i++) {
						similarities[i] = [];
						for (let j = 0; j < embeddings.length; j++) {
							similarities[i][j] = cosineSimilarity(embeddings[i], embeddings[j]);
						}
					}

					return Response.json({
						embeddings: embeddings.map((e) => ({
							dimensions: e.length,
							preview: e.slice(0, 5),
						})),
						similarities,
					});
				}

				default:
					return new Response("Not found", { status: 404 });
			}
		} catch (err) {
			console.error("[api error]", err);
			return Response.json(
				{ error: err instanceof Error ? err.message : "Internal server error" },
				{ status: 500 },
			);
		}
	},
} satisfies ExportedHandler<Env>;

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
