import { app, BrowserWindow, dialog, nativeTheme, net, protocol, session, shell } from 'electron';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDatabase, type Database } from './db';
import { Desktop } from './desktop';
import { IPC } from '../src/lib/api';
import { registerIpc } from './ipc';
import type { SyncManager } from './mail/manager';
import { rendererPath } from './renderer-path';

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.join(here, '..', 'build');
// Set by scripts/dev.mjs; the packaged app serves the build over app://.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const appOrigin = 'app://velo';
const resourcesDir = path.join(here, '..', 'resources');
// Lets the E2E tests start every run with an empty profile.
if (process.env.VELO_USER_DATA) app.setPath('userData', process.env.VELO_USER_DATA);

let db: Database | undefined;
let sync: SyncManager | undefined;
let mainWindow: BrowserWindow | undefined;
/** Set once quitting starts, so closing the window no longer just hides it. */
let quitting = false;

const desktop = new Desktop({
	iconDir: path.join(resourcesDir, 'tray'),
	show: showWindow,
	open: (messageId) => whenLoaded((window) => window.webContents.send(IPC.mailOpen, messageId)),
	compose: () => whenLoaded((window) => window.webContents.send(IPC.mailCompose))
});

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
		// The page's background (layout.css), so there is no flash while loading.
		backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#f4f4f5',
		title: 'Velo Mail',
		icon: path.join(resourcesDir, 'icon.png'),
		webPreferences: {
			preload: path.join(here, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	});
	window.once('ready-to-show', () => window.show());
	window.on('close', (event) => {
		if (quitting || !desktop.keepsRunning) return;
		event.preventDefault();
		window.hide();
	});
	window.on('closed', () => {
		if (mainWindow === window) mainWindow = undefined;
	});
	window.loadURL(devServerUrl ?? `${appOrigin}/`);
	mainWindow = window;
	return window;
}

function showWindow() {
	const window = mainWindow ?? createWindow();
	if (window.isMinimized()) window.restore();
	window.show();
	window.focus();
	return window;
}

/** Runs `send` once the page can receive events. */
function whenLoaded(send: (window: BrowserWindow) => void) {
	const window = showWindow();
	if (window.webContents.isLoading())
		window.webContents.once('did-finish-load', () => send(window));
	else send(window);
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

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', () => showWindow());

	app.whenReady().then(() => {
		try {
			db = openDatabase(
				path.join(app.getPath('userData'), 'velo-mail.db'),
				path.join(here, '..', 'drizzle')
			);
		} catch (error) {
			dialog.showErrorBox(
				'Velo Mail kann nicht starten',
				`Die Datenbank ließ sich nicht öffnen:\n${error instanceof Error ? error.message : error}`
			);
			app.exit(1);
			return;
		}
		// The app needs no camera, location or the like; Electron would grant them.
		session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
			callback(false)
		);
		session.defaultSession.setPermissionCheckHandler(() => false);
		sync = registerIpc(db, desktop, isOwnUrl);
		serveRenderer();
		createWindow();
		app.on('activate', () => showWindow());
	});

	// Log out of the servers first (at most 2 s), then close the database.
	let loggedOut = false;
	app.on('before-quit', (event) => {
		quitting = true;
		if (loggedOut || !sync) return;
		event.preventDefault();
		const quit = () => {
			loggedOut = true;
			app.quit();
		};
		Promise.race([sync.stopAll(), new Promise((resolve) => setTimeout(resolve, 2000))]).then(
			quit,
			quit
		);
	});
	app.on('will-quit', () => db?.$client.close());

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin' && !desktop.keepsRunning) app.quit();
	});
}
