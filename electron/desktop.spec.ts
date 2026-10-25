import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({}));
const { notificationsFor, reminderText } = await import('./desktop');

const mail = (id: number, fromName: string | null, subject = 'Hallo') => ({
	id,
	fromName,
	fromAddress: `${id}@beispiel.de`,
	subject
});

describe('notificationsFor', () => {
	it('announces each message with its sender and subject', () => {
		expect(notificationsFor('Arbeit', [mail(1, 'Anna Becker'), mail(2, null, '')])).toEqual([
			{ title: 'Anna Becker', body: 'Hallo', messageId: 1 },
			{ title: '2@beispiel.de', body: '(Kein Betreff)', messageId: 2 }
		]);
	});

	it('sums up many messages in one notification', () => {
		const mails = [
			mail(1, 'Anna'),
			mail(2, 'Ben'),
			mail(3, 'Anna'),
			mail(4, 'Clara'),
			mail(5, 'Dora')
		];
		expect(notificationsFor('Arbeit', mails)).toEqual([
			{ title: '5 neue Nachrichten · Arbeit', body: 'Anna, Ben, Clara …', messageId: undefined }
		]);
	});
});

describe('reminderText', () => {
	const now = new Date(2026, 10, 3, 14, 45);
	const at = (day: number, hour: number) => new Date(2026, 10, day, hour);
	const reminder = (over: Partial<Parameters<typeof reminderText>[0]> = {}) => ({
		eventId: 1,
		at: at(3, 14),
		start: at(3, 15),
		end: at(3, 16),
		summary: 'Retro',
		location: 'Küche',
		allDay: false,
		...over
	});

	it('says when and where', () => {
		expect(reminderText(reminder(), now)).toEqual({
			title: 'Retro',
			body: 'Heute 15:00–16:00 · Küche'
		});
		expect(
			reminderText(reminder({ start: at(4, 9), end: at(4, 10), location: null }), now)
		).toEqual({ title: 'Retro', body: 'Morgen 09:00–10:00' });
	});

	it('shows all-day events and later days by date', () => {
		expect(
			reminderText(
				reminder({ start: at(5, 0), end: at(6, 0), allDay: true, summary: '', location: null }),
				now
			)
		).toEqual({ title: 'Termin', body: 'Do., 5. Nov. (ganztägig)' });
	});
});
