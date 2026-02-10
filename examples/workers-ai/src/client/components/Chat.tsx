import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo } from "react";
import { chatModels } from "./models";

export function Chat() {
	const [model, setModel] = useState(chatModels[0].id);

	return (
		<div className="tab-content">
			<div className="toolbar">
				<label>
					Model
					<select value={model} onChange={(e) => setModel(e.target.value)}>
						{chatModels.map((m) => (
							<option key={m.id} value={m.id}>
								{m.label}
							</option>
						))}
					</select>
				</label>
			</div>

			<ChatSession key={model} model={model} />
		</div>
	);
}

function ChatSession({ model }: { model: string }) {
	const transport = useMemo(
		() => new DefaultChatTransport({ api: "/api/chat", body: { model } }),
		[model],
	);

	const { messages, sendMessage, status, error } = useChat({ transport });
	const [input, setInput] = useState("");
	const isLoading = status === "streaming" || status === "submitted";

	// Scroll to bottom whenever messages or status change by using a
	// ref callback on the last element
	const scrollAnchorRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		scrollAnchorRef.current?.scrollIntoView({ behavior: "instant" });
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim() || isLoading) return;
		sendMessage({ text: input });
		setInput("");
	};

	return (
		<>
			<div className="messages">
				{messages.length === 0 && !error && (
					<div className="empty-state">
						Send a message to start chatting. Try asking about the weather to see tool
						calling in action.
					</div>
				)}
				{messages.map((message) => (
					<div key={message.id} className={`message ${message.role}`}>
						<div className="message-role">
							{message.role === "user" ? "You" : "Assistant"}
						</div>
						<div className="message-content">
							{message.parts.map((part, i) => {
								if (part.type === "text") {
									// biome-ignore lint/suspicious/noArrayIndexKey: index is used as key
									return <span key={i}>{part.text}</span>;
								}
								if (part.type === "reasoning") {
									return (
										// biome-ignore lint/suspicious/noArrayIndexKey: index is used as key
										<details key={i} className="reasoning" open>
											<summary>Reasoning</summary>
											<div className="reasoning-content">{part.text}</div>
										</details>
									);
								}
								if (part.type.startsWith("tool-")) {
									const toolName = part.type.slice(5);
									const toolPart = part as {
										input?: unknown;
										output?: unknown;
										state?: string;
									};
									return (
										// biome-ignore lint/suspicious/noArrayIndexKey: index is used as key
										<div key={i} className="tool-call">
											<div className="tool-name">Tool: {toolName}</div>
											{toolPart.input != null && (
												<div className="tool-args">
													{JSON.stringify(toolPart.input, null, 2)}
												</div>
											)}
											{toolPart.state === "output-available" && (
												<div className="tool-result">
													{JSON.stringify(toolPart.output, null, 2)}
												</div>
											)}
										</div>
									);
								}
								return null;
							})}
						</div>
					</div>
				))}
				{isLoading && messages[messages.length - 1]?.role !== "assistant" && (
					<div className="message assistant">
						<div className="message-role">Assistant</div>
						<div className="message-content typing">Thinking...</div>
					</div>
				)}
				<div ref={scrollAnchorRef} />
			</div>

			{error && (
				<div className="error">{error.message || "Something went wrong. Try again."}</div>
			)}

			<form className="input-bar" onSubmit={handleSubmit}>
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Ask anything... try 'What's the weather in Paris?'"
					disabled={isLoading}
				/>
				<button type="submit" disabled={isLoading || !input.trim()}>
					Send
				</button>
			</form>
		</>
	);
}
