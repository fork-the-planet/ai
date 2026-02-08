import { useState } from "react";
import { ChatTab } from "./ChatTab";
import { ImageTab } from "./ImageTab";
import { SummarizeTab } from "./SummarizeTab";
import { ConfigProvider, useConfig } from "./config";

const TABS = {
	chat: {
		label: "Chat",
		icon: (
			<svg
				className="w-4 h-4"
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
		),
	},
	images: {
		label: "Images",
		icon: (
			<svg
				className="w-4 h-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={2}
			>
				<title>Images</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
				/>
			</svg>
		),
	},
	summarize: {
		label: "Summarize",
		icon: (
			<svg
				className="w-4 h-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={2}
			>
				<title>Summarize</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
				/>
			</svg>
		),
	},
} as const;

type TabId = keyof typeof TABS;

function AppContent() {
	const [activeTab, setActiveTab] = useState<TabId>("chat");
	const [showSettings, setShowSettings] = useState(false);
	const { config, setConfig, isConfigured } = useConfig();

	return (
		<div className="size-full flex flex-col bg-gray-50">
			<div className="max-w-3xl w-full mx-auto flex flex-col h-full">
				{/* Header */}
				<header className="px-4 sm:px-6 pt-4 sm:pt-6 pb-0 bg-white">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2.5">
							<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
								<svg
									className="w-4 h-4 text-white"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2.5}
								>
									<title>Logo</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
									/>
								</svg>
							</div>
							<div>
								<h1 className="text-base font-semibold text-gray-900">
									@cloudflare/tanstack-ai
								</h1>
								<p className="text-xs text-gray-500">Multi-provider AI demo</p>
							</div>
						</div>
						<button
							type="button"
							onClick={() => setShowSettings((s) => !s)}
							className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
								isConfigured
									? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
									: "text-amber-700 bg-amber-50 hover:bg-amber-100"
							}`}
						>
							<svg
								className="w-3.5 h-3.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<title>Settings</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
								/>
							</svg>
							{isConfigured ? "Configured" : "Add API keys"}
						</button>
					</div>

					{/* Settings panel (collapsible) */}
					{showSettings && (
						<div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
							<div className="flex items-center justify-between mb-3">
								<p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
									Cloudflare credentials
								</p>
								{isConfigured && (
									<button
										type="button"
										onClick={() =>
											setConfig({
												accountId: "",
												gatewayId: "",
												apiToken: "",
											})
										}
										className="text-[10px] text-red-500 hover:text-red-700 font-medium"
									>
										Clear all
									</button>
								)}
							</div>
							<p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
								Enter your Cloudflare credentials to use this demo with your own
								account. Credentials are stored in your browser only and sent as
								request headers to the worker.
							</p>
							<div className="grid gap-2.5">
								<div>
									<label
										htmlFor="cfg-account"
										className="block text-[10px] font-medium text-gray-600 mb-0.5"
									>
										Account ID
									</label>
									<input
										id="cfg-account"
										type="text"
										value={config.accountId}
										onChange={(e) =>
											setConfig({
												...config,
												accountId: e.target.value,
											})
										}
										placeholder="e.g. abc123def456..."
										className="w-full px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
									/>
								</div>
								<div>
									<label
										htmlFor="cfg-gateway"
										className="block text-[10px] font-medium text-gray-600 mb-0.5"
									>
										AI Gateway ID
									</label>
									<input
										id="cfg-gateway"
										type="text"
										value={config.gatewayId}
										onChange={(e) =>
											setConfig({
												...config,
												gatewayId: e.target.value,
											})
										}
										placeholder="e.g. my-gateway"
										className="w-full px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
									/>
								</div>
								<div>
									<label
										htmlFor="cfg-token"
										className="block text-[10px] font-medium text-gray-600 mb-0.5"
									>
										Cloudflare API Token
									</label>
									<input
										id="cfg-token"
										type="password"
										value={config.apiToken}
										onChange={(e) =>
											setConfig({
												...config,
												apiToken: e.target.value,
											})
										}
										placeholder="Your Cloudflare API token"
										className="w-full px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
									/>
								</div>
							</div>
							{!isConfigured && (
								<p className="mt-2.5 text-[10px] text-amber-600">
									All three fields are required. Without credentials, the demo
									falls back to server-configured environment variables.
								</p>
							)}
						</div>
					)}

					{/* Tab bar */}
					<div className="flex border-b border-gray-200 -mb-px">
						{Object.entries(TABS).map(([id, tab]) => (
							<button
								key={id}
								type="button"
								onClick={() => setActiveTab(id as TabId)}
								className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
									id === activeTab
										? "border-gray-900 text-gray-900"
										: "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
								}`}
							>
								{tab.icon}
								{tab.label}
							</button>
						))}
					</div>
				</header>

				{/* Tab content */}
				<div className="flex-1 flex flex-col overflow-hidden">
					{activeTab === "chat" && <ChatTab />}
					{activeTab === "images" && <ImageTab />}
					{activeTab === "summarize" && <SummarizeTab />}
				</div>
			</div>
		</div>
	);
}

function App() {
	return (
		<ConfigProvider>
			<AppContent />
		</ConfigProvider>
	);
}

export default App;
