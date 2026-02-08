import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// WorkersAiImageAdapter
// ---------------------------------------------------------------------------

describe("WorkersAiImageAdapter", () => {
	it("generateViaRest: throws on non-ok response", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response("Model not found", { status: 404 })) as any;

		const adapter = new WorkersAiImageAdapter(
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
			{ accountId: "abc", apiKey: "key" },
		);

		await expect(adapter.generate("a cat")).rejects.toThrow(
			/Workers AI image request failed \(404\)/,
		);

		globalThis.fetch = originalFetch;
	});

	it("generateViaBinding: handles Uint8Array result", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const fakeImage = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
		const mockBinding = {
			run: vi.fn().mockResolvedValue(fakeImage),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiImageAdapter(
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
			{ binding: mockBinding },
		);

		const result = await adapter.generate("a cat");

		expect(result.image).toBeTruthy();
		expect(typeof result.image).toBe("string");
		// Should be base64 encoded
		const decoded = atob(result.image);
		expect(decoded.charCodeAt(0)).toBe(137); // PNG magic byte
	});
});
