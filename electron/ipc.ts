// The main-process side of src/lib/api.ts. Everything arriving here comes from
// the renderer and is validated before use.
import { m } from '../src/lib/paraglide/messages.js';
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	net,
	safeStorage,
	shell,
	type IpcMainInvokeEvent
} from 'electron';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveMx, resolveSrv, resolveTxt } from 'node:dns/promises';
import { z } from 'zod';
import { IPC, type AppInfo, type Settings } from '../src/lib/api';
import { discoverSettings } from './accounts/autoconfig';
import { testConnection } from './accounts/connection';
import { AccountService, serverSettingsSchema, type SecretBox } from './accounts/service';
import { Avatars, type Fetched } from './avatars';
import type { Database } from './db';
import { notifiable, type Desktop } from './desktop';
import { useLanguage } from './i18n';
import { readSettings, writeSettings } from './settings';
import { Updater } from './update/updater';
import { Invitations } from './calendar/invitations';
import { CalendarManager } from './calendar/manager';
import { Reminders } from './calendar/reminders';
import { CalendarSources } from './calendar/service';
import { SyncManager } from './mail/manager';
import { canOpen, markFromInternet, safeFilename } from './mail/files';
import {
	listMailboxes,
	listMessages,
	listThread,
	messagesFromSender,
	newsletterSenders,
	searchMessages,
	listSenderRules,
	listTrustedSenders,
	setSenderRule,
	suggestAddresses,
	trustSender,
	untrustSender,
	unreadInInboxes
} from './mail/queries';
import { oneClickPost, unsubscribe } from './mail/unsubscribe';

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

/** Downloads at most `maxBytes` over https (or their start with `truncate`); null otherwise. */
async function fetchBytes(
	url: string,
	maxBytes: number,
	{ truncate = false } = {}
): Promise<Fetched | null> {
	try {
		const response = await net.fetch(url, {
			signal: AbortSignal.timeout(6000),
			credentials: 'omit',
			headers: { accept: 'image/*,text/html;q=0.8' }
		});
		// Redirects must stay on https.
		if (!response.ok || !response.url.startsWith('https://') || !response.body) return null;
		if (!truncate && Number(response.headers.get('content-length') ?? 0) > maxBytes) return null;
		const chunks: Uint8Array[] = [];
		let size = 0;
		for await (const chunk of response.body) {
			if (size + chunk.length > maxBytes) {
				if (!truncate) return null;
				chunks.push(chunk.subarray(0, maxBytes - size));
				break;
			}
			size += chunk.length;
			chunks.push(chunk);
		}
		return {
			contentType: response.headers.get('content-type') ?? '',
			data: Buffer.concat(chunks)
		};
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
	html: z.string().max(20_000_000).optional(),
	forwardAttachments: z.array(z.number().int()).max(100).optional(),
	attachments: z.array(
		z.object({
			path: z
				.string()
				.refine((file) => pickedFiles.has(file), { error: () => m.error_file_not_picked() }),
			name: z.string().max(255),
			size: z.number()
		})
	),
	replyTo: z.number().int().optional(),
	inReplyTo: z.string().max(1000).optional(),
	references: z.array(z.string().max(1000)).max(200).optional(),
	draftUid: z.number().int().optional()
});

const senderSchema = z.string().trim().min(1).max(320);
const accountIdsSchema = z.array(z.number().int()).max(100);

const searchSchema = z.object({
	text: z.string().max(1000),
	accounts: z.array(z.number().int()).max(100),
	from: z.string().max(500),
	since: z.number().int().nullable(),
	until: z.number().int().nullable(),
	attachments: z.boolean(),
	unread: z.boolean(),
	newsletters: z.enum(['only', 'hide']).nullable()
});

const tab = z.enum(['primary', 'newsletters']).optional();
const messageQuerySchema = z.union([
	z.object({ mailboxId: z.number().int(), tab }),
	z.object({ inboxes: z.literal(true), tab })
]);

/**
 * Registers the handlers and starts syncing; returns the sync manager.
 * `isAppUrl` tells the app's own page from anything else.
 */
