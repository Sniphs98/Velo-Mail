// The main-process side of src/lib/api.ts. Everything arriving here comes from
// the renderer and is validated before use.
import { app, ipcMain, net, safeStorage } from 'electron';
import { resolveMx, resolveSrv } from 'node:dns/promises';
import { z } from 'zod';
import { IPC, type AppInfo } from '../src/lib/api';
import { discoverSettings } from './accounts/autoconfig';
import { testConnection } from './accounts/connection';
import { AccountService, serverSettingsSchema, type SecretBox } from './accounts/service';
import type { Database } from './db';

// Keychain on macOS, DPAPI on Windows, the desktop's keyring on Linux. Without
// a keyring Linux falls back to a fixed key (see AppInfo.keyring).
const secrets: SecretBox = {
	encrypt: (plain) => safeStorage.encryptStringAsync(plain),
	decrypt: async (encrypted) => (await safeStorage.decryptStringAsync(encrypted)).result
};

function hasKeyring() {
	return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text';
}

async function fetchText(url: string): Promise<string | null> {
	try {
		const response = await net.fetch(url, { signal: AbortSignal.timeout(8000) });
		return response.ok ? await response.text() : null;
	} catch {
		return null;
	}
}

export function registerIpc(db: Database) {
	const accounts = new AccountService(db, secrets, testConnection);

	ipcMain.handle(IPC.appInfo, (): AppInfo => ({
		name: app.getName(),
		version: app.getVersion(),
		platform: process.platform,
		keyring: hasKeyring()
	}));

	ipcMain.handle(IPC.accountsList, () => accounts.list());
	ipcMain.handle(IPC.accountsDiscover, (_event, email: unknown) =>
		discoverSettings(z.email().parse(email), { fetchText, resolveMx, resolveSrv })
	);
	ipcMain.handle(IPC.accountsTest, (_event, settings: unknown, password: unknown) =>
		testConnection(serverSettingsSchema.parse(settings), z.string().parse(password))
	);
	// AccountService validates the rest.
	ipcMain.handle(IPC.accountsAdd, (_event, account) => accounts.add(account));
	ipcMain.handle(IPC.accountsRemove, (_event, id) => accounts.remove(id));
}
