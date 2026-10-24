// esbuild settings for the Electron side, shared by build-electron.mjs and
// dev.mjs. The renderer is built by Vite (SvelteKit) into build/.

const common = {
	bundle: true,
	platform: 'node',
	target: 'node22',
	sourcemap: true,
	logLevel: 'info'
};

export const electronBuilds = [
	{
		...common,
		entryPoints: ['electron/main.ts'],
		outfile: 'out/main.js',
		format: 'esm',
		// Runtime dependencies stay in node_modules, where electron-builder
		// packs them (native modules such as better-sqlite3 cannot be bundled).
		packages: 'external'
	},
	{
		...common,
		// A sandboxed preload can only require 'electron', so everything else
		// is bundled in.
		entryPoints: ['electron/preload.ts'],
		outfile: 'out/preload.cjs',
		format: 'cjs',
		external: ['electron']
	}
];