export function registerIpc(db: Database, desktop: Desktop, isAppUrl: (url: string) => boolean) {
	/** Like ipcMain.handle, but only for the app's page itself, not a frame in it. */
	const handle = (
		channel: string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each handler validates its own arguments
		listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown
	) =>
		ipcMain.handle(channel, (event, ...args) => {
			const frame = event.senderFrame;
			if (!frame || frame !== event.sender.mainFrame || !isAppUrl(frame.url)) {
				throw new Error(m.error_request_denied());
			}
			return listener(event, ...args);
		});

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
			if (account) desktop.notify(account.name, notifiable(account.notify, mails));
		}
	});

	const avatars = new Avatars({ db, fetchBytes, resolveTxt });
	const updater = new Updater((percent) => broadcast(IPC.appUpdateProgress, percent));
	const calendarSources = new CalendarSources(db, secrets);
	const reminders = new Reminders({
		db,
		notify: (reminder) => desktop.remind(reminder),
		enabled: async () => (await readSettings(db)).reminders
	});
	const calendar = new CalendarManager({
		db,
		sources: calendarSources,
		onChanged: () => {
			broadcast(IPC.calendarChanged);
			// A synced or changed event may have a reminder due right now.
			reminders.check().catch(() => {});
		}
	});
	calendar.start();
	reminders.start();
	const eventSchema = z
		.object({
			summary: z.string().max(1000),
			location: z.string().max(1000).optional(),
			description: z.string().max(100_000).optional(),
			start: z.number().int(),
			end: z.number().int(),
			allDay: z.boolean(),
			// Up to four weeks before.
			reminder: z.number().int().min(0).max(40_320).nullable().optional()
		})
		.refine((event) => event.end >= event.start, { error: () => m.event_end_before_start() });
	const id = z.number().int();
	handle(IPC.calendarSources, () => calendarSources.list());
	// CalendarSources validates the rest.
	handle(IPC.calendarAddSource, async (_event, source) => {
		const result = await calendarSources.add(source);
		if (result.ok) calendar.syncSource(result.source.id).catch(() => {});
		return result;
	});
	handle(IPC.calendarRemoveSource, async (_event, sourceId: unknown) => {
		const valid = id.parse(sourceId);
		calendar.forget(valid);
		await calendarSources.remove(valid);
		broadcast(IPC.calendarChanged);
	});
	handle(IPC.calendarCalendars, () => calendar.calendars());
	handle(IPC.calendarUpdateCalendar, (_event, calendarId: unknown, changes: unknown) =>
		calendar.updateCalendar(id.parse(calendarId), changes)
	);
	handle(IPC.calendarEvents, (_event, from: unknown, to: unknown) =>
		calendar.events(id.parse(from), id.parse(to))
	);
	handle(IPC.calendarCreateEvent, (_event, calendarId: unknown, event: unknown) =>
		calendar.create(id.parse(calendarId), eventSchema.parse(event))
	);
	const recurrenceId = z.string().max(100);
	const occurrenceSchema = z.object({ start: id, recurrenceId, only: z.boolean() });
	handle(IPC.calendarUpdateEvent, (_event, eventId: unknown, event: unknown, occurrence: unknown) =>
		calendar.update(
			id.parse(eventId),
			eventSchema.parse(event),
			occurrenceSchema.optional().parse(occurrence)
		)
	);
	handle(IPC.calendarDeleteEvent, (_event, eventId: unknown, occurrence: unknown) =>
		calendar.delete(id.parse(eventId), recurrenceId.optional().parse(occurrence))
	);
	handle(IPC.calendarSync, () => calendar.syncAll());

	const invitations = new Invitations({
		db,
		calendar,
		body: (messageId) => sync.body(messageId),
		send: (message, ics) => sync.send(message, ics),
		account: async (accountId) => (await accounts.list()).find((a) => a.id === accountId) ?? null
	});
	handle(IPC.mailInvitation, (_event, messageId: unknown) =>
		invitations.invitation(id.parse(messageId))
	);
	handle(
		IPC.mailRespondToInvitation,
		(_event, messageId: unknown, response: unknown, calendarId: unknown) =>
			invitations.respond(
				id.parse(messageId),
				z.enum(['accepted', 'tentative', 'declined']).parse(response),
				id.nullable().parse(calendarId)
			)
	);
	handle(IPC.mailRemoveCancelledEvent, (_event, messageId: unknown) =>
		invitations.removeCancelled(id.parse(messageId))
	);
	handle(IPC.appCheckUpdate, () => updater.check());
	handle(IPC.appInstallUpdate, () => updater.install());
	handle(IPC.appRestartToUpdate, () => updater.restart());

	const apply = (settings: Settings) => {
		useLanguage(settings.language, app.getLocale());
		desktop.apply(settings);
	};
	readSettings(db).then(apply);
	handle(IPC.settingsGet, () => readSettings(db));
	handle(IPC.settingsSet, async (_event, changes: unknown) => {
		const settings = await writeSettings(db, changes);
		apply(settings);
		return settings;
	});

	handle(IPC.appInfo, (): AppInfo => ({
		name: app.getName(),
		version: app.getVersion(),
		platform: process.platform,
		keyring: hasKeyring()
	}));

	handle(IPC.accountsList, () => accounts.list());
	handle(IPC.accountsDiscover, (_event, email: unknown) =>
		discoverSettings(z.email().parse(email), { fetchText, resolveMx, resolveSrv })
	);
	handle(IPC.accountsTest, (_event, settings: unknown, password: unknown) =>
		testConnection(serverSettingsSchema.parse(settings), z.string().parse(password))
	);
	// AccountService validates the rest.
	handle(IPC.accountsAdd, async (_event, account) => {
		const result = await accounts.add(account);
		if (result.ok) sync.start(result.account.id);
		return result;
	});
	handle(IPC.accountsUpdate, (_event, id: unknown, changes) =>
		accounts.update(z.number().int().parse(id), changes)
	);
	handle(IPC.accountsRemove, async (_event, id: unknown) => {
		const accountId = z.number().int().parse(id);
		await sync.stop(accountId);
		await accounts.remove(accountId);
		changed();
	});

	handle(IPC.mailMailboxes, () => listMailboxes(db));
	handle(IPC.mailMessages, (_event, query: unknown) =>
		listMessages(db, messageQuerySchema.parse(query))
	);
	handle(IPC.mailSetSeen, (_event, id: unknown, seen: unknown) =>
		sync.setSeen(z.number().int().parse(id), z.boolean().parse(seen))
	);
	handle(IPC.mailMarkAllSeen, (_event, query: unknown) =>
		sync.markAllSeen(messageQuerySchema.parse(query))
	);
	handle(IPC.mailThread, (_event, id: unknown) => listThread(db, z.number().int().parse(id)));
	handle(IPC.mailSetSenderRule, async (_event, address: unknown, rule: unknown) => {
		await setSenderRule(
			db,
			senderSchema.parse(address),
			z.enum(['newsletter', 'primary']).nullable().parse(rule)
		);
		changed();
	});
	handle(IPC.mailSenderRules, () => listSenderRules(db));
	handle(IPC.mailNewsletterSenders, (_event, accountIds: unknown) =>
		newsletterSenders(db, accountIdsSchema.parse(accountIds))
	);
	handle(IPC.mailMoveFromSender, async (_event, address: unknown, accountIds: unknown, to) => {
		const ids = await messagesFromSender(
			db,
			senderSchema.parse(address),
			accountIdsSchema.parse(accountIds),
			z.enum(['archive', 'trash']).parse(to)
		);
		await sync.move(ids, z.enum(['archive', 'trash']).parse(to));
		return ids.length;
	});
	handle(IPC.mailUnsubscribe, (_event, id: unknown) =>
		unsubscribe(
			db,
			z.number().int().parse(id),
			oneClickPost((url, init) => net.fetch(String(url), init))
		)
	);
	handle(IPC.mailTrustSender, (_event, address: unknown) =>
		trustSender(db, z.email().parse(address))
	);
	handle(IPC.mailTrustedSenders, () => listTrustedSenders(db));
	handle(IPC.mailUntrustSender, (_event, address: unknown) =>
		untrustSender(db, senderSchema.parse(address))
	);
	handle(IPC.mailSuggestAddresses, async (_event, text: unknown) =>
		suggestAddresses(
			db,
			z.string().max(200).parse(text),
			(await accounts.list()).map((account) => account.email)
		)
	);
	handle(IPC.mailAvatar, async (_event, address: unknown, name: unknown) => {
		const valid = z.email().safeParse(address);
		if (!valid.success || !(await readSettings(db)).avatars) return null;
		return avatars.find(valid.data, z.string().max(500).nullish().parse(name) ?? null);
	});
	handle(IPC.mailReplySource, (_event, id: unknown) =>
		sync.replySource(z.number().int().parse(id))
	);
	handle(IPC.mailPickFiles, async (event) => {
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
	handle(IPC.mailSend, (_event, message: unknown) => sync.send(outgoingSchema.parse(message)));
	handle(IPC.mailSaveDraft, (_event, message: unknown) =>
		sync.saveDraft(outgoingSchema.parse(message))
	);
	handle(IPC.mailDeleteDraft, (_event, accountId: unknown, uid: unknown) =>
		sync.deleteDraft(z.number().int().parse(accountId), z.number().int().parse(uid))
	);
	handle(IPC.mailMove, (_event, ids: unknown, to: unknown) =>
		sync.move(
			z.array(z.number().int()).max(1000).parse(ids),
			z.enum(['archive', 'trash']).parse(to)
		)
	);
	handle(IPC.mailSearch, (_event, query: unknown) => searchMessages(db, searchSchema.parse(query)));
	handle(IPC.mailSearchServer, (_event, query: unknown) =>
		sync.searchServer(searchSchema.parse(query))
	);
	handle(IPC.mailBody, (_event, id: unknown) => sync.body(z.number().int().parse(id)));
	handle(IPC.mailOpenAttachment, async (_event, id: unknown) => {
		const file = await sync.attachment(z.number().int().parse(id));
		const filename = safeFilename(file.filename, file.contentType);
		if (!canOpen(filename)) return false;
		const dir = path.join(app.getPath('temp'), 'velo-mail', String(id));
		await mkdir(dir, { recursive: true });
		const target = path.join(dir, filename);
		await writeFile(target, file.content);
		await markFromInternet(target);
		const error = await shell.openPath(target);
		if (error) throw new Error(error);
		return true;
	});
	handle(IPC.mailSaveAttachment, async (event, id: unknown) => {
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
		await markFromInternet(result.filePath);
		return true;
	});
	handle(IPC.mailSync, async (_event, id: unknown) => {
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
