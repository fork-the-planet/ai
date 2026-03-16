export type WorkersAIChatSettings = {
	/**
	 * Whether to inject a safety prompt before all conversations.
	 * Defaults to `false`.
	 */
	safePrompt?: boolean;

	/**
	 * Optionally set Cloudflare AI Gateway options.
	 */
	gateway?: GatewayOptions;

	/**
	 * Session affinity key for prefix-cache optimization.
	 * Routes requests with the same key to the same backend replica.
	 */
	sessionAffinity?: string;

	/**
	 * Passthrough settings that are provided directly to the run function.
	 * Use this for any provider-specific options not covered by the typed fields.
	 */
	[key: string]: unknown;
};
