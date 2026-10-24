// The main-process side of src/lib/api.ts. Everything arriving here comes from
// the renderer and is validated before use.
import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } from 'electron';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveMx, resolveSrv } from 'node:dns/promises';
import { z } from 'zod';
import { IPC, type AppInfo } from '../src/lib/api';
import { discoverSettings } from './accounts/autoconfig';
import { testConnection } from './accounts/connection';
import { AccountService, serverSettingsSchema, type SecretBox } from './accounts/service';
import type { Database } from './db';
import type { Desktop } from './desktop';
import { readSettings, writeSettings } from './settings';
import { SyncManager } from './mail/manager';
import { isRunnable, safeFilename } from './mail/files';
import {
	listMailboxes,
	listMessages,
	listThread,
	searchMessages,
	trustSender,
	unreadInInboxes
} from './mail/queries';

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

// Only files the user picked in the file dialog may be attached, so the page
// cannot mail arbitrary files from the disk.
const pickedFiles = new Set<string>();

const outgoingSchema = z.object({
	accountId: z.number().int(),
	to: z.string().max(10_000),
	cc: z.string().max(10_000),
	bcc: z.string().max(10_000),
	subject: z.string().max(1000),
	text: z.string().max(10_000_000),
	attachments: z.array(
		z.object({
			path: z.string().refine((file) => pickedFiles.has(file), 'Datei wurde nicht ausgewählt'),
			name: z.string().max(255),
			size: z.number()
		})
	),
	replyTo: z.number().int().optional(),
	inReplyTo: z.string().max(1000).optional(),
	references: z.array(z.string().max(1000)).max(200).optional(),
	draftUid: z.number().int().optional()
});

const messageQuerySchema = z.union([
	z.object({ mailboxId: z.number().int() }),
	z.object({ inboxes: z.literal(true) })
]);

/** Registers the handlers and starts syncing; returns the sync manager. */
export function registerIpc(db: Database, desktop: Desktop) {
	const accounts = new AccountService(db, secrets, testConnection);
	const changed = () => {
		broadcast(IPC.mailChanged);
		unreadInInboxes(db).then((count) => desktop.setUnread(count));
	};
	const sync = new SyncManager({
		db,
		credentials: (id) => accounts.credentials(id),
		onChanged: changed,
		onStatus: (status) => broadcast(IPC.mailStatus, status),
		onNewMail: async (accountId, mails) => {
			const account = (await accounts.list()).find((a) => a.id === accountId);
			if (account) desktop.notify(account.name, mails);
		}
	});

	readSettings(db).then((settings) => desktop.apply(settings));
	ipcMain.handle(IPC.settingsGet, () => readSettings(db));
	ipcMain.handle(IPC.settingsSet, async (_event, changes: unknown) => {
		const settings = await writeSettings(db, changes);
		desktop.apply(settings);
		return settings;
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
	ipcMain.handle(IPC.accountsUpdate, (_event, id: unknown, changes) =>
		accounts.update(z.number().int().parse(id), changes)
	);
	ipcMain.handle(IPC.accountsRemove, async (_event, id: unknown) => {
		const accountId = z.number().int().parse(id);
		await sync.stop(accountId);
		await accounts.remove(accountId);
		changed();
	});

	ipcMain.handle(IPC.mailMailboxes, () => listMailboxes(db));
	ipcMain.handle(IPC.mailMessages, (_event, query: unknown) =>
		listMessages(db, messageQuerySchema.parse(query))
	);
	ipcMain.handle(IPC.mailSetSeen, (_event, id: unknown, seen: unknown) =>
		sync.setSeen(z.number().int().parse(id), z.boolean().parse(seen))
	);
	ipcMain.handle(IPC.mailThread, (_event, id: unknown) =>
		listThread(db, z.number().int().parse(id))
	);
	ipcMain.handle(IPC.mailTrustSender, (_event, address: unknown) =>
		trustSender(db, z.email().parse(address))
	);
	ipcMain.handle(IPC.mailReplySource, (_event, id: unknown) =>
		sync.replySource(z.number().int().parse(id))
	);
	ipcMain.handle(IPC.mailPickFiles, async (event) => {
		const window = BrowserWindow.fromWebContents(event.sender);
		const options = {
			properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[]
		};
		const result = window
			? await dialog.showOpenDialog(window, options)
			: await dialog.showOpenDialog(options);
		return Promise.all(
			result.filePaths.map(async (file) => {
				pickedFiles.add(file);
				return { path: file, name: path.basename(file), size: (await stat(file)).size };
			})
		);
	});
	ipcMain.handle(IPC.mailSend, (_event, message: unknown) =>
		sync.send(outgoingSchema.parse(message))
	);
	ipcMain.handle(IPC.mailSaveDraft, (_event, message: unknown) =>
		sync.saveDraft(outgoingSchema.parse(message))
	);
	ipcMain.handle(IPC.mailDeleteDraft, (_event, accountId: unknown, uid: unknown) =>
		sync.deleteDraft(z.number().int().parse(accountId), z.number().int().parse(uid))
	);
	ipcMain.handle(IPC.mailMove, (_event, ids: unknown, to: unknown) =>
		sync.move(
			z.array(z.number().int()).max(1000).parse(ids),
			z.enum(['archive', 'trash']).parse(to)
		)
	);
	ipcMain.handle(IPC.mailSearch, (_event, query: unknown) =>
		searchMessages(db, z.string().max(1000).parse(query))
	);
	ipcMain.handle(IPC.mailSearchServer, (_event, query: unknown) =>
		sync.searchServer(z.string().trim().min(1).max(1000).parse(query))
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
