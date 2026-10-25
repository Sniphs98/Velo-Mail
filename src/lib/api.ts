// The API the preload script (electron/preload.ts) exposes to the renderer as
// `window.velo`. Main, preload and renderer share these types, so a change
// here is checked on both sides of the IPC boundary.

export interface AppInfo {
	name: string;
	version: string;
	platform: string;
	/** False on Linux without a keyring: passwords are then only obfuscated. */
	keyring: boolean;
}

export type Security = 'tls' | 'starttls' | 'none';

export interface ServerSettings {
	imapHost: string;
	imapPort: number;
	imapSecurity: Security;
	smtpHost: string;
	smtpPort: number;
	smtpSecurity: Security;
	username: string;
}

export interface Discovery {
	settings: ServerSettings;
	/** Where the settings came from; "guess" means common host names were assumed. */
	source: 'autoconfig' | 'ispdb' | 'srv' | 'guess';
}

/** Why a connection failed, for a message in the UI. */
export type ConnectionError = 'auth' | 'host' | 'timeout' | 'tls' | 'other';

export interface ConnectionResult {
	imap: { ok: true } | { ok: false; error: ConnectionError; detail: string };
	smtp: { ok: true } | { ok: false; error: ConnectionError; detail: string };
}

export interface NewAccount {
	name: string;
	email: string;
	password: string;
	settings: ServerSettings;
}

export interface Account {
	id: number;
	name: string;
	email: string;
	color: string;
	/** Plain text added below new messages and replies; empty for none. */
	signature: string;
}

/** What can be changed on an account after adding it. */
export interface AccountChanges {
	name?: string;
	signature?: string;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
	theme: Theme;
	/** Desktop notifications for new mail in the inboxes while the window is in the background. */
	notifications: boolean;
	/** An icon in the tray (menu bar on macOS); closing the window keeps the app running. */
	tray: boolean;
	/** Load sender pictures (logos, Gravatar) from the internet. */
	avatars: boolean;
	/** Look for a newer release on start. */
	updates: boolean;
	/** Desktop notifications for the reminders of calendar events. */
	reminders: boolean;
}

/** A newer release than the running one. */
export interface UpdateInfo {
	/** Without the leading "v", e.g. "0.2.0". */
	version: string;
	/** The release page, to download it by hand. */
	url: string;
	/** Whether this copy can install it itself (Windows installer, AppImage). */
	canSelfUpdate: boolean;
}

/** A sender's logo or photo, as a data: URL. */
export interface SenderPicture {
	url: string;
	/** "icon": a website icon, shown smaller on white; "photo" fills the circle. */
	kind: 'photo' | 'icon';
}

/** Result of accounts.add: the saved account, or why it was not saved. */
export type AddAccountResult =
	| { ok: true; account: Account }
	| { ok: false; reason: 'exists' | 'connection'; connection?: ConnectionResult };

export type MailboxRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'archive' | 'junk' | 'all';

export interface Mailbox {
	id: number;
	accountId: number;
	name: string;
	role: MailboxRole | null;
	unread: number;
}

export interface MessageSummary {
	id: number;
	accountId: number;
	mailboxId: number;
	fromName: string | null;
	fromAddress: string | null;
	to: { name?: string; address: string }[];
	subject: string;
	snippet: string;
	/** Milliseconds since the epoch. */
	date: number;
	/** In lists: true only if every message of the conversation is read. */
	seen: boolean;
	flagged: boolean;
	hasAttachments: boolean;
	/** Messages in the conversation (in lists: those in the listed folder). */
	threadSize: number;
}

export interface AttachmentInfo {
	id: number;
	filename: string | null;
	contentType: string;
	size: number;
}

export interface MessageBody {
	html: string | null;
	text: string | null;
	/** The HTML loads images or styles from the internet; blocked until allowed. */
	remoteContent: boolean;
	/** The sender's remote images may load without asking. */
	trusted: boolean;
	/** Attachments, without images shown inside the HTML. */
	attachments: AttachmentInfo[];
}

/** A file picked through the main process, attachable to a message. */
export interface PickedFile {
	path: string;
	name: string;
	size: number;
}

