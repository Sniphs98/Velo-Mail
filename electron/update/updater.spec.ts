import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, net: {} }));
const { autoUpdaterOf } = await import('./updater');

describe('autoUpdaterOf', () => {
	const updater = { autoDownload: true } as never;

	it('finds autoUpdater whichever way the CommonJS module was imported', () => {
		// Electron hands ESM imports of electron-updater over as { default: exports }.
		expect(autoUpdaterOf({ default: { autoUpdater: updater } })).toBe(updater);
		expect(autoUpdaterOf({ autoUpdater: updater })).toBe(updater);
	});

	it('says so when there is none', () => {
		expect(() => autoUpdaterOf({ default: {} })).toThrow('ließ sich nicht laden');
	});
});
