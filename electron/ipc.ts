// The main-process side of src/lib/api.ts. Everything arriving here comes from
// the renderer and is validated before use.
import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveMx, resolveSrv } from 'node:dns/promises';
import { z } from 'zod';
import { IPC, type AppInfo } from '../src/lib/api';
import { discoverSettings } from './accounts/autoconfig';
import { testConnection } from './accounts/connection';
import { AccountService, serverSettingsSchema, type SecretBox } from './accounts/service';
import type { Database } from './db';
import { SyncManager } from './mail/manager';
import { isRunnable, safeFilename } from './mail/files';
import { listMailboxes, listMessages } from './mail/queries';

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

/** Sends an event to every window. */
function broadcast(channel: string, ...args: unknown[]) {
	for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, ...args);
}

const messageQuerySchema = z.union([
	z.object({ mailboxId: z.number().int() }),
	z.object({ inboxes: z.literal(true) })
]);

/** Registers the handlers and starts syncing; returns the sync manager. */
export function registerIpc(db: Database) {
	const accounts = new AccountService(db, secrets, testConnection);
	const sync = new SyncManager({
		db,
		credentials: (id) => accounts.credentials(id),
		onChanged: () => broadcast(IPC.mailChanged),
		onStatus: (status) => broadcast(IPC.mailStatus, status)
	});

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
	ipcMain.handle(IPC.accountsAdd, async (_event, account) => {
		const result = await accounts.add(account);
		if (result.ok) sync.start(result.account.id);
		return result;
	});
	ipcMain.handle(IPC.accountsRemove, async (_event, id: unknown) => {
		const accountId = z.number().int().parse(id);
		await sync.stop(accountId);
		await accounts.remove(accountId);
		broadcast(IPC.mailChanged);
	});

	ipcMain.handle(IPC.mailMailboxes, () => listMailboxes(db));
	ipcMain.handle(IPC.mailMessages, (_event, query: unknown) =>
		listMessages(db, messageQuerySchema.parse(query))
	);
	ipcMain.handle(IPC.mailSetSeen, (_event, id: unknown, seen: unknown) =>
		sync.setSeen(z.number().int().parse(id), z.boolean().parse(seen))
	);
	ipcMain.handle(IPC.mailBody, (_event, id: unknown) => sync.body(z.number().int().parse(id)));
	ipcMain.handle(IPC.mailOpenAttachment, async (_event, id: unknown) => {
		const file = await sync.attachment(z.number().int().parse(id));
		const filename = safeFilename(file.filename, file.contentType);
		if (isRunnable(filename)) return false;
		const dir = path.join(app.getPath('temp'), 'velo-mail', String(id));
		await mkdir(dir, { recursive: true });
		const target = path.join(dir, filename);
		await writeFile(target, file.content);
		const error = await shell.openPath(target);
		if (error) throw new Error(error);
		return true;
	});
	ipcMain.handle(IPC.mailSaveAttachment, async (event, id: unknown) => {
		const file = await sync.attachment(z.number().int().parse(id));
		const window = BrowserWindow.fromWebContents(event.sender);
		const options = {
			defaultPath: path.join(
				app.getPath('downloads'),
				safeFilename(file.filename, file.contentType)
			)
		};
		const result = window
			? await dialog.showSaveDialog(window, options)
			: await dialog.showSaveDialog(options);
		if (result.canceled || !result.filePath) return false;
		await writeFile(result.filePath, file.content);
		return true;
	});
	ipcMain.handle(IPC.mailSync, async (_event, id: unknown) => {
		const ids =
			id === undefined
				? (await accounts.list()).map((account) => account.id)
				: [z.number().int().parse(id)];
		await Promise.all(ids.map((accountId) => sync.syncNow(accountId)));
	});

	accounts.list().then((list) => {
		for (const account of list) sync.start(account.id);
	});
	return sync;
}
