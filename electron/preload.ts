// Runs sandboxed before the renderer. Its only job is to hand the typed API to
// the page; the page itself never gets Node or Electron.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type VeloApi } from '../src/lib/api';

const api: VeloApi = {
	app: {
		info: () => ipcRenderer.invoke(IPC.appInfo)
	}
};

contextBridge.exposeInMainWorld('velo', api);
