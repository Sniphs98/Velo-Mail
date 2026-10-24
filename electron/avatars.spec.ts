import { createHash } from 'node:crypto';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './db';
import {
	Avatars,
	iconLinks,
	isFreemail,
	isPublicDomain,
	organizationalDomain,
	parseBimi,
	type Fetched
} from './avatars';

const svg = (text: string): Fetched => ({
	contentType: 'image/svg+xml',
	data: Buffer.from(`<svg>${text}</svg>`)
});
const png = (text: string): Fetched => ({ contentType: 'image/png', data: Buffer.from(text) });
const html = (text: string): Fetched => ({
	contentType: 'text/html; charset=utf-8',
	data: Buffer.from(text)
});
const decoded = (url: string | undefined) =>
	url && Buffer.from(url.split(',')[1], 'base64').toString();

describe('helpers', () => {
	it('finds the organisation behind a host name', () => {
		expect(organizationalDomain('news.mail.google.com')).toBe('google.com');
		expect(organizationalDomain('firma.de')).toBe('firma.de');
		expect(organizationalDomain('shop.example.co.uk')).toBe('example.co.uk');
	});

	it('knows mail providers and refuses local hosts', () => {
		expect(isFreemail('gmail.com')).toBe(true);
		expect(isFreemail('google.com')).toBe(false);
		expect(isPublicDomain('firma.de')).toBe(true);
		expect(isPublicDomain('localhost')).toBe(false);
		expect(isPublicDomain('nas.local')).toBe(false);
		expect(isPublicDomain('192.168.0.1')).toBe(false);
		expect(isPublicDomain('beispiel.test')).toBe(false);
	});

	it('reads the logo from a BIMI record', () => {
		expect(
			parseBimi([['v=BIMI1; l=https://bimi.example/logo', '.svg; a=https://bimi.example/vmc.pem']])
		).toBe('https://bimi.example/logo.svg');
		expect(parseBimi([['v=spf1 -all'], ['v=BIMI1; l=http://unsicher/logo.svg']])).toBeNull();
		expect(parseBimi([['v=BIMI1; l=;']])).toBeNull();
	});

	it('lists linked icons, biggest first', () => {
		const page = `<link rel="icon" href="/favicon-32.png" sizes="32x32">
			<link rel='apple-touch-icon' href='https://cdn.firma.de/touch.png'>
			<link href="/logo.svg" rel="icon">
			<link rel="stylesheet" href="/style.css">
			<link rel="icon" href="http://firma.de/unsicher.png" sizes="64x64">`;
		expect(iconLinks(page, 'https://firma.de/')).toEqual([
			'https://firma.de/logo.svg',
			'https://cdn.firma.de/touch.png',
			'https://firma.de/favicon-32.png'
		]);
	});
});

describe('Avatars', () => {
	let db: Database;
	let responses: Record<string, Fetched>;
	let records: Record<string, string[][]>;
	let requested: string[];
	let now: number;
	let avatars: Avatars;

	beforeEach(() => {
		db = openDatabase(':memory:', path.resolve('drizzle'));
		responses = {};
		records = {};
		requested = [];
		now = Date.UTC(2026, 9, 24);
		avatars = new Avatars({
			db,
			now: () => now,
			fetchBytes: async (url, maxBytes) => {
				requested.push(url);
				const response = responses[url];
				return response && response.data.length <= maxBytes ? response : null;
			},
			resolveTxt: async (name) => {
				if (records[name]) return records[name];
				throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
			}
		});
	});

	it('takes the BIMI logo of the organisation and caches it', async () => {
		records['default._bimi.google.com'] = [['v=BIMI1; l=https://bimi.google.com/g.svg']];
		responses['https://bimi.google.com/g.svg'] = svg('G');

		const picture = await avatars.find('No-Reply@Accounts.Google.com');
		expect(picture?.kind).toBe('photo');
		expect(picture?.url).toMatch(/^data:image\/svg\+xml;base64,/);
		expect(decoded(picture?.url)).toBe('<svg>G</svg>');

		requested = [];
		expect(await avatars.find('team@google.com')).toEqual(picture);
		expect(requested).toEqual([]);
	});

	it('falls back to the icon the home page links to', async () => {
		responses['https://firma.de/'] = html('<link rel="apple-touch-icon" href="/touch.png">');
		responses['https://firma.de/touch.png'] = png('touch');

		const picture = await avatars.find('thomas@firma.de');
		expect(picture?.kind).toBe('icon');
		expect(decoded(picture?.url)).toBe('touch');
	});

	it('ignores logos that are not images or too big', async () => {
		records['default._bimi.firma.de'] = [['v=BIMI1; l=https://firma.de/logo.svg']];
		responses['https://firma.de/logo.svg'] = html('<p>kein Bild</p>');
		responses['https://firma.de/favicon.ico'] = png('x'.repeat(300 * 1024));
		expect(await avatars.find('thomas@firma.de')).toBeNull();
	});

	it('uses Gravatar for mail providers, never their logo', async () => {
		const hash = createHash('sha256').update('lea@gmail.com').digest('hex');
		responses[`https://www.gravatar.com/avatar/${hash}?s=128&d=404`] = png('lea');

		const picture = await avatars.find('Lea@Gmail.com');
		expect(decoded(picture?.url)).toBe('lea');
		expect(picture?.kind).toBe('photo');
		expect(requested.some((url) => url.includes('gmail.com'))).toBe(false);
	});

	it('remembers misses for a week, then looks again', async () => {
		expect(await avatars.find('info@firma.de')).toBeNull();
		const first = requested.length;
		expect(first).toBeGreaterThan(0);

		expect(await avatars.find('info@firma.de')).toBeNull();
		expect(requested).toHaveLength(first);

		now += 8 * 24 * 60 * 60 * 1000;
		responses['https://firma.de/apple-touch-icon.png'] = png('neu');
		expect(decoded((await avatars.find('info@firma.de'))?.url)).toBe('neu');
	});

	it('looks up one sender once, however many ask at the same time', async () => {
		await Promise.all([avatars.find('a@firma.de'), avatars.find('A@firma.de')]);
		expect(requested.filter((url) => url === 'https://firma.de/')).toHaveLength(1);
	});

	it('does not look up local or invalid addresses', async () => {
		expect(await avatars.find('anna@beispiel.test')).toBeNull();
		expect(await avatars.find('kaputt')).toBeNull();
		expect(requested).toEqual([]);
	});
});
