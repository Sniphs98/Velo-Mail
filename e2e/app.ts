import { _electron as electron } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Starts the built app (out/ and build/, see `npm run build`) with an empty
 * profile of its own, or with `userData` from an earlier start; that is where
 * its database lives.
 */
export async function launchApp(userData = mkdtempSync(path.join(tmpdir(), 'velo-e2e-'))) {
	const args = ['.'];
	// Chromium refuses its sandbox as root (containers, CI).
	if (process.getuid?.() === 0) args.push('--no-sandbox');
	const app = await electron.launch({ args, env: { ...process.env, VELO_USER_DATA: userData } });
	const window = await app.firstWindow();
	return { app, window, userData };
}