/** A message being written: sent, or saved as a draft. */
export interface OutgoingMessage {
	accountId: number;
	/** Comma-separated addresses, e.g. "Anna <anna@firma.de>, jonas@beispiel.de". */
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	/** The plain-text version. */
	text: string;
	/** The formatted version, if written in the editor. */
	html?: string;
	attachments: PickedFile[];
	/** Attachments of stored messages (forwarding, continuing a draft), sent along. */
	forwardAttachments?: number[];
	/** The message this one answers; gets \Answered once sent. */
	replyTo?: number;
	/** Headers that keep the conversation together. */
	inReplyTo?: string;
	references?: string[];
	/** The saved draft this replaces, deleted when sending or saving anew. */
	draftUid?: number;
}

/** A saved draft: its UID and attachments, which now live on the server. */
export interface SavedDraft {
	uid: number | null;
	attachments: AttachmentInfo[];
}

/** What a reply or forward starts from. */
export interface ReplySource {
	messageId: string | null;
	references: string[];
	from: { name?: string; address: string } | null;
	to: { name?: string; address: string }[];
	cc: { name?: string; address: string }[];
	subject: string;
	date: number;
	text: string;
	html: string | null;
	/** Its attachments, to forward them. */
	attachments: AttachmentInfo[];
	accountId: number;
	accountEmail: string;
	/** UID and whether it is a draft, to continue editing it. */
	uid: number;
	isDraft: boolean;
}

/** A CalDAV server with its login. */
export interface CalendarSource {
	id: number;
	name: string;
	serverUrl: string;
	username: string;
}

export interface NewCalendarSource {
	/** Shown in the sidebar; defaults to the user name. */
	name?: string;
	/** Usually the e-mail address. */
	username: string;
	password: string;
	/** Found from the address when empty. */
	serverUrl?: string;
}

export type AddCalendarResult =
	| { ok: true; source: CalendarSource }
	/** auth: wrong login; notfound: no server; oauth: Google/Microsoft need OAuth2. */
	| { ok: false; reason: 'auth' | 'notfound' | 'oauth' };

export interface Calendar {
	id: number;
	sourceId: number;
	name: string;
	color: string;
	enabled: boolean;
}

/** One occurrence in a range; recurring events give one per occurrence. */
export interface CalendarEvent {
	id: number;
	calendarId: number;
	color: string;
	summary: string;
	location: string | null;
	description: string | null;
	/** Milliseconds; all-day events run from local midnight to midnight. */
	start: number;
	end: number;
	allDay: boolean;
	recurring: boolean;
	/** Minutes before the start of its reminder; null for none. */
	reminder: number | null;
	/** Which occurrence of a series this is; null for a single event. */
	recurrenceId: string | null;
}

/** Changing one occurrence of a series: only it, or the whole series. */
export interface OccurrenceChange {
	/** Where the occurrence started before the change. */
	start: number;
	recurrenceId: string;
	only: boolean;
}

export interface EventInput {
	summary: string;
	location?: string;
	description?: string;
	start: number;
	end: number;
	allDay: boolean;
	/** Minutes before the start; null for none, left out to keep what there is. */
	reminder?: number | null;
}

export type ParticipantStatus =
	'accepted' | 'tentative' | 'declined' | 'delegated' | 'needs-action';

/** The answers one can give to an invitation. */
export type InvitationResponse = 'accepted' | 'tentative' | 'declined';

/** An invitation (or cancellation, or someone's answer) that came by mail. */
export interface Invitation {
	/** request: invited or changed; cancel: called off; reply: an attendee answered. */
	method: 'request' | 'cancel' | 'reply' | 'other';
	summary: string;
	location: string | null;
	description: string | null;
	start: number;
	end: number;
	allDay: boolean;
	recurring: boolean;
	organizer: { name?: string; address: string } | null;
	attendees: { name?: string; address: string; status: ParticipantStatus }[];
	/** The own answer so far, from the calendar or this message. */
	response: InvitationResponse | null;
	/** The calendar the event is in; null if it is in none. */
	calendarId: number | null;
	inCalendar: boolean;
	/** The calendar already has a newer version of the event. */
	outdated: boolean;
}

