import { describe, expect, it, vi } from 'vitest';
import { isNewer, latestRelease } from './release';
import { selfUpdateSupport } from './self-update';

describe('isNewer', () => {
	it('compares versions part by part', () => {
		expect(isNewer('v0.1.1', '0.1.0')).toBe(true);
		expect(isNewer('0.2.0', '0.1.9')).toBe(true);
		expect(isNewer('1.0.0', '0.10.10')).toBe(true);
		expect(isNewer('0.1.0', '0.1.0')).toBe(false);
		expect(isNewer('0.0.9', '0.1.0')).toBe(false);
		expect(isNewer('v0.2.0-rc.1', '0.1.0')).toBe(false);
		expect(isNewer('kaputt', '0.1.0')).toBe(false);
	});
});

describe('latestRelease', () => {
	it('offers a newer release with its page', async () => {
		const fetchJson = vi.fn(async () => ({ tag_name: 'v0.2.0' }));
		expect(await latestRelease('0.1.1', true, fetchJson)).toEqual({
			version: '0.2.0',
			url: 'https://github.com/Sniphs98/Velo-Mail/releases/tag/v0.2.0',
			canSelfUpdate: true
		});
		expect(fetchJson).toHaveBeenCalledWith(
			'https://api.github.com/repos/Sniphs98/Velo-Mail/releases/latest'
		);
	});

	it('stays quiet when up to date, offline or given nonsense', async () => {
		expect(await latestRelease('0.2.0', true, async () => ({ tag_name: 'v0.2.0' }))).toBeNull();
		expect(
			await latestRelease('0.1.0', true, async () => {
				throw new Error('offline');
			})
		).toBeNull();
		expect(await latestRelease('0.1.0', true, async () => ({ message: 'Not Found' }))).toBeNull();
		expect(await latestRelease('0.1.0', true, async () => null)).toBeNull();
	});
});

describe('selfUpdateSupport', () => {
	const facts = { isPackaged: true, env: {}, hasNsisUninstaller: false };

	it('updates the Windows installer build and an AppImage', () => {
		expect(selfUpdateSupport({ ...facts, platform: 'win32', hasNsisUninstaller: true })).toEqual({
			supported: true
		});
		expect(
			selfUpdateSupport({ ...facts, platform: 'linux', env: { APPIMAGE: '/opt/velo.AppImage' } })
		).toEqual({ supported: true });
	});

	it('sends everything else to the release page', () => {
		for (const platform of ['win32', 'linux', 'darwin'] as const) {
			expect(selfUpdateSupport({ ...facts, platform }).supported).toBe(false);
		}
		expect(
			selfUpdateSupport({
				...facts,
				isPackaged: false,
				platform: 'win32',
				hasNsisUninstaller: true
			}).supported
		).toBe(false);
	});
});
