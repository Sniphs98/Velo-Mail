import { _electron as electron } from '@playwright/test';

/** Starts the built app (out/ and build/, see `npm run build`). */
export async function launchApp() {
	const args = ['.'];
	// Chromium refuses its sandbox as root (containers, CI).
	if (process.getuid?.() === 0) args.push('--no-sandbox');
	const app = await electron.launch({ args });
	const window = await app.firstWindow();
	return { app, window };
}
