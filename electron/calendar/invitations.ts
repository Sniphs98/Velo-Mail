// Answering invitations that came by mail: the event goes into the calendar
// (or out of it), and the organizer gets a REPLY by mail, as Outlook, Google
// and Apple expect it.
import { m } from '../../src/lib/paraglide/messages.js';
import { eq } from 'drizzle-orm';
import type { Invitation, InvitationResponse, OutgoingMessage } from '../../src/lib/api';
import type { Database } from '../db';
import { messageBodies } from '../db/schema';
import { findMessage } from '../mail/queries';
import {
	calendarIcs,
	parseInvitation,
	replyIcs,
	responseOf,
	sequenceOf,
	withoutCancelled
} from './itip';
import type { CalendarManager } from './manager';

export interface InvitationsDeps {
	db: Database;
	calendar: Pick<CalendarManager, 'byUid' | 'createIcs' | 'replaceIcs' | 'delete'>;
	/** Downloads the message's content if it is not stored yet. */
	body(messageId: number): Promise<unknown>;
	send(message: OutgoingMessage, calendar: { method: string; content: string }): Promise<void>;
	account(accountId: number): Promise<{ name: string; email: string } | null>;
}

const subjects: Record<InvitationResponse, () => string> = {
	accepted: m.invite_reply_accepted,
	tentative: m.invite_reply_tentative,
	declined: m.invite_reply_declined
};

const texts: Record<InvitationResponse, (inputs: { who: string; summary: string }) => string> = {
	accepted: m.invite_reply_accepted_text,
	tentative: m.invite_reply_tentative_text,
	declined: m.invite_reply_declined_text
};

export class Invitations {
	constructor(private readonly deps: InvitationsDeps) {}

	private async load(messageId: number) {
		await this.deps.body(messageId);
		const [row] = await this.deps.db
			.select({ ics: messageBodies.calendar, response: messageBodies.calendarResponse })
			.from(messageBodies)
			.where(eq(messageBodies.messageId, messageId));
		const parsed = row?.ics ? parseInvitation(row.ics) : null;
		if (!row?.ics || !parsed) return null;
		const found = await findMessage(this.deps.db, messageId);
		const account = found ? await this.deps.account(found.mailbox.accountId) : null;
		if (!found || !account) return null;
		const stored = parsed.uid ? await this.deps.calendar.byUid(parsed.uid) : null;
		return {
			ics: row.ics,
			response: row.response,
			parsed,
			message: found.message,
			accountId: found.mailbox.accountId,
			account,
			stored
		};
	}

	async invitation(messageId: number): Promise<Invitation | null> {
		const found = await this.load(messageId);
		if (!found) return null;
		const { parsed, stored, account } = found;
		const fromCalendar = stored ? responseOf(stored.ics, account.email) : null;
		const saved = found.response as InvitationResponse | null;
		return {
			method: parsed.method,
			summary: parsed.summary,
			location: parsed.location,
			description: parsed.description,
			start: parsed.start,
			end: parsed.end,
			allDay: parsed.allDay,
			recurring: parsed.recurring,
			organizer: parsed.organizer,
			attendees: parsed.attendees,
			response: fromCalendar ?? saved,
			calendarId: stored?.calendarId ?? null,
			inCalendar: stored !== null,
			// A change to one occurrence says nothing about the series' version.
			outdated:
				stored !== null &&
				parsed.method === 'request' &&
				!parsed.recurrenceId &&
				sequenceOf(stored.ics) > parsed.sequence
		};
	}

	async respond(messageId: number, response: InvitationResponse, calendarId: number | null) {
		const found = await this.load(messageId);
		if (!found || found.parsed.method !== 'request') {
			throw new Error(m.error_no_invitation());
		}
		const { ics, parsed, stored, account, message, accountId } = found;

		if (stored && response === 'declined') {
			const rest = withoutCancelled(stored.ics, ics);
			if (rest) await this.deps.calendar.replaceIcs(stored.id, rest);
			else await this.deps.calendar.delete(stored.id);
		} else if (stored) {
			await this.deps.calendar.replaceIcs(
				stored.id,
				calendarIcs(ics, stored.ics, account.email, account.name, response)
			);
		} else if (response !== 'declined' && calendarId !== null) {
			await this.deps.calendar.createIcs(
				calendarId,
				calendarIcs(ics, null, account.email, account.name, response)
			);
		}

		const organizer = parsed.organizer?.address;
		if (organizer && organizer !== account.email.toLowerCase()) {
			const who = account.name || account.email;
			await this.deps.send(
				{
					accountId,
					to: organizer,
					cc: '',
					bcc: '',
					subject: `${subjects[response]()}: ${parsed.summary}`,
					text: texts[response]({ who, summary: parsed.summary }),
					attachments: [],
					replyTo: messageId,
					inReplyTo: message.messageId ?? undefined,
					references: [
						...(message.references ?? []),
						...(message.messageId ? [message.messageId] : [])
					]
				},
				{ method: 'REPLY', content: replyIcs(ics, account.email, account.name, response) }
			);
		}

		await this.deps.db
			.update(messageBodies)
			.set({ calendarResponse: response })
			.where(eq(messageBodies.messageId, messageId));
	}

	/** Takes a cancelled event, or the cancelled occurrence, out of the calendar. */
	async removeCancelled(messageId: number) {
		const found = await this.load(messageId);
		if (!found || found.parsed.method !== 'cancel') {
			throw new Error(m.error_no_cancellation());
		}
		if (!found.stored) return;
		const rest = withoutCancelled(found.stored.ics, found.ics);
		if (rest) await this.deps.calendar.replaceIcs(found.stored.id, rest);
		else await this.deps.calendar.delete(found.stored.id);
	}
}
