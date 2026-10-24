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
	text: string;
	attachments: PickedFile[];
	/** The message this one answers; gets \Answered once sent. */
	replyTo?: number;
	/** Headers that keep the conversation together. */
	inReplyTo?: string;
	references?: string[];
	/** The saved draft this replaces, deleted when sending or saving anew. */
	draftUid?: number;
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
	accountId: number;
	accountEmail: string;
	/** UID and whether it is a draft, to continue editing it. */
	uid: number;
	isDraft: boolean;
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
	};
	accounts: {
		list(): Promise<Account[]>;
		/** Looks up the server settings for an address. */
		discover(email: string): Promise<Discovery>;
		/** Logs in to IMAP and SMTP without saving anything. */
		test(settings: ServerSettings, password: string): Promise<ConnectionResult>;
		/** Tests the connection, then saves the account with its password encrypted. */
		add(account: NewAccount): Promise<AddAccountResult>;
		remove(id: number): Promise<void>;
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
		/** Saves to the account's drafts folder; returns the draft's UID to replace it later. */
		saveDraft(message: OutgoingMessage): Promise<number | null>;
		deleteDraft(accountId: number, uid: number): Promise<void>;
		/** Moves messages (whole conversations) to the archive or the trash. */
		move(messageIds: number[], to: 'archive' | 'trash'): Promise<void>;
		/** Syncs an account (or all) now instead of waiting for the next round. */
		sync(accountId?: number): Promise<void>;
		/** Called whenever the cache changed; returns a function that unsubscribes. */
		onChanged(listener: () => void): () => void;
		onStatus(listener: (status: SyncStatus) => void): () => void;
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
	accountsList: 'accounts:list',
	accountsDiscover: 'accounts:discover',
	accountsTest: 'accounts:test',
	accountsAdd: 'accounts:add',
	accountsRemove: 'accounts:remove',
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
	mailTrustSender: 'mail:trust-sender',
	mailOpenAttachment: 'mail:open-attachment',
	mailSaveAttachment: 'mail:save-attachment',
	/** Main → renderer. */
	mailChanged: 'mail:changed',
	mailStatus: 'mail:status'
} as const;

/** The API, or undefined outside Electron (plain browser, component tests). */
export function velo(): VeloApi | undefined {
	return typeof window === 'undefined' ? undefined : window.velo;
}
