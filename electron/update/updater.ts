// Installing updates with electron-updater: it reads the latest*.yml files the
// release workflow attaches to each GitHub release, downloads the matching
// installer and runs it on restart. Only where self-update.ts allows it.
import { app, net } from 'electron';
import type { AppUpdater } from 'electron-updater';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { latestRelease } from './release';
import { selfUpdateSupport } from './self-update';

/** The NSIS installer leaves "Uninstall Velo Mail.exe" next to the program. */
function hasNsisUninstaller() {
	try {
		return readdirSync(path.dirname(process.execPath)).some((f) => /^Uninstall .+\.exe$/i.test(f));
	} catch {
		return false;
	}
}

function support() {
	return selfUpdateSupport({
		platform: process.platform,
		isPackaged: app.isPackaged,
		env: process.env,
		hasNsisUninstaller: process.platform === 'win32' && hasNsisUninstaller()
	});
}

async function fetchJson(url: string) {
	const response = await net.fetch(url, {
		headers: { accept: 'application/vnd.github+json' },
		signal: AbortSignal.timeout(8000)
	});
	if (!response.ok) throw new Error(`GitHub antwortete mit ${response.status}`);
	return response.json();
}

export class Updater {
	/** One download at a time; a second click joins the running one. */
	private downloading?: Promise<void>;
	private updater?: AppUpdater;

	constructor(private readonly onProgress: (percent: number) => void) {}

	/** electron-updater, loaded only when installing: it expects an installed app. */
	private async autoUpdater() {
		if (!this.updater) {
			const { autoUpdater } = await import('electron-updater');
			autoUpdater.autoDownload = false;
			// A downloaded update installs on quit if the user never restarts for it.
			autoUpdater.autoInstallOnAppQuit = true;
			autoUpdater.logger = null;
			autoUpdater.on('download-progress', (progress) => this.onProgress(progress.percent));
			this.updater = autoUpdater;
		}
		return this.updater;
	}

	/** Only the installed app looks; run from the sources it is always "0.0.0". */
	async check() {
		if (!app.isPackaged) return null;
		return latestRelease(app.getVersion(), support().supported, fetchJson);
	}

	install() {
		const can = support();
		if (!can.supported) {
			throw new Error(`Selbst aktualisieren geht nicht für ${can.reason}.`);
		}
		this.downloading ??= (async () => {
			const updater = await this.autoUpdater();
			const result = await updater.checkForUpdates();
			if (!result?.isUpdateAvailable) throw new Error('Es gibt keine neuere Version.');
			await updater.downloadUpdate();
		})().finally(() => (this.downloading = undefined));
		return this.downloading;
	}

	async restart() {
		const updater = await this.autoUpdater();
		// After the reply went out; quitting closes the window waiting for it.
		// Not silent: the installer shows its progress (resources/installer.nsh).
		setImmediate(() => updater.quitAndInstall(false, true));
	}
}
