import { defineConfig } from '@playwright/test';

// Starts the built Electron app (npm run build), see e2e/app.ts.
export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list'
});
