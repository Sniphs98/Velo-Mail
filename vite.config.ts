import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

export default defineConfig({
	plugins: [
		tailwindcss(),
		// Texts in English and German (messages/*.json). The language: the one
		// chosen in the settings, else the system's, else English.
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
		}),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SPA: one index.html, routing happens in the renderer.
			adapter: adapter({ fallback: 'index.html' }),
			// The renderer's own code only; SvelteKit adds hashes for its inline
			// script. Mail content will render in sandboxed iframes with a policy of
			// its own.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					// https: only takes effect inside a mail whose remote content was allowed;
					// the mail's own policy blocks it otherwise (src/lib/mail-html.ts).
					'img-src': ['self', 'data:', 'blob:', 'https:'],
					'font-src': ['self', 'data:'],
					'object-src': ['none'],
					'base-uri': ['none'],
					'form-action': ['none']
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					// The tests check the German texts; English has tests of its own.
					setupFiles: ['src/lib/testing/german.ts']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: [
						'src/**/*.{test,spec}.{js,ts}',
						'electron/**/*.{test,spec}.ts',
						'scripts/**/*.{test,spec}.js'
					],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', '**/*.integration.spec.ts'],
					setupFiles: ['src/lib/testing/german.ts']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					// Against a real mail server (GreenMail, needs Java).
					name: 'integration',
					environment: 'node',
					include: ['electron/**/*.integration.spec.ts'],
					globalSetup: ['scripts/test-servers.mjs'],
					setupFiles: ['src/lib/testing/german.ts'],
					testTimeout: 30_000
				}
			}
		]
	}
});
