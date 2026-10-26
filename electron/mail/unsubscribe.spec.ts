import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from '../db';
import { accounts, mailboxes, messages } from '../db/schema';
import { oneClickPost, unsubscribe } from './unsubscribe';

let db: Database;

async function newsletter(unsubscribe: string | null, unsubscribeOneClick = false) {
	const [account] = await db
		.insert(accounts)
		.values({
			name: 'Test',
			email: `du${Math.random()}@beispiel.de`,
			color: '#2563eb',
			imapHost: 'imap',
			imapPort: 993,
			imapSecurity: 'tls',
			smtpHost: 'smtp',
			smtpPort: 465,
			smtpSecurity: 'tls',
			username: 'du'
		})
		.returning();
	const [box] = await db
		.insert(mailboxes)
		.values({ accountId: account.id, path: 'INBOX', name: 'INBOX', role: 'inbox' })
		.returning();
	const [row] = await db
		.insert(messages)
		.values({
			mailboxId: box.id,
			uid: 1,
			date: new Date(),
			newsletter: true,
			unsubscribe,
			unsubscribeOneClick
		})
		.returning();
	return row.id;
}

beforeEach(() => {
	db = openDatabase(':memory:', path.resolve('drizzle'));
});

describe('unsubscribe', () => {
	it('unsubscribes at once where the sender takes one POST', async () => {
		const post = vi.fn(async () => true);
		const id = await newsletter('https://shop.de/stop?id=1', true);
		expect(await unsubscribe(db, id, post)).toEqual({ done: true });
		expect(post).toHaveBeenCalledWith('https://shop.de/stop?id=1');
	});

	it('hands back the link or address otherwise, or when the POST fails', async () => {
		const failing = vi.fn(async () => false);
		const page = await newsletter('https://shop.de/stop');
		const oneClick = await newsletter('https://shop.de/stop', true);
		const address = await newsletter('mailto:weg@shop.de');
		const none = await newsletter(null);

		expect(await unsubscribe(db, page, failing)).toEqual({
			done: false,
			url: 'https://shop.de/stop'
		});
		expect(failing).not.toHaveBeenCalled();
		expect(await unsubscribe(db, oneClick, failing)).toEqual({
			done: false,
			url: 'https://shop.de/stop'
		});
		expect(await unsubscribe(db, address, failing)).toEqual({
			done: false,
			url: 'mailto:weg@shop.de'
		});
		expect(await unsubscribe(db, none, failing)).toEqual({ done: false, url: null });
		expect(await unsubscribe(db, 999, failing)).toEqual({ done: false, url: null });
	});
});

describe('oneClickPost', () => {
	it('posts the fixed body of RFC 8058 without cookies, only over https', async () => {
		const fetch = vi.fn(async () => new Response('', { status: 200 }));
		const post = oneClickPost(fetch);
		expect(await post('https://shop.de/stop')).toBe(true);
		expect(fetch).toHaveBeenCalledWith(
			'https://shop.de/stop',
			expect.objectContaining({
				method: 'POST',
				credentials: 'omit',
				body: 'List-Unsubscribe=One-Click',
				headers: { 'content-type': 'application/x-www-form-urlencoded' }
			})
		);
		expect(await post('http://shop.de/stop')).toBe(false);
		expect(fetch).toHaveBeenCalledOnce();
	});

	it('reports failures and errors as not done', async () => {
		expect(await oneClickPost(async () => new Response('', { status: 500 }))('https://a.de')).toBe(
			false
		);
		expect(
			await oneClickPost(async () => {
				throw new Error('offline');
			})('https://a.de')
		).toBe(false);
	});
});
