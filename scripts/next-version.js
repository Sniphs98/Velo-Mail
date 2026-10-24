// The version auto-release.yml gives a merge into main: the latest vX.Y.Z
// tag, raised by the merged pull request's label.
//
//   node scripts/next-version.js "<tags, one per line>" "<labels, comma-separated>"
//
// prints e.g. v1.3.0, or nothing when the pull request isn't to be released.
import { pathToFileURL } from 'node:url';

export const RELEASE_LABELS = {
	/** 1.2.3 → 2.0.0 */
	major: 'breaking',
	/** 1.2.3 → 1.3.0 */
	minor: 'feature',
	/** No release, e.g. only docs, tests or CI. */
	none: 'kein-release'
};

/**
 * @param {string[]} tags
 * @param {string[]} labels
 * @returns {string | null}
 */
export function nextVersion(tags, labels) {
	if (labels.includes(RELEASE_LABELS.none)) return null;

	// Pre-releases (v1.2.0-rc.1) don't count: the next version follows the last stable one.
	const versions = tags
		.map((tag) => tag.trim().match(/^v(\d+)\.(\d+)\.(\d+)$/))
		.filter((match) => match !== null)
		.map((match) => match.slice(1).map(Number))
		.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
	const [major, minor, patch] = versions.at(-1) ?? [0, 0, 0];

	if (labels.includes(RELEASE_LABELS.major)) return `v${major + 1}.0.0`;
	if (labels.includes(RELEASE_LABELS.minor)) return `v${major}.${minor + 1}.0`;
	return `v${major}.${minor}.${patch + 1}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const [tags = '', labels = ''] = process.argv.slice(2);
	const version = nextVersion(
		tags.split('\n'),
		labels
			.split(',')
			.map((label) => label.trim())
			.filter(Boolean)
	);
	console.log(version ?? '');
}
