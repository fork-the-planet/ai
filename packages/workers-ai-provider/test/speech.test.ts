import { experimental_generateSpeech as generateSpeech } from "ai";
import { describe, expect, it } from "vitest";
import { createWorkersAI } from "../src/index";

// ---------------------------------------------------------------------------
// Basic speech generation
// ---------------------------------------------------------------------------

describe("Speech - Binding", () => {
	it("should generate speech from text (Uint8Array output)", async () => {
		let capturedInputs: any = null;
		const audioData = new Uint8Array([0x49, 0x44, 0x33]); // ID3 header stub

		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: any) => {
					capturedInputs = inputs;
					return audioData;
				},
			},
		});

		const result = await generateSpeech({
			model: workersai.speech("@cf/deepgram/aura-1"),
			text: "Hello world",
		});

		expect(result.audio).toBeDefined();
		expect(result.audio.uint8Array).toEqual(audioData);

		// Should send { text } to the model
		expect(capturedInputs.text).toBe("Hello world");
	});

	it("should handle ReadableStream output", async () => {
		const chunk1 = new Uint8Array([0x49, 0x44]);
		const chunk2 = new Uint8Array([0x33]);

		const workersai = createWorkersAI({
			binding: {
				run: async () =>
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(chunk1);
							controller.enqueue(chunk2);
							controller.close();
						},
					}),
			},
		});

		const result = await generateSpeech({
			model: workersai.speech("@cf/deepgram/aura-1"),
			text: "Streaming audio",
		});

		expect(result.audio).toBeDefined();
		expect(result.audio.uint8Array).toEqual(new Uint8Array([0x49, 0x44, 0x33]));
	});

	it("should handle ArrayBuffer output", async () => {
		const audioData = new Uint8Array([0x49, 0x44, 0x33]).buffer;

		const workersai = createWorkersAI({
			binding: {
				run: async () => audioData,
			},
		});

		const result = await generateSpeech({
			model: workersai.speech("@cf/deepgram/aura-1"),
			text: "Array buffer audio",
		});

		expect(result.audio).toBeDefined();
		expect(result.audio.uint8Array).toEqual(new Uint8Array([0x49, 0x44, 0x33]));
	});

	it("should handle { audio: base64 } object output", async () => {
		const b64 = btoa("audio-data");

		const workersai = createWorkersAI({
			binding: {
				run: async () => ({ audio: b64 }),
			},
		});

		const result = await generateSpeech({
			model: workersai.speech("@cf/deepgram/aura-1"),
			text: "Base64 audio",
		});

		expect(result.audio).toBeDefined();
		const decoded = new TextDecoder().decode(result.audio.uint8Array);
		expect(decoded).toBe("audio-data");
	});

	it("should pass voice and speed options", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: any) => {
					capturedInputs = inputs;
					return new Uint8Array([0x00]);
				},
			},
		});

		await generateSpeech({
			model: workersai.speech("@cf/deepgram/aura-1"),
			text: "With options",
			voice: "asteria",
			speed: 1.5,
		});

		expect(capturedInputs.text).toBe("With options");
		expect(capturedInputs.voice).toBe("asteria");
		expect(capturedInputs.speed).toBe(1.5);
	});

	it("should warn on unsupported instructions", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => new Uint8Array([0x00]),
			},
		});

		const result = await generateSpeech({
			model: workersai.speech("@cf/deepgram/aura-1"),
			text: "Test",
			instructions: "Speak slowly",
		});

		expect(result.warnings).toBeDefined();
		expect(result.warnings.some((w: any) => w.feature === "instructions")).toBe(true);
	});

	it("should throw on unexpected output format", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => "unexpected string",
			},
		});

		await expect(
			generateSpeech({
				model: workersai.speech("@cf/deepgram/aura-1"),
				text: "Test",
			}),
		).rejects.toThrow(/Unexpected output type/);
	});
});

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

describe("Speech - Provider", () => {
	it("speechModel() is an alias for speech()", () => {
		const workersai = createWorkersAI({
			binding: { run: async () => ({}) },
		});

		const s1 = workersai.speech("@cf/deepgram/aura-1");
		const s2 = workersai.speechModel("@cf/deepgram/aura-1");

		expect(s1.modelId).toBe(s2.modelId);
		expect(s1.provider).toBe("workersai.speech");
	});
});
