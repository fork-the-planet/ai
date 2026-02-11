export interface ModelOption {
	id: string;
	label: string;
}

export const chatModels: ModelOption[] = [
	{ id: "@cf/meta/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
	{ id: "@cf/moonshotai/kimi-k2.5", label: "Kimi K2.5" },
	{ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B" },
	{ id: "@cf/meta/llama-3.1-8b-instruct-fast", label: "Llama 3.1 8B Fast" },
	{ id: "@cf/qwen/qwen3-30b-a3b-fp8", label: "Qwen3 30B" },
];

export const imageModels: ModelOption[] = [
	{ id: "@cf/black-forest-labs/flux-1-schnell", label: "Flux 1 Schnell" },
	{ id: "@cf/stabilityai/stable-diffusion-xl-base-1.0", label: "Stable Diffusion XL" },
	{ id: "@cf/lykon/dreamshaper-8-lcm", label: "Dreamshaper 8" },
];

export const embeddingModels: ModelOption[] = [
	{ id: "@cf/baai/bge-base-en-v1.5", label: "BGE Base EN (768d)" },
	{ id: "@cf/baai/bge-large-en-v1.5", label: "BGE Large EN (1024d)" },
	{ id: "@cf/baai/bge-small-en-v1.5", label: "BGE Small EN (384d)" },
];
