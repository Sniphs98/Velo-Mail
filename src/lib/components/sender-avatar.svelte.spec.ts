import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { pictures } from '#lib/pictures.svelte.ts';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import SenderAvatar from './sender-avatar.svelte';

// A red pixel.
const pixel =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

describe('SenderAvatar', () => {
	afterEach(() => {
		pictures.clear();
		delete window.velo;
	});

	it('shows initials until a picture is found', async () => {
		const api = fakeVelo({ mail: { avatar: vi.fn(async () => null) } });
		const screen = render(SenderAvatar, { name: 'Anna Becker', address: 'Anna@Firma.de' });
		await expect.element(screen.getByText('AB')).toBeInTheDocument();
		// The name goes along, so a provider's own mail can show its logo.
		expect(api.mail.avatar).toHaveBeenCalledWith('anna@firma.de', 'Anna Becker');
		expect(screen.container.querySelector('img')).toBeNull();
	});

	it("shows the sender's picture, icons smaller", async () => {
		fakeVelo({ mail: { avatar: vi.fn(async () => ({ url: pixel, kind: 'icon' as const })) } });
		const screen = render(SenderAvatar, { name: 'Firma', address: 'info@firma.de' });
		await vi.waitFor(() => expect(screen.container.querySelector('img')).not.toBeNull());
		const img = screen.container.querySelector('img')!;
		expect(img.getAttribute('src')).toBe(pixel);
		expect(img.className).toContain('object-contain');
		expect(screen.container.textContent).not.toContain('FI');
	});

	it('asks once per address', async () => {
		const api = fakeVelo();
		render(SenderAvatar, { name: null, address: 'a@firma.de' });
		render(SenderAvatar, { name: null, address: 'A@firma.de' });
		await vi.waitFor(() => expect(api.mail.avatar).toHaveBeenCalledTimes(1));
	});
});
