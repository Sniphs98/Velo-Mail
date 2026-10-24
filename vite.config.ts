import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
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
					'img-src': ['self', 'data:', 'blob:'],
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
					exclude: ['src/lib/server/**']
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
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', '**/*.integration.spec.ts']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					// Against a real mail server (GreenMail, needs Java).
					name: 'integration',
					environment: 'node',
					include: ['electron/**/*.integration.spec.ts'],
					globalSetup: ['scripts/greenmail-setup.mjs'],
					testTimeout: 30_000
				}
			}
		]
	}
});
