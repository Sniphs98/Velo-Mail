// Is there a newer release on GitHub? Only detects it, on every platform;
// installing is electron-updater's job (updater.ts), and only where this copy
// can update itself (self-update.ts). Adapted from Remoty.
import type { UpdateInfo } from '../../src/lib/api';

const repo = 'Sniphs98/Velo-Mail';

/** Whether `latest` is a strictly greater x.y.z than `current`; unreadable versions are not. */
export function isNewer(latest: string, current: string): boolean {
	const l = parse(latest);
	const c = parse(current);
	if (!l || !c) return false;
	for (let i = 0; i < 3; i++) if (l[i] !== c[i]) return l[i] > c[i];
	return false;
}

function parse(version: string) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
	return match ? match.slice(1).map(Number) : null;
}

/**
 * The latest release if it is newer than `current`, else null. A failed
 * request also gives null, so a check never gets in the way.
 */
export async function latestRelease(
	current: string,
	canSelfUpdate: boolean,
	fetchJson: (url: string) => Promise<unknown>
): Promise<UpdateInfo | null> {
	let tag: unknown;
	try {
		tag = (
			(await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`)) as {
				tag_name?: unknown;
			}
		)?.tag_name;
	} catch {
		return null;
	}
	if (typeof tag !== 'string' || !isNewer(tag, current)) return null;
	return {
		version: tag.replace(/^v/, ''),
		url: `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`,
		canSelfUpdate
	};
}
