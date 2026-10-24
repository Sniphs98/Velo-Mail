// The API the preload script (electron/preload.ts) exposes to the renderer as
// `window.velo`. Main, preload and renderer share these types, so a change
// here is checked on both sides of the IPC boundary.

export interface AppInfo {
	name: string;
	version: string;
	platform: string;
}

export interface VeloApi {
	app: {
		info(): Promise<AppInfo>;
	};
}

declare global {
	interface Window {
		/** Set by electron/preload.ts; missing outside Electron. */
		velo?: VeloApi;
	}
}

/** IPC channel names, one per API call. */
export const IPC = {
	appInfo: 'app:info'
} as const;

/** The API, or undefined outside Electron (plain browser, component tests). */
export function velo(): VeloApi | undefined {
	return typeof window === 'undefined' ? undefined : window.velo;
}
