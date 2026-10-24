// The fallback sender picture: initials on a color derived from the address,
// so the same sender always looks the same. Logos and photos come from the
// main process (electron/avatars.ts).

const colors = [
	'#dbeafe',
	'#fde68a',
	'#fbcfe8',
	'#ccfbf1',
	'#e9d5ff',
	'#fed7aa',
	'#e0e7ff',
	'#d9f99d'
];

export function initials(name: string | null, address: string | null): string {
	const words = (name ?? '')
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.split(/\s+/)
		.filter(Boolean);
	if (words.length >= 2) return (words[0][0] + words.at(-1)![0]).toUpperCase();
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	const local = (address ?? '?').split('@')[0].replace(/[^\p{L}\p{N}]/gu, '');
	return (local.slice(0, 2) || '?').toUpperCase();
}

export function avatarColor(address: string | null): string {
	let hash = 0;
	for (const char of address ?? '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return colors[hash % colors.length];
}