/** Which messages to list: one mailbox, or the inboxes of all accounts. */
export type MessageQuery = { mailboxId: number } | { inboxes: true };

export interface SyncStatus {
	accountId: number;
	state: 'syncing' | 'ready' | 'error';
	/** Set with state "error". */
	error?: string;
}

export interface VeloApi {
	app: {
		info(): Promise<AppInfo>;
		/** A newer release, or null when up to date (or offline). */
		checkUpdate(): Promise<UpdateInfo | null>;
		/** Downloads the newer release; reports progress through onUpdateProgress. */
		installUpdate(): Promise<void>;
		/** Quits and installs the downloaded release; the app starts again on it. */
		restartToUpdate(): Promise<void>;
		/** Download progress in percent. */
		onUpdateProgress(listener: (percent: number) => void): () => void;
	};
	accounts: {
		list(): Promise<Account[]>;
		/** Looks up the server settings for an address. */
		discover(email: string): Promise<Discovery>;
		/** Logs in to IMAP and SMTP without saving anything. */
		test(settings: ServerSettings, password: string): Promise<ConnectionResult>;
		/** Tests the connection, then saves the account with its password encrypted. */
		add(account: NewAccount): Promise<AddAccountResult>;
		update(id: number, changes: AccountChanges): Promise<Account>;
		remove(id: number): Promise<void>;
	};
	calendar: {
		sources(): Promise<CalendarSource[]>;
		/** Finds the server, checks the login and starts syncing. */
		addSource(source: NewCalendarSource): Promise<AddCalendarResult>;
		removeSource(id: number): Promise<void>;
		calendars(): Promise<Calendar[]>;
		updateCalendar(id: number, changes: { enabled?: boolean; color?: string }): Promise<void>;
		/** Occurrences that overlap [from, to), in milliseconds. */
		events(from: number, to: number): Promise<CalendarEvent[]>;
		createEvent(calendarId: number, event: EventInput): Promise<void>;
		/**
		 * Changes an event. For an occurrence of a series either only it changes,
		 * or the whole series, moving by as much as the occurrence was moved.
		 */
		updateEvent(id: number, event: EventInput, occurrence?: OccurrenceChange): Promise<void>;
		/** Deletes an event, or with `recurrenceId` only that occurrence of the series. */
		deleteEvent(id: number, recurrenceId?: string): Promise<void>;
		sync(): Promise<void>;
		onChanged(listener: () => void): () => void;
		/** A day should be shown, e.g. after clicking a reminder; local midnight in milliseconds. */
		onShowDay(listener: (day: number) => void): () => void;
	};
	settings: {
		get(): Promise<Settings>;
		/** Saves the given settings; returns all of them. */
		set(changes: Partial<Settings>): Promise<Settings>;
	};
	mail: {
		mailboxes(): Promise<Mailbox[]>;
		messages(query: MessageQuery): Promise<MessageSummary[]>;
		setSeen(messageId: number, seen: boolean): Promise<void>;
		/** The conversation of a message, oldest first, across the account's folders. */
		thread(messageId: number): Promise<MessageSummary[]>;
		/** Loads remote images of this sender without asking from now on. */
		trustSender(address: string): Promise<void>;
		/** The content, downloaded on first use. */
		body(messageId: number): Promise<MessageBody>;
		/** Opens an attachment with the system's app; false if that is not allowed for its type. */
		openAttachment(attachmentId: number): Promise<boolean>;
		/** Asks where to save; false if cancelled. */
		saveAttachment(attachmentId: number): Promise<boolean>;
		/** Everything needed to reply to or forward a message. */
		replySource(messageId: number): Promise<ReplySource>;
		/** Opens the system's file dialog; the files can then be attached. */
		pickFiles(): Promise<PickedFile[]>;
		send(message: OutgoingMessage): Promise<void>;
		/** Saves to the account's drafts folder; the result replaces it later. */
		saveDraft(message: OutgoingMessage): Promise<SavedDraft>;
		deleteDraft(accountId: number, uid: number): Promise<void>;
		/** Moves messages (whole conversations) to the archive or the trash. */
		move(messageIds: number[], to: 'archive' | 'trash'): Promise<void>;
		/** Local full-text search over subject, sender and content, newest first. */
		search(query: string): Promise<MessageSummary[]>;
		/** Searches on the servers for older messages; returns how many were added. */
		searchServer(query: string): Promise<number>;
		/** The sender's picture, looked up once and cached; null shows initials. */
		avatar(address: string): Promise<SenderPicture | null>;
		/** The invitation the message carries, or null. */
		invitation(messageId: number): Promise<Invitation | null>;
		/**
		 * Answers an invitation: puts it into the calendar (or takes it out when
		 * declined) and tells the organizer by mail.
		 */
		respondToInvitation(
			messageId: number,
			response: InvitationResponse,
			calendarId: number | null
		): Promise<void>;
		/** Takes a cancelled event (or occurrence) out of the calendar. */
		removeCancelledEvent(messageId: number): Promise<void>;
		/** Syncs an account (or all) now instead of waiting for the next round. */
		sync(accountId?: number): Promise<void>;
		/** Called whenever the cache changed; returns a function that unsubscribes. */
		onChanged(listener: () => void): () => void;
		onStatus(listener: (status: SyncStatus) => void): () => void;
		/** A message should be shown, e.g. after clicking its notification. */
		onOpen(listener: (messageId: number) => void): () => void;
		/** "Neue Nachricht" was chosen outside the window, e.g. in the tray. */
		onCompose(listener: () => void): () => void;
	};
}

