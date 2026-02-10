import { useState } from "react";
import { Chat } from "./components/Chat";
import { Images } from "./components/Images";
import { Embeddings } from "./components/Embeddings";

const tabs = [
	{ id: "chat", label: "Chat" },
	{ id: "images", label: "Images" },
	{ id: "embeddings", label: "Embeddings" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function App() {
	const [activeTab, setActiveTab] = useState<TabId>("chat");

	return (
		<div className="app">
			<header>
				<h1>Workers AI</h1>
				<p>AI SDK provider for Cloudflare Workers AI</p>
			</header>

			<nav className="tabs">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						className={activeTab === tab.id ? "active" : ""}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</button>
				))}
			</nav>

			<main>
				{activeTab === "chat" && <Chat />}
				{activeTab === "images" && <Images />}
				{activeTab === "embeddings" && <Embeddings />}
			</main>
		</div>
	);
}
