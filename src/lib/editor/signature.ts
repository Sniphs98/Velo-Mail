import { Node } from '@tiptap/core';

/**
 * The signature as a block of its own (<div data-signature>), so it can be
 * found and exchanged when the sender account changes (mail-text.ts).
 */
export const Signature = Node.create({
	name: 'signature',
	group: 'block',
	content: 'block+',
	defining: true,
	parseHTML: () => [{ tag: 'div[data-signature]' }],
	renderHTML: () => ['div', { 'data-signature': 'true', class: 'signature' }, 0]
});
