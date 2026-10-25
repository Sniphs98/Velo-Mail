// The local mail cache. Lists and headers are stored right away, bodies and
// attachments once they are opened, so the app is fast and works offline.
import { sql } from 'drizzle-orm';
import {
	blob,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

const createdAt = () =>
	integer({ mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

export const accounts = sqliteTable('accounts', {
	id: integer().primaryKey({ autoIncrement: true }),
	name: text().notNull(),
	email: text().notNull().unique(),
	/** Shown as a dot on avatars and in the sidebar. */
	color: text().notNull(),
	position: integer().notNull().default(0),
	imapHost: text().notNull(),
	imapPort: integer().notNull(),
	imapSecurity: text({ enum: ['tls', 'starttls', 'none'] }).notNull(),
	smtpHost: text().notNull(),
	smtpPort: integer().notNull(),
	smtpSecurity: text({ enum: ['tls', 'starttls', 'none'] }).notNull(),
	username: text().notNull(),
	authType: text({ enum: ['password', 'oauth2'] })
		.notNull()
		.default('password'),
	/** Password or tokens, encrypted with Electron's safeStorage; never plain text. */
	secret: blob({ mode: 'buffer' }),
	/** Added below new messages and replies, after "-- ". */
	signature: text().notNull().default(''),
	createdAt: createdAt()
});

export const mailboxes = sqliteTable(
	'mailboxes',
	{
		id: integer().primaryKey({ autoIncrement: true }),
		accountId: integer()
			.notNull()
			.references(() => accounts.id, { onDelete: 'cascade' }),
		/** The IMAP path, e.g. "INBOX" or "[Gmail]/Gesendet". */
		path: text().notNull(),
		name: text().notNull(),
		delimiter: text(),
		/** Special-use role from the server (RFC 6154), if any. */
		role: text({ enum: ['inbox', 'sent', 'drafts', 'trash', 'archive', 'junk', 'all'] }),
		uidValidity: integer(),
		uidNext: integer(),
		/** CONDSTORE MODSEQ; 64-bit, so kept as text. */
		highestModseq: text(),
		lastSyncedAt: integer({ mode: 'timestamp' })
	},
	(t) => [uniqueIndex('mailboxes_account_path').on(t.accountId, t.path)]
);

export const messages = sqliteTable(
	'messages',
	{
		id: integer().primaryKey({ autoIncrement: true }),
		mailboxId: integer()
			.notNull()
			.references(() => mailboxes.id, { onDelete: 'cascade' }),
		uid: integer().notNull(),
		/** The Message-ID header. */
		messageId: text(),
		inReplyTo: text(),
		/** Message-IDs from the References header, as a JSON array. */
		references: text({ mode: 'json' }).$type<string[]>(),
		/** Conversation this message belongs to (see threading in phase 5). */
		threadId: text(),
		subject: text().notNull().default(''),
		fromName: text(),
		fromAddress: text(),
		to: text({ mode: 'json' }).$type<Address[]>().notNull().default([]),
		cc: text({ mode: 'json' }).$type<Address[]>().notNull().default([]),
		date: integer({ mode: 'timestamp' }).notNull(),
		snippet: text().notNull().default(''),
		size: integer(),
		seen: integer({ mode: 'boolean' }).notNull().default(false),
		flagged: integer({ mode: 'boolean' }).notNull().default(false),
		answered: integer({ mode: 'boolean' }).notNull().default(false),
		draft: integer({ mode: 'boolean' }).notNull().default(false),
		hasAttachments: integer({ mode: 'boolean' }).notNull().default(false)
	},
	(t) => [
		uniqueIndex('messages_mailbox_uid').on(t.mailboxId, t.uid),
		index('messages_mailbox_date').on(t.mailboxId, t.date),
		index('messages_thread').on(t.threadId),
		index('messages_message_id').on(t.messageId)
	]
);

export interface Address {
	name?: string;
	address: string;
}

export const messageBodies = sqliteTable('message_bodies', {
	messageId: integer()
		.primaryKey()
		.references(() => messages.id, { onDelete: 'cascade' }),
	text: text(),
	html: text(),
	/** Attachment names and the text of PDF attachments, for search only. */
	attachmentText: text(),
	fetchedAt: createdAt()
});

export const attachments = sqliteTable(
	'attachments',
	{
		id: integer().primaryKey({ autoIncrement: true }),
		messageId: integer()
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		/** IMAP body part, used to fetch the content when it is opened. */
		part: text().notNull(),
		filename: text(),
		contentType: text().notNull(),
		size: integer(),
		/** Set for inline images referenced as cid: from the HTML body. */
		contentId: text(),
		inline: integer({ mode: 'boolean' }).notNull().default(false)
	},
	(t) => [index('attachments_message').on(t.messageId)]
);

/** Sender pictures, looked up once per address or domain (see PLAN.md). */
export const senderAvatars = sqliteTable(
	'sender_avatars',
	{
		/** An address (contact photo, Gravatar) or a domain (BIMI, favicon). */
		key: text().notNull(),
		kind: text({ enum: ['address', 'domain'] }).notNull(),
		/** Where the picture came from; "none" caches a miss. */
		source: text({ enum: ['contact', 'bimi', 'favicon', 'gravatar', 'none'] }).notNull(),
		contentType: text(),
		data: blob({ mode: 'buffer' }),
		fetchedAt: createdAt(),
		expiresAt: integer({ mode: 'timestamp' }).notNull()
	},
	(t) => [primaryKey({ columns: [t.kind, t.key] })]
);

/** Senders whose remote images load without asking. */
export const trustedSenders = sqliteTable('trusted_senders', {
	address: text().primaryKey(),
	createdAt: createdAt()
});

/** App settings as JSON values, one row per key (see electron/settings.ts). */
export const settings = sqliteTable('settings', {
	key: text().primaryKey(),
	value: text({ mode: 'json' }).notNull()
});

/**
 * A CalDAV server with its login (iCloud, Nextcloud, Posteo, …). It may reuse
 * a mail account's credentials, or have its own.
 */
export const calendarSources = sqliteTable('calendar_sources', {
	id: integer().primaryKey({ autoIncrement: true }),
	name: text().notNull(),
	serverUrl: text().notNull(),
	username: text().notNull(),
	/** Password, encrypted with safeStorage like the mail accounts'. */
	secret: blob({ mode: 'buffer' }).notNull(),
	createdAt: createdAt()
});

export const calendars = sqliteTable(
	'calendars',
	{
		id: integer().primaryKey({ autoIncrement: true }),
		sourceId: integer()
			.notNull()
			.references(() => calendarSources.id, { onDelete: 'cascade' }),
		url: text().notNull(),
		name: text().notNull(),
		color: text().notNull(),
		/** Shown in the views; the user can hide a calendar. */
		enabled: integer({ mode: 'boolean' }).notNull().default(true),
		/** The server's change tag; when it is unchanged nothing is fetched. */
		ctag: text()
	},
	(t) => [uniqueIndex('calendars_source_url').on(t.sourceId, t.url)]
);

/** One calendar object (VEVENT with its exceptions), as stored on the server. */
export const events = sqliteTable(
	'events',
	{
		id: integer().primaryKey({ autoIncrement: true }),
		calendarId: integer()
			.notNull()
			.references(() => calendars.id, { onDelete: 'cascade' }),
		/** Where the object lives on the server, and its version. */
		href: text().notNull(),
		etag: text(),
		uid: text().notNull(),
		/** The whole iCalendar text; recurrences are expanded from it when shown. */
		ics: text().notNull(),
		summary: text().notNull().default(''),
		location: text(),
		/** Of the (first) occurrence, in milliseconds. */
		start: integer({ mode: 'timestamp_ms' }).notNull(),
		end: integer({ mode: 'timestamp_ms' }).notNull(),
		allDay: integer({ mode: 'boolean' }).notNull().default(false),
		recurring: integer({ mode: 'boolean' }).notNull().default(false),
		/** Last possible occurrence of a recurring event; null if it never ends. */
		recurUntil: integer({ mode: 'timestamp_ms' })
	},
	(t) => [
		uniqueIndex('events_calendar_href').on(t.calendarId, t.href),
		index('events_calendar_start').on(t.calendarId, t.start)
	]
);
