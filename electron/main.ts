import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IPC, type AppInfo } from '../src/lib/api';
import { rendererPath } from './renderer-path';

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.join(here, '..', 'build');
// Set by scripts/dev.mjs; the packaged app serves the build over app://.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const appOrigin = 'app://velo';

protocol.registerSchemesAsPrivileged([
	{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

function isFile(file: string): boolean {
	try {
		return statSync(file).isFile();
	} catch {
		return false;
	}
}

function serveRenderer() {
	// The content security policy comes with index.html (csp in vite.config.ts).
	protocol.handle('app', (request) =>
		net.fetch(pathToFileURL(rendererPath(rendererDir, request.url, isFile)).toString())
	);
}

function isOwnUrl(url: string): boolean {
	return url.startsWith(`${appOrigin}/`) || (!!devServerUrl && url.startsWith(devServerUrl));
}

function createWindow() {
	const window = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 900,
		minHeight: 600,
		show: false,
		backgroundColor: '#f4f4f5',
		title: 'Velo Mail',
		webPreferences: {
			preload: path.join(here, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	});
	window.once('ready-to-show', () => window.show());
	window.loadURL(devServerUrl ?? `${appOrigin}/`);
}

// Links in the app open in the browser; the window never navigates away.
app.on('web-contents-created', (_event, contents) => {
	contents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith('https://') || url.startsWith('mailto:')) shell.openExternal(url);
		return { action: 'deny' };
	});
	contents.on('will-navigate', (event, url) => {
		if (!isOwnUrl(url)) event.preventDefault();
	});
});

ipcMain.handle(IPC.appInfo, (): AppInfo => ({
	name: app.getName(),
	version: app.getVersion(),
	platform: process.platform
}));

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', () => {
		const [window] = BrowserWindow.getAllWindows();
		if (window?.isMinimized()) window.restore();
		window?.focus();
	});

	app.whenReady().then(() => {
		serveRenderer();
		createWindow();
		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) createWindow();
		});
	});

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') app.quit();
	});
}
