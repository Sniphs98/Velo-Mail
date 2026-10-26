// Unsubscribing from the newsletter a message came with: at once where the
// sender allows it, else on its web page or with the mail it asks for.
import { velo } from '#lib/api.ts';
import { compose } from '#lib/compose.svelte.ts';

/** done: unsubscribed; opened: the page is open in the browser; writing: the mail is in the composer. */
export type UnsubscribeOutcome = 'done' | 'opened' | 'writing' | 'none';

export async function unsubscribeFrom(message: {
	id: number;
	accountId: number;
}): Promise<UnsubscribeOutcome> {
	const result = await velo()?.mail.unsubscribe(message.id);
	if (!result) return 'none';
	if (result.done) return 'done';
	if (!result.url) return 'none';
	if (/^mailto:/i.test(result.url)) {
		compose.startMailto(message.accountId, result.url);
		return 'writing';
	}
	// The main process opens https: links in the browser.
	window.open(result.url, '_blank', 'noreferrer');
	return 'opened';
}
