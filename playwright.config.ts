import { defineConfig } from '@playwright/test';

// Starts the built Electron app (npm run build), see e2e/app.ts, and GreenMail
// as its mail server.
export default defineConfig({
	testDir: 'e2e',
	globalSetup: './e2e/global-setup.ts',
	// SCREENSHOTS=1 takes the README pictures instead (npm run screenshots).
	testMatch: process.env.SCREENSHOTS ? '**/screenshots.ts' : '**/*.e2e.ts',
	// The tests share one mail server.
	workers: 1,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list'
});
