import { defineConfig } from '@playwright/test';

// Starts the built Electron app (npm run build), see e2e/app.ts, and GreenMail
// as its mail server.
export default defineConfig({
	testDir: 'e2e',
	globalSetup: './scripts/greenmail-setup.mjs',
	testMatch: '**/*.e2e.ts',
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list'
});
