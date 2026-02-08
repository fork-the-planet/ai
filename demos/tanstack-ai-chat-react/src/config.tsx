import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CloudflareConfig {
	accountId: string;
	gatewayId: string;
	apiToken: string;
}

interface ConfigContextValue {
	config: CloudflareConfig;
	setConfig: (config: CloudflareConfig) => void;
	isConfigured: boolean;
	/** Headers to include in every request to the worker */
	headers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "cf-tanstack-ai-config";

function loadConfig(): CloudflareConfig {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<CloudflareConfig>;
			return {
				accountId: parsed.accountId ?? "",
				gatewayId: parsed.gatewayId ?? "",
				apiToken: parsed.apiToken ?? "",
			};
		}
	} catch {
		// Ignore parse errors
	}
	return { accountId: "", gatewayId: "", apiToken: "" };
}

function saveConfig(config: CloudflareConfig) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	} catch {
		// Ignore storage errors (e.g. private browsing)
	}
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
	const [config, setConfigState] = useState<CloudflareConfig>(loadConfig);

	const setConfig = useCallback((next: CloudflareConfig) => {
		setConfigState(next);
		saveConfig(next);
	}, []);

	const isConfigured = !!(
		config.accountId.trim() &&
		config.gatewayId.trim() &&
		config.apiToken.trim()
	);

	const headers = useMemo((): Record<string, string> => {
		if (!isConfigured) return {};
		return {
			"X-CF-Account-Id": config.accountId.trim(),
			"X-CF-Gateway-Id": config.gatewayId.trim(),
			"X-CF-Api-Token": config.apiToken.trim(),
		};
	}, [config.accountId, config.gatewayId, config.apiToken, isConfigured]);

	const value = useMemo<ConfigContextValue>(
		() => ({ config, setConfig, isConfigured, headers }),
		[config, setConfig, isConfigured, headers],
	);

	return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
	const ctx = useContext(ConfigContext);
	if (!ctx) {
		throw new Error("useConfig must be used within a ConfigProvider");
	}
	return ctx;
}
