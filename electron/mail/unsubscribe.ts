// Leaving a newsletter: at once with one POST where the sender allows it
// (RFC 8058), otherwise by its link or address, which the page opens.
import type { UnsubscribeResult } from '../../src/lib/api';
import type { Database } from '../db';
import { findMessage } from './queries';

/** Sends the one-click POST to a link; true if the sender confirmed it. */
export type OneClickPost = (url: string) => Promise<boolean>;

export async function unsubscribe(
	db: Database,
	messageId: number,
	post: OneClickPost
): Promise<UnsubscribeResult> {
	const found = await findMessage(db, messageId);
	const url = found?.message.unsubscribe ?? null;
	if (url && found?.message.unsubscribeOneClick && (await post(url))) return { done: true };
	return { done: false, url };
}

/** The POST of RFC 8058: no cookies, a fixed body, and only over https. */
export function oneClickPost(fetch: typeof globalThis.fetch): OneClickPost {
	return async (url) => {
		if (!url.startsWith('https://')) return false;
		try {
			const response = await fetch(url, {
				method: 'POST',
				signal: AbortSignal.timeout(10_000),
				credentials: 'omit',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: 'List-Unsubscribe=One-Click'
			});
			return response.ok;
		} catch {
			return false;
		}
	};
}
