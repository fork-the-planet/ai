import { fetchHttpStream, useChat } from "@tanstack/ai-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "./config";

const PROVIDERS = {
	"workers-ai-plain": {
		label: "Llama 4 Scout",
		model: "@cf/meta/llama-4-scout-17b-16e-instruct",
		group: "Workers AI",
		badge: "Workers AI",
		badgeColor: "bg-emerald-100 text-emerald-700",
	},
	"workers-ai": {
		label: "Qwen3 30B",
		model: "@cf/qwen/qwen3-30b-a3b-fp8",
		group: "Workers AI via Gateway",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
	openai: {
		label: "GPT-5.2",
		model: "gpt-5.2",
		group: "Third-party via Gateway",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
	anthropic: {
		label: "Claude Sonnet 4.5",
		model: "claude-sonnet-4-5",
		group: "Third-party via Gateway",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
	gemini: {
		label: "Gemini 2.5 Flash",
		model: "gemini-2.5-flash",
		group: "Third-party via Gateway",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
	grok: {
		label: "Grok 4",
		model: "grok-4-1-fast-reasoning",
		group: "Third-party via Gateway",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
} as const;

type ProviderId = keyof typeof PROVIDERS;

export function ChatTab() {
	const [selectedProvider, setSelectedProvider] = useState<ProviderId>("workers-ai-plain");
	const provider = PROVIDERS[selectedProvider];
	const { headers } = useConfig();

	// Use a ref so the dynamic options callback always reads the latest headers
	// without causing the connection (and ChatClient) to be recreated.
	const headersRef = useRef(headers);
	headersRef.current = headers;

	const connection = useMemo(
		() =>
			fetchHttpStream(`/ai/${selectedProvider}`, () => ({
				headers: headersRef.current,
			})),
		[selectedProvider],
	);

	const { messages, sendMessage, error, isLoading, clear } = useChat({
		connection,
	});

	const [input, setInput] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Auto-scroll to bottom on new messages
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on message count change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length]);

	// Focus input on provider change
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on provider change
	useEffect(() => {
		inputRef.current?.focus();
	}, [selectedProvider]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (input.trim() && !isLoading) {
			sendMessage(input);
			setInput("");
		}
	};

	return (
		<div className="flex flex-col h-full">
			{/* Provider selector */}
			<div className="px-4 sm:px-6 pt-4 pb-3 border-b border-gray-200 bg-white">
				<div className="flex items-center justify-between mb-3">
					<div className="flex gap-1.5 flex-wrap">
						{Object.entries(PROVIDERS).map(([id, p]) => (
							<button
								key={id}
								type="button"
								onClick={() => {
									if (id !== selectedProvider) {
										setSelectedProvider(id as ProviderId);
										clear();
									}
								}}
								className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
									id === selectedProvider
										? "bg-gray-900 text-white shadow-sm"
										: "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
								}`}
							>
								{p.label}
							</button>
						))}
					</div>
					<button
						type="button"
						onClick={clear}
						disabled={messages.length === 0}
						className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-0 disabled:pointer-events-none transition-all"
					>
						Clear
					</button>
				</div>

				{/* Active provider info */}
				<div className="flex items-center gap-2">
					<span
						className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${provider.badgeColor}`}
					>
						{provider.badge}
					</span>
					<span className="text-xs text-gray-400">{provider.model}</span>
				</div>
			</div>

			{/* Error */}
			{error && (
				<div className="mx-4 sm:mx-6 mt-3 px-3 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
					{error.message}
				</div>
			)}

			{/* Messages */}
			<div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
				{messages.length === 0 ? (
					<div className="h-full flex items-center justify-center">
						<div className="text-center max-w-sm">
							<div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center mx-auto mb-4">
								<svg
									className="w-6 h-6 text-white"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<title>Chat</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
									/>
								</svg>
							</div>
							<p className="text-sm font-medium text-gray-900 mb-1">
								Chat with {provider.label}
							</p>
							<p className="text-xs text-gray-500 leading-relaxed">
								{selectedProvider === "workers-ai-plain"
									? "Using Workers AI directly. No gateway needed."
									: selectedProvider === "workers-ai"
										? "Using Workers AI routed through Cloudflare AI Gateway."
										: `Using ${provider.label} routed through Cloudflare AI Gateway.`}
							</p>
							<div className="mt-4 flex flex-wrap gap-1.5 justify-center">
								{["What can you do?", "Tell me a joke", "What time is it?"].map(
									(prompt) => (
										<button
											key={prompt}
											type="button"
											onClick={() => sendMessage(prompt)}
											className="px-3 py-1.5 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
										>
											{prompt}
										</button>
									),
								)}
							</div>
						</div>
					</div>
				) : (
					<div className="space-y-4 pb-2">
						{messages.map((message) => (
							<div
								key={message.id}
								className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
							>
								<div
									className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 ${
										message.role === "user"
											? "bg-gray-900 text-white"
											: "bg-white text-gray-900 border border-gray-200 shadow-sm"
									}`}
								>
									<div className="space-y-1">
										{message.parts.map((part, idx) => {
											if (part.type === "text") {
												return (
													<div
														key={`${message.id}-text-${idx}`}
														className="text-sm leading-relaxed whitespace-pre-wrap break-words"
													>
														{part.content}
													</div>
												);
											}
											if (
												part.type === "tool-call" ||
												part.type === "tool-result"
											) {
												return (
													<div
														key={`${message.id}-tool-${idx}`}
														className={`text-xs rounded-lg px-2.5 py-1.5 font-mono ${
															message.role === "user"
																? "bg-gray-800 text-gray-300"
																: "bg-gray-50 text-gray-500 border border-gray-100"
														}`}
													>
														<span className="font-semibold">
															{"toolName" in part
																? (
																		part as {
																			toolName: string;
																		}
																	).toolName
																: "tool"}
														</span>
														{"result" in part && (
															<span className="ml-1.5 opacity-75">
																{JSON.stringify(
																	(
																		part as {
																			result?: unknown;
																		}
																	).result,
																)}
															</span>
														)}
													</div>
												);
											}
											return null;
										})}
									</div>
								</div>
							</div>
						))}
						{isLoading && messages[messages.length - 1]?.role === "user" && (
							<div className="flex justify-start">
								<div className="bg-white border border-gray-200 shadow-sm rounded-2xl px-4 py-3">
									<div className="flex items-center gap-1.5">
										<div
											className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
											style={{ animationDelay: "0ms" }}
										/>
										<div
											className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
											style={{
												animationDelay: "150ms",
											}}
										/>
										<div
											className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
											style={{
												animationDelay: "300ms",
											}}
										/>
									</div>
								</div>
							</div>
						)}
						<div ref={messagesEndRef} />
					</div>
				)}
			</div>

			{/* Input */}
			<div className="p-4 sm:p-6 pt-3 sm:pt-4 border-t border-gray-200 bg-white">
				<form onSubmit={handleSubmit} className="flex gap-2">
					<input
						ref={inputRef}
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Send a message..."
						disabled={isLoading}
						className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
					/>
					<button
						type="submit"
						disabled={isLoading || !input.trim()}
						className="px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
					>
						{isLoading ? (
							<svg
								className="animate-spin h-4 w-4"
								viewBox="0 0 24 24"
								aria-label="Loading"
							>
								<title>Loading</title>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
									fill="none"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
						) : (
							<svg
								className="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<title>Send</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
								/>
							</svg>
						)}
					</button>
				</form>
				<p className="text-[10px] text-gray-400 mt-2 text-center">
					Tools available: sum, multiply, get_current_time, random_number, reverse_string,
					web_scrape
				</p>
			</div>
		</div>
	);
}
