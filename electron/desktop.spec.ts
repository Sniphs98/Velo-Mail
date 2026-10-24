import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({}));
const { notificationsFor } = await import('./desktop');

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
			{ title: '2@beispiel.de', body: '(kein Betreff)', messageId: 2 }
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
