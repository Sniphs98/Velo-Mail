import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Invitation } from '#lib/api.ts';
import { fakeVelo } from '#lib/testing/fake-velo.ts';
import InvitationCard from './invitation-card.svelte';

const invitation = (over: Partial<Invitation> = {}): Invitation => ({
	method: 'request',
	summary: 'Planung Q4',
	location: 'Raum 3',
	description: null,
	start: new Date(2026, 10, 3, 10).getTime(),
	end: new Date(2026, 10, 3, 11).getTime(),
	allDay: false,
	recurring: false,
	organizer: { name: 'Anna Becker', address: 'anna@firma.de' },
	attendees: [
		{ name: 'Anna Becker', address: 'anna@firma.de', status: 'accepted' },
		{ address: 'du@beispiel.de', status: 'needs-action' }
	],
	response: null,
	calendarId: null,
	inCalendar: false,
	outdated: false,
	...over
});

const calendars = [
	{ id: 1, sourceId: 1, name: 'Privat', color: '#ea580c', enabled: true },
	{ id: 2, sourceId: 1, name: 'Arbeit', color: '#16a34a', enabled: true }
];

describe('InvitationCard', () => {
	afterEach(() => {
		delete window.velo;
	});

	it('shows nothing for a message without an invitation', async () => {
		fakeVelo();
		render(InvitationCard, { messageId: 1 });
		await expect.element(page.getByRole('region', { name: 'Einladung' })).not.toBeInTheDocument();
	});

	it('shows the event and accepts it into the chosen calendar', async () => {
		let current = invitation();
		const api = fakeVelo({
			mail: {
				invitation: vi.fn(async () => current),
				respondToInvitation: vi.fn(async () => {
					current = invitation({ response: 'accepted', inCalendar: true, calendarId: 2 });
				})
			},
			calendar: { calendars: vi.fn(async () => calendars) }
		});
		render(InvitationCard, { messageId: 7 });

		const card = page.getByRole('region', { name: 'Einladung' });
		await expect.element(card).toHaveTextContent('Planung Q4');
		await expect.element(card).toHaveTextContent('Di., 3. November 2026 · 10:00–11:00');
		await expect.element(card).toHaveTextContent('Raum 3');
		await expect.element(card).toHaveTextContent('Von Anna Becker · 2 Teilnehmende');

		await page.getByRole('combobox', { name: 'Kalender' }).selectOptions('Arbeit');
		await page.getByRole('button', { name: 'Zusagen' }).click();

		expect(api.mail.respondToInvitation).toHaveBeenCalledWith(7, 'accepted', 2);
		await expect.element(page.getByRole('status')).toHaveTextContent('Du hast zugesagt.');
		await expect
			.element(page.getByRole('button', { name: 'Zusagen' }))
			.toHaveAttribute('aria-pressed', 'true');
		// Already in a calendar: nothing left to choose.
		await expect.element(page.getByRole('combobox', { name: 'Kalender' })).not.toBeInTheDocument();
	});

	it('says when no calendar is connected and shows errors', async () => {
		fakeVelo({
			mail: {
				invitation: vi.fn(async () => invitation()),
				respondToInvitation: vi.fn(async () => {
					throw new Error(
						"Error invoking remote method 'mail:respond-to-invitation': Error: SMTP nicht erreichbar"
					);
				})
			}
		});
		render(InvitationCard, { messageId: 7 });
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(
				'Kein Kalender verbunden – deine Antwort geht nur per Mail an Anna Becker.'
			);
		await page.getByRole('button', { name: 'Absagen' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('SMTP nicht erreichbar');
	});

	it('offers to remove a cancelled event from the calendar', async () => {
		let current = invitation({ method: 'cancel', inCalendar: true, calendarId: 1 });
		const api = fakeVelo({
			mail: {
				invitation: vi.fn(async () => current),
				removeCancelledEvent: vi.fn(async () => {
					current = { ...current, inCalendar: false, calendarId: null };
				})
			}
		});
		render(InvitationCard, { messageId: 3 });
		const card = page.getByRole('region', { name: 'Absage' });
		await expect.element(card).toHaveTextContent('Dieser Termin wurde abgesagt.');
		await page.getByRole('button', { name: 'Aus dem Kalender entfernen' }).click();
		expect(api.mail.removeCancelledEvent).toHaveBeenCalledWith(3);
		await expect.element(card).toHaveTextContent('Er steht nicht in deinem Kalender.');
	});

	it('shows outdated invitations and answers from attendees without buttons', async () => {
		fakeVelo({ mail: { invitation: vi.fn(async () => invitation({ outdated: true })) } });
		const { rerender } = render(InvitationCard, { messageId: 1 });
		await expect
			.element(page.getByRole('region', { name: 'Einladung' }))
			.toHaveTextContent('Diese Einladung ist veraltet');
		await expect.element(page.getByRole('button', { name: 'Zusagen' })).not.toBeInTheDocument();

		fakeVelo({
			mail: {
				invitation: vi.fn(async () =>
					invitation({
						method: 'reply',
						attendees: [{ name: 'Jonas', address: 'jonas@firma.de', status: 'tentative' }]
					})
				)
			}
		});
		await rerender({ messageId: 2 });
		await expect
			.element(page.getByRole('region', { name: 'Einladung' }))
			.toHaveTextContent('Jonas hat mit Vielleicht geantwortet.');
	});
});