declare global {
	interface Window {
		/** Set by electron/preload.ts; missing outside Electron. */
		velo?: VeloApi;
	}
}

/** IPC channel names, one per API call. */
export const IPC = {
	appInfo: 'app:info',
	appCheckUpdate: 'app:check-update',
	appInstallUpdate: 'app:install-update',
	appRestartToUpdate: 'app:restart-to-update',
	/** Main → renderer. */
	appUpdateProgress: 'app:update-progress',
	accountsList: 'accounts:list',
	accountsDiscover: 'accounts:discover',
	accountsTest: 'accounts:test',
	accountsAdd: 'accounts:add',
	accountsUpdate: 'accounts:update',
	accountsRemove: 'accounts:remove',
	settingsGet: 'settings:get',
	calendarSources: 'calendar:sources',
	calendarAddSource: 'calendar:add-source',
	calendarRemoveSource: 'calendar:remove-source',
	calendarCalendars: 'calendar:calendars',
	calendarUpdateCalendar: 'calendar:update-calendar',
	calendarEvents: 'calendar:events',
	calendarCreateEvent: 'calendar:create-event',
	calendarUpdateEvent: 'calendar:update-event',
	calendarDeleteEvent: 'calendar:delete-event',
	calendarSync: 'calendar:sync',
	/** Main → renderer. */
	calendarChanged: 'calendar:changed',
	calendarShowDay: 'calendar:show-day',
	settingsSet: 'settings:set',
	mailMailboxes: 'mail:mailboxes',
	mailMessages: 'mail:messages',
	mailSetSeen: 'mail:set-seen',
	mailSync: 'mail:sync',
	mailBody: 'mail:body',
	mailThread: 'mail:thread',
	mailReplySource: 'mail:reply-source',
	mailPickFiles: 'mail:pick-files',
	mailSend: 'mail:send',
	mailSaveDraft: 'mail:save-draft',
	mailDeleteDraft: 'mail:delete-draft',
	mailMove: 'mail:move',
	mailSearch: 'mail:search',
	mailSearchServer: 'mail:search-server',
	mailTrustSender: 'mail:trust-sender',
	mailAvatar: 'mail:avatar',
	mailOpenAttachment: 'mail:open-attachment',
	mailSaveAttachment: 'mail:save-attachment',
	mailInvitation: 'mail:invitation',
	mailRespondToInvitation: 'mail:respond-to-invitation',
	mailRemoveCancelledEvent: 'mail:remove-cancelled-event',
	/** Main → renderer. */
	mailChanged: 'mail:changed',
	mailStatus: 'mail:status',
	mailOpen: 'mail:open',
	mailCompose: 'mail:compose'
} as const;

/** The API, or undefined outside Electron (plain browser, component tests). */
export function velo(): VeloApi | undefined {
	return typeof window === 'undefined' ? undefined : window.velo;
}
