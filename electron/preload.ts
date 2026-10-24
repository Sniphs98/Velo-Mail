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
		info: () => ipcRenderer.invoke(IPC.appInfo)
	},
	accounts: {
		list: () => ipcRenderer.invoke(IPC.accountsList),
		discover: (email) => ipcRenderer.invoke(IPC.accountsDiscover, email),
		test: (settings, password) => ipcRenderer.invoke(IPC.accountsTest, settings, password),
		add: (account) => ipcRenderer.invoke(IPC.accountsAdd, account),
		remove: (id) => ipcRenderer.invoke(IPC.accountsRemove, id)
	},
	mail: {
		mailboxes: () => ipcRenderer.invoke(IPC.mailMailboxes),
		messages: (query) => ipcRenderer.invoke(IPC.mailMessages, query),
		setSeen: (id, seen) => ipcRenderer.invoke(IPC.mailSetSeen, id, seen),
		body: (id) => ipcRenderer.invoke(IPC.mailBody, id),
		openAttachment: (id) => ipcRenderer.invoke(IPC.mailOpenAttachment, id),
		saveAttachment: (id) => ipcRenderer.invoke(IPC.mailSaveAttachment, id),
		sync: (accountId) => ipcRenderer.invoke(IPC.mailSync, accountId),
		onChanged: (listener) => on(IPC.mailChanged, listener),
		onStatus: (listener) => on<[SyncStatus]>(IPC.mailStatus, listener)
	}
};

contextBridge.exposeInMainWorld('velo', api);
