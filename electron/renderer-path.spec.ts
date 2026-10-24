import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rendererPath } from './renderer-path';

const dir = path.resolve('/app/build');
const files = new Set([path.join(dir, 'index.html'), path.join(dir, '_app/start.js')]);
const isFile = (file: string) => files.has(file);
const index = path.join(dir, 'index.html');

describe('rendererPath', () => {
	it('serves files from the build folder', () => {
		expect(rendererPath(dir, 'app://velo/_app/start.js', isFile)).toBe(
			path.join(dir, '_app/start.js')
		);
	});

	it('answers client-side routes with the SPA shell', () => {
		expect(rendererPath(dir, 'app://velo/', isFile)).toBe(index);
		expect(rendererPath(dir, 'app://velo/inbox/42', isFile)).toBe(index);
	});

	it('never leaves the build folder', () => {
		expect(rendererPath(dir, 'app://velo/../package.json', isFile)).toBe(index);
		expect(rendererPath(dir, 'app://velo/%2e%2e/%2e%2e/etc/passwd', isFile)).toBe(index);
		expect(rendererPath(dir, 'app://velo/..%2fpackage.json', isFile)).toBe(index);
	});

	it('falls back on malformed URLs', () => {
		expect(rendererPath(dir, 'app://velo/%E0%A4%A', isFile)).toBe(index);
	});
});
