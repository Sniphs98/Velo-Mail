// Development: Vite serves the renderer with hot reload, esbuild watches the
// Electron side and restarts the app whenever main or preload change.
import { spawn } from 'node:child_process';
import electron from 'electron';
import { context } from 'esbuild';
import { createServer } from 'vite';
import { electronBuilds } from './electron-builds.mjs';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];

let app;
let restarting = false;

function startApp() {
	const args = ['.'];
	// Chromium refuses its sandbox as root (containers, CI).
	if (process.getuid?.() === 0) args.push('--no-sandbox');
	app = spawn(electron, args, {
		stdio: 'inherit',
		env: { ...process.env, VITE_DEV_SERVER_URL: url }
	});
	app.on('exit', async () => {
		if (restarting) return;
		await server.close();
		process.exit(0);
	});
}

function restartApp() {
	if (!app) return startApp();
	restarting = true;
	app.once('exit', () => {
		restarting = false;
		startApp();
	});
	app.kill();
}

// Builds run in parallel; restart once both have finished.
let pending = electronBuilds.length;
const restartWhenBuilt = {
	name: 'restart-electron',
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length > 0) return;
			if (pending > 0 && --pending > 0) return;
			restartApp();
		});
	}
};

for (const options of electronBuilds) {
	const ctx = await context({ ...options, plugins: [restartWhenBuilt] });
	await ctx.watch();
}
