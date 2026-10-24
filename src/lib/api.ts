// The API the preload script (electron/preload.ts) exposes to the renderer as
// `window.velo`. Main, preload and renderer share these types, so a change
// here is checked on both sides of the IPC boundary.

export interface AppInfo {
	name: string;
	version: string;
	platform: string;
	/** False on Linux without a keyring: passwords are then only obfuscated. */
	keyring: boolean;
}

export type Security = 'tls' | 'starttls' | 'none';

export interface ServerSettings {
	imapHost: string;
	imapPort: number;
	imapSecurity: Security;
	smtpHost: string;
	smtpPort: number;
	smtpSecurity: Security;
	username: string;
}

export interface Discovery {
	settings: ServerSettings;
	/** Where the settings came from; "guess" means common host names were assumed. */
	source: 'autoconfig' | 'ispdb' | 'srv' | 'guess';
}

/** Why a connection failed, for a message in the UI. */
export type ConnectionError = 'auth' | 'host' | 'timeout' | 'tls' | 'other';

export interface ConnectionResult {
	imap: { ok: true } | { ok: false; error: ConnectionError; detail: string };
	smtp: { ok: true } | { ok: false; error: ConnectionError; detail: string };
}

export interface NewAccount {
	name: string;
	email: string;
	password: string;
	settings: ServerSettings;
}

export interface Account {
	id: number;
	name: string;
	email: string;
	color: string;
}

/** Result of accounts.add: the saved account, or why it was not saved. */
export type AddAccountResult =
	| { ok: true; account: Account }
	| { ok: false; reason: 'exists' | 'connection'; connection?: ConnectionResult };

export interface VeloApi {
	app: {
		info(): Promise<AppInfo>;
	};
	accounts: {
		list(): Promise<Account[]>;
		/** Looks up the server settings for an address. */
		discover(email: string): Promise<Discovery>;
		/** Logs in to IMAP and SMTP without saving anything. */
		test(settings: ServerSettings, password: string): Promise<ConnectionResult>;
		/** Tests the connection, then saves the account with its password encrypted. */
		add(account: NewAccount): Promise<AddAccountResult>;
		remove(id: number): Promise<void>;
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
	appInfo: 'app:info',
	accountsList: 'accounts:list',
	accountsDiscover: 'accounts:discover',
	accountsTest: 'accounts:test',
	accountsAdd: 'accounts:add',
	accountsRemove: 'accounts:remove'
} as const;

/** The API, or undefined outside Electron (plain browser, component tests). */
export function velo(): VeloApi | undefined {
	return typeof window === 'undefined' ? undefined : window.velo;
}
