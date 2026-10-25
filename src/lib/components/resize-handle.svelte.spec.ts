import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ResizeHandle from './resize-handle.svelte';

describe('ResizeHandle', () => {
	it('changes the width with the keyboard, within its limits', async () => {
		const props = $state({ value: 300, min: 200, max: 400, initial: 320, label: 'Breite' });
		render(ResizeHandle, props);
		const divider = page.getByRole('separator', { name: 'Breite' });
		await expect.element(divider).toHaveAttribute('aria-valuenow', '300');

		(divider.element() as HTMLElement).focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect.element(divider).toHaveAttribute('aria-valuenow', '316');
		await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
		await expect.element(divider).toHaveAttribute('aria-valuenow', '268');
		await userEvent.keyboard('{End}');
		await expect.element(divider).toHaveAttribute('aria-valuenow', '400');
		await userEvent.keyboard('{ArrowRight}');
		await expect.element(divider).toHaveAttribute('aria-valuenow', '400');

		// Rendered alone it has no height to click on, so the event is sent directly.
		divider.element().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		await expect.element(divider).toHaveAttribute('aria-valuenow', '320');
	});
});
