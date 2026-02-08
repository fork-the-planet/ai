import { describe, expect, it } from "vitest";
import {
	isDirectBindingConfig,
	isDirectCredentialsConfig,
	isGatewayConfig,
	type WorkersAiAdapterConfig,
} from "../src/utils/create-fetcher";

// ---------------------------------------------------------------------------
// Config detection helpers
// ---------------------------------------------------------------------------

describe("config detection", () => {
	it("isDirectBindingConfig: detects plain Workers AI binding ({ binding: env.AI })", () => {
		const binding = {
			run: (_model: string, _inputs: Record<string, unknown>) => Promise.resolve({}),
			gateway: (_id: string) => ({
				run: (_req: unknown) => Promise.resolve(new Response("ok")),
			}),
		};
		const config: WorkersAiAdapterConfig = { binding };
		expect(isDirectBindingConfig(config)).toBe(true);
	});

	it("isDirectBindingConfig: rejects gateway binding ({ binding: env.AI.gateway(id) })", () => {
		const binding = {
			run: (_request: unknown) => Promise.resolve(new Response("ok")),
		};
		const config: WorkersAiAdapterConfig = { binding };
		expect(isDirectBindingConfig(config)).toBe(false);
	});

	it("isDirectBindingConfig: rejects plain REST credentials", () => {
		const config: WorkersAiAdapterConfig = {
			accountId: "abc",
			apiKey: "key",
		};
		expect(isDirectBindingConfig(config)).toBe(false);
	});

	it("isDirectCredentialsConfig: detects plain REST credentials", () => {
		const config: WorkersAiAdapterConfig = {
			accountId: "abc",
			apiKey: "key",
		};
		expect(isDirectCredentialsConfig(config)).toBe(true);
	});

	it("isDirectCredentialsConfig: rejects gateway credentials (has gatewayId)", () => {
		const config = {
			accountId: "abc",
			apiKey: "key",
			gatewayId: "gw-1",
		} as WorkersAiAdapterConfig;
		expect(isDirectCredentialsConfig(config)).toBe(false);
	});

	it("isGatewayConfig: detects gateway binding ({ binding: ... })", () => {
		const binding = {
			run: (_request: unknown) => Promise.resolve(new Response("ok")),
		};
		const config: WorkersAiAdapterConfig = { binding };
		expect(isGatewayConfig(config)).toBe(true);
	});

	it("isGatewayConfig: detects gateway credentials ({ gatewayId: ... })", () => {
		const config = {
			accountId: "abc",
			gatewayId: "gw-1",
		} as WorkersAiAdapterConfig;
		expect(isGatewayConfig(config)).toBe(true);
	});

	it("isGatewayConfig: rejects plain binding ({ binding: env.AI })", () => {
		const binding = {
			run: (_model: string, _inputs: Record<string, unknown>) => Promise.resolve({}),
			gateway: (_id: string) => ({
				run: (_req: unknown) => Promise.resolve(new Response("ok")),
			}),
		};
		const config: WorkersAiAdapterConfig = { binding };
		expect(isGatewayConfig(config)).toBe(false);
	});

	it("isGatewayConfig: rejects plain REST", () => {
		const config: WorkersAiAdapterConfig = {
			accountId: "abc",
			apiKey: "key",
		};
		expect(isGatewayConfig(config)).toBe(false);
	});
});
