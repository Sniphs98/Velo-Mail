// Sender pictures, looked up in the order PLAN.md gives: the brand logo the
// domain publishes over BIMI, then its icon, then the sender's Gravatar.
// Results, misses included, are cached in sender_avatars for a while.
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { SenderPicture } from '../src/lib/api';
import type { Database } from './db';
import { senderAvatars } from './db/schema';

export interface Fetched {
	contentType: string;
	data: Buffer;
}

export interface AvatarDeps {
	db: Database;
	/** GET over https; null on any failure, a non-2xx status or a body over `maxBytes`. */
	fetchBytes(url: string, maxBytes: number): Promise<Fetched | null>;
	resolveTxt(name: string): Promise<string[][]>;
	now?(): number;
}

const day = 24 * 60 * 60 * 1000;
const keepFound = 30 * day;
const keepMissing = 7 * day;
const maxBytes = 256 * 1024;

/**
 * Mail providers whose domain says nothing about the sender: their logo would
 * show on every private address.
 */
const freemail = new Set(
	[
		'gmail.com googlemail.com outlook.com outlook.de hotmail.com hotmail.de live.com live.de',
		'msn.com yahoo.com yahoo.de ymail.com icloud.com me.com mac.com aol.com aol.de',
		'gmx.de gmx.net gmx.at gmx.ch gmx.com web.de t-online.de freenet.de posteo.de',
		'mailbox.org proton.me protonmail.com pm.me tutanota.com tutanota.de tuta.io',
		'arcor.de online.de 1und1.de vodafone.de yandex.com yandex.ru mail.ru zoho.com',
		'fastmail.com hey.com bluewin.ch gmail.de'
	]
		.join(' ')
		.split(' ')
);

/** Second-level suffixes where the organisation sits one label deeper. */
const twoLevelSuffixes = new Set(
	'co.uk org.uk ac.uk gov.uk co.at or.at co.jp com.au net.au com.br co.nz co.za com.tr com.mx co.in'.split(
		' '
	)
);

export function isFreemail(domain: string) {
	return freemail.has(domain);
}

/** "news.mail.google.com" → "google.com", "shop.example.co.uk" → "example.co.uk". */
export function organizationalDomain(domain: string) {
	const labels = domain.split('.');
	const suffix = labels.slice(-2).join('.');
	return labels.slice(twoLevelSuffixes.has(suffix) ? -3 : -2).join('.');
}

/**
 * Only public host names: no IP addresses, no single labels, nothing that
 * points into the local network.
 */
export function isPublicDomain(domain: string) {
	return (
		/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) &&
		!/\.(local|localhost|internal|lan|home|corp|test|example|invalid|arpa)$/.test(domain)
	);
}

/** The logo URL from a BIMI record ("v=BIMI1; l=https://…/logo.svg; a=…"). */
export function parseBimi(records: string[][]) {
	for (const parts of records) {
		const record = parts.join('');
		if (!/^v=BIMI1(;|$)/i.test(record.trim())) continue;
		const location = /(?:^|;)\s*l=([^;]*)/i.exec(record)?.[1]?.trim();
		if (location?.startsWith('https://')) return location;
	}
	return null;
}

/** Icons the home page links to, biggest first ("apple-touch-icon", "icon"). */
export function iconLinks(html: string, base: string) {
	const found: { url: string; size: number }[] = [];
	for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
		const attr = (name: string) =>
			new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
				.exec(tag)
				?.slice(1)
				.find((value) => value !== undefined);
		const rel = attr('rel')?.toLowerCase().split(/\s+/) ?? [];
		const href = attr('href');
		if (!href || !rel.some((r) => r === 'icon' || r === 'apple-touch-icon')) continue;
		const sizes = attr('sizes') ?? '';
		const size = rel.includes('apple-touch-icon')
			? Number(/(\d+)x\d+/.exec(sizes)?.[1] ?? 180)
			: Number(/(\d+)x\d+/.exec(sizes)?.[1] ?? (/\.svg(\?|$)/i.test(href) ? 512 : 16));
		try {
			const url = new URL(href, base);
			if (url.protocol === 'https:') found.push({ url: url.href, size });
		} catch {
			// Not a URL.
		}
	}
	return found.sort((a, b) => b.size - a.size).map((icon) => icon.url);
}

