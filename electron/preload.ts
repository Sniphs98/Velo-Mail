// Runs sandboxed before the renderer. Its only job is to hand the typed API to
// the page; the page itself never gets Node or Electron.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type SyncStatus, type VeloApi } from '../src/lib/api';

/** Subscribes to an event from the main process; returns the unsubscribe. */
function on<T extends unknown[]>(channel: string, listener: (...args: T) => void) {
	const handler = (_event: unknown, ...args: unknown[]) => listener(...(args as T));
	ipcRenderer.on(channel, handler);
	return () => {
		ipcRenderer.removeListener(channel, handler);
	};
}

const api: VeloApi = {
	app: {
		info: () => ipcRenderer.invoke(IPC.appInfo),
		checkUpdate: () => ipcRenderer.invoke(IPC.appCheckUpdate),
		installUpdate: () => ipcRenderer.invoke(IPC.appInstallUpdate),
		restartToUpdate: () => ipcRenderer.invoke(IPC.appRestartToUpdate),
		onUpdateProgress: (listener) => on<[number]>(IPC.appUpdateProgress, listener)
	},
	accounts: {
		list: () => ipcRenderer.invoke(IPC.accountsList),
		discover: (email) => ipcRenderer.invoke(IPC.accountsDiscover, email),
		test: (settings, password) => ipcRenderer.invoke(IPC.accountsTest, settings, password),
		add: (account) => ipcRenderer.invoke(IPC.accountsAdd, account),
		update: (id, changes) => ipcRenderer.invoke(IPC.accountsUpdate, id, changes),
		remove: (id) => ipcRenderer.invoke(IPC.accountsRemove, id)
	},
	calendar: {
		sources: () => ipcRenderer.invoke(IPC.calendarSources),
		addSource: (source) => ipcRenderer.invoke(IPC.calendarAddSource, source),
		removeSource: (id) => ipcRenderer.invoke(IPC.calendarRemoveSource, id),
		calendars: () => ipcRenderer.invoke(IPC.calendarCalendars),
		updateCalendar: (id, changes) => ipcRenderer.invoke(IPC.calendarUpdateCalendar, id, changes),
		events: (from, to) => ipcRenderer.invoke(IPC.calendarEvents, from, to),
		createEvent: (calendarId, event) =>
			ipcRenderer.invoke(IPC.calendarCreateEvent, calendarId, event),
		updateEvent: (id, event, occurrence) =>
			ipcRenderer.invoke(IPC.calendarUpdateEvent, id, event, occurrence),
		deleteEvent: (id, recurrenceId) =>
			ipcRenderer.invoke(IPC.calendarDeleteEvent, id, recurrenceId),
		sync: () => ipcRenderer.invoke(IPC.calendarSync),
		onChanged: (listener) => on(IPC.calendarChanged, listener),
		onShowDay: (listener) => on<[number]>(IPC.calendarShowDay, listener)
	},
	settings: {
		get: () => ipcRenderer.invoke(IPC.settingsGet),
		set: (changes) => ipcRenderer.invoke(IPC.settingsSet, changes)
	},
	mail: {
		mailboxes: () => ipcRenderer.invoke(IPC.mailMailboxes),
		messages: (query) => ipcRenderer.invoke(IPC.mailMessages, query),
		setSeen: (id, seen) => ipcRenderer.invoke(IPC.mailSetSeen, id, seen),
		thread: (id) => ipcRenderer.invoke(IPC.mailThread, id),
		trustSender: (address) => ipcRenderer.invoke(IPC.mailTrustSender, address),
		trustedSenders: () => ipcRenderer.invoke(IPC.mailTrustedSenders),
		untrustSender: (address) => ipcRenderer.invoke(IPC.mailUntrustSender, address),
		setSenderRule: (address, rule) => ipcRenderer.invoke(IPC.mailSetSenderRule, address, rule),
		senderRules: () => ipcRenderer.invoke(IPC.mailSenderRules),
		newsletterSenders: (accountIds) => ipcRenderer.invoke(IPC.mailNewsletterSenders, accountIds),
		moveFromSender: (address, accountIds, to) =>
			ipcRenderer.invoke(IPC.mailMoveFromSender, address, accountIds, to),
		unsubscribe: (messageId) => ipcRenderer.invoke(IPC.mailUnsubscribe, messageId),
		suggestAddresses: (text) => ipcRenderer.invoke(IPC.mailSuggestAddresses, text),
		avatar: (address, name) => ipcRenderer.invoke(IPC.mailAvatar, address, name),
		replySource: (id) => ipcRenderer.invoke(IPC.mailReplySource, id),
		pickFiles: () => ipcRenderer.invoke(IPC.mailPickFiles),
		send: (message) => ipcRenderer.invoke(IPC.mailSend, message),
		saveDraft: (message) => ipcRenderer.invoke(IPC.mailSaveDraft, message),
		deleteDraft: (accountId, uid) => ipcRenderer.invoke(IPC.mailDeleteDraft, accountId, uid),
		move: (ids, to) => ipcRenderer.invoke(IPC.mailMove, ids, to),
		search: (query) => ipcRenderer.invoke(IPC.mailSearch, query),
		searchServer: (query) => ipcRenderer.invoke(IPC.mailSearchServer, query),
		body: (id) => ipcRenderer.invoke(IPC.mailBody, id),
		openAttachment: (id) => ipcRenderer.invoke(IPC.mailOpenAttachment, id),
		saveAttachment: (id) => ipcRenderer.invoke(IPC.mailSaveAttachment, id),
		invitation: (id) => ipcRenderer.invoke(IPC.mailInvitation, id),
		respondToInvitation: (id, response, calendarId) =>
			ipcRenderer.invoke(IPC.mailRespondToInvitation, id, response, calendarId),
		removeCancelledEvent: (id) => ipcRenderer.invoke(IPC.mailRemoveCancelledEvent, id),
		sync: (accountId) => ipcRenderer.invoke(IPC.mailSync, accountId),
		onChanged: (listener) => on(IPC.mailChanged, listener),
		onStatus: (listener) => on<[SyncStatus]>(IPC.mailStatus, listener),
		onOpen: (listener) => on<[number]>(IPC.mailOpen, listener),
		onCompose: (listener) => on(IPC.mailCompose, listener)
	}
};

contextBridge.exposeInMainWorld('velo', api);
