import path from 'node:path';

// Types that would run code when opened; these can only be saved.
const runnable =
	/\.(exe|com|bat|cmd|msi|msp|scr|pif|cpl|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|jar|lnk|reg|app|command|sh|bash|desktop|appimage|deb|rpm|dmg|pkg|iso|img)$/i;

/** A file name that is safe on every system. */
export function safeFilename(name: string | null, contentType: string) {
	const base = path
		.basename(name ?? '')
		.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
		.replace(/^\.+/, '')
		.slice(0, 200);
	return base || `anhang.${contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'}`;
}

export function isRunnable(filename: string) {
	return runnable.test(filename);
}
