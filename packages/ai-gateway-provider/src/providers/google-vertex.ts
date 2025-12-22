import { createVertex as createVertexOriginal } from "@ai-sdk/google-vertex/edge";
import { CF_TEMP_TOKEN } from "../auth";

export const createVertex = (...args: Parameters<typeof createVertexOriginal>) => {
	const [config] = args;
	// In v6, apiKey is a top-level property for express mode authentication
	const configWithApiKey = {
		...config,
		apiKey: config?.apiKey ?? CF_TEMP_TOKEN,
	};
	return createVertexOriginal(configWithApiKey);
};