const isImage = (fetched: Fetched | null, svg = false): fetched is Fetched =>
	!!fetched &&
	fetched.data.length > 0 &&
	(svg ? /^image\/svg\+xml\b/i : /^image\//i).test(fetched.contentType);

type Kind = 'address' | 'domain';
type Found = { source: 'bimi' | 'favicon' | 'gravatar'; picture: Fetched } | null;

export class Avatars {
	/** Running lookups, so many messages from one sender cause one. */
	private pending = new Map<string, Promise<SenderPicture | null>>();

	constructor(private readonly deps: AvatarDeps) {}

	/** The picture for an address as a data: URL, or null to show initials. */
	find(address: string): Promise<SenderPicture | null> {
		const key = address.trim().toLowerCase();
		let running = this.pending.get(key);
		if (!running) {
			running = this.lookup(key).finally(() => this.pending.delete(key));
			this.pending.set(key, running);
		}
		return running;
	}

	private async lookup(address: string): Promise<SenderPicture | null> {
		const domain = address.split('@')[1] ?? '';
		if (!isPublicDomain(domain)) return null;
		if (!isFreemail(domain)) {
			const organization = organizationalDomain(domain);
			const logo = await this.cached('domain', organization, () => this.domainLogo(organization));
			if (logo) return logo;
		}
		return this.cached('address', address, () => this.gravatar(address));
	}

	private async cached(kind: Kind, key: string, look: () => Promise<Found>) {
		const now = this.deps.now?.() ?? Date.now();
		const where = and(eq(senderAvatars.kind, kind), eq(senderAvatars.key, key));
		const [row] = await this.deps.db.select().from(senderAvatars).where(where);
		if (row && row.expiresAt.getTime() > now) {
			return row.source !== 'none' && row.data && row.contentType
				? toPicture(row.source, row.contentType, row.data)
				: null;
		}
		const found = await look();
		const values = {
			kind,
			key,
			source: found?.source ?? ('none' as const),
			contentType: found?.picture.contentType ?? null,
			data: found?.picture.data ?? null,
			fetchedAt: new Date(now),
			expiresAt: new Date(now + (found ? keepFound : keepMissing))
		};
		await this.deps.db
			.insert(senderAvatars)
			.values(values)
			.onConflictDoUpdate({ target: [senderAvatars.kind, senderAvatars.key], set: values });
		return found ? toPicture(found.source, found.picture.contentType, found.picture.data) : null;
	}

	private async domainLogo(domain: string): Promise<Found> {
		const bimi = await this.bimi(domain);
		if (bimi) return { source: 'bimi', picture: bimi };
		const icon = await this.favicon(domain);
		return icon ? { source: 'favicon', picture: icon } : null;
	}

	private async bimi(domain: string) {
		const records = await this.deps.resolveTxt(`default._bimi.${domain}`).catch(() => []);
		const url = parseBimi(records);
		if (!url) return null;
		const logo = await this.deps.fetchBytes(url, maxBytes);
		return isImage(logo, true) ? logo : null;
	}

	private async favicon(domain: string) {
		const base = `https://${domain}/`;
		const page = await this.deps.fetchBytes(base, 512 * 1024);
		const linked =
			page && /^text\/html\b/i.test(page.contentType)
				? iconLinks(page.data.toString('utf8'), base)
				: [];
		const candidates = [...new Set([...linked.slice(0, 3), `${base}apple-touch-icon.png`])];
		for (const url of candidates) {
			const icon = await this.deps.fetchBytes(url, maxBytes);
			if (isImage(icon)) return icon;
		}
		// The classic favicon is often tiny, so only as a last resort.
		const fallback = await this.deps.fetchBytes(`${base}favicon.ico`, maxBytes);
		return isImage(fallback) ? fallback : null;
	}

	private async gravatar(address: string): Promise<Found> {
		const hash = createHash('sha256').update(address).digest('hex');
		const picture = await this.deps.fetchBytes(
			`https://www.gravatar.com/avatar/${hash}?s=128&d=404`,
			maxBytes
		);
		return isImage(picture) ? { source: 'gravatar', picture } : null;
	}
}

function toPicture(
	source: 'bimi' | 'favicon' | 'gravatar' | 'contact',
	contentType: string,
	data: Buffer
): SenderPicture {
	return {
		url: `data:${contentType.split(';')[0]};base64,${data.toString('base64')}`,
		// Logos and icons sit on white; photos fill the circle.
		kind: source === 'favicon' ? 'icon' : 'photo'
	};
}
