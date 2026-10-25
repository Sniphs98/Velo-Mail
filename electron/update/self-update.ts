// Whether this copy of the app can install an update itself, or has to send
// the user to the release page. Kept free of Electron so it can be tested;
// updater.ts gathers the facts. Adapted from Remoty.
import { m } from '../../src/lib/paraglide/messages.js';

export interface InstallFacts {
	platform: NodeJS.Platform;
	/** app.isPackaged: false when run from the sources. */
	isPackaged: boolean;
	env: Record<string, string | undefined>;
	/** The NSIS installer leaves an uninstaller next to the program; an unzipped copy has none. */
	hasNsisUninstaller: boolean;
}

export type SelfUpdateSupport = { supported: true } | { supported: false; reason: string };

export function selfUpdateSupport(facts: InstallFacts): SelfUpdateSupport {
	if (!facts.isPackaged) return { supported: false, reason: m.update_reason_dev() };
	switch (facts.platform) {
		case 'win32':
			// Updates come as the installer, which would put a second copy next to an unzipped one.
			return facts.hasNsisUninstaller
				? { supported: true }
				: { supported: false, reason: m.update_reason_unzipped() };
		case 'linux':
			// An AppImage replaces itself; a .deb belongs to the package manager (and root).
			return facts.env.APPIMAGE
				? { supported: true }
				: { supported: false, reason: m.update_reason_deb() };
		case 'darwin':
			// macOS installs updates only into signed apps, and these builds are not signed yet.
			return { supported: false, reason: m.update_reason_macos() };
		default:
			return { supported: false, reason: facts.platform };
	}
}
