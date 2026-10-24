import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nextVersion } from './next-version.js';

const tags = ['v1.0.0', 'v1.2.0', 'v1.10.3', 'v1.11.0-rc.1', 'nicht-semver'];

describe('nextVersion', () => {
	it('raises the patch without a label', () => {
		expect(nextVersion(tags, [])).toBe('v1.10.4');
		expect(nextVersion(tags, ['bug', 'documentation'])).toBe('v1.10.4');
	});

	it('raises minor for "feature" and major for "breaking"', () => {
		expect(nextVersion(tags, ['feature'])).toBe('v1.11.0');
		expect(nextVersion(tags, ['breaking'])).toBe('v2.0.0');
		expect(nextVersion(tags, ['feature', 'breaking'])).toBe('v2.0.0');
	});

	it('releases nothing for "kein-release"', () => {
		expect(nextVersion(tags, ['feature', 'kein-release'])).toBeNull();
	});

	it('compares versions as numbers, ignores pre-releases', () => {
		// 1.10.3 is newer than 1.2.0; 1.11.0-rc.1 isn't a release yet.
		expect(nextVersion(['v1.2.0', 'v1.10.3'], ['feature'])).toBe('v1.11.0');
	});

	it('starts from 0.0.0 without any version tag', () => {
		expect(nextVersion([], [])).toBe('v0.0.1');
		expect(nextVersion([''], ['feature'])).toBe('v0.1.0');
	});
});

describe('next-version.js on the command line', () => {
	const script = fileURLToPath(new URL('./next-version.js', import.meta.url));
	const run = (...args) => execFileSync('node', [script, ...args], { encoding: 'utf8' }).trim();

	it('reads tags line by line and labels comma-separated, as auto-release.yml passes them', () => {
		expect(run('v1.0.0\nv1.1.0', 'documentation, feature')).toBe('v1.2.0');
		expect(run('v1.0.0', '')).toBe('v1.0.1');
		expect(run('v1.0.0', 'kein-release')).toBe('');
	});
});
