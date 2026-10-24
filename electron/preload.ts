// Runs sandboxed before the renderer. Its only job is to hand the typed API to
// the page; the page itself never gets Node or Electron.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type VeloApi } from '../src/lib/api';

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
	}
};

contextBridge.exposeInMainWorld('velo', api);
