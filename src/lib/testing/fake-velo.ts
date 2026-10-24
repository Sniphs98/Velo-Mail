import { vi } from 'vitest';
import type { AccountChanges, Settings, VeloApi } from '#lib/api.ts';

/** A window.velo for component tests; override what a test needs. */
export function fakeVelo(overrides: { [K in keyof VeloApi]?: Partial<VeloApi[K]> } = {}): VeloApi {
	const api: VeloApi = {
		app: {
			info: vi.fn(async () => ({
				name: 'Velo Mail',
				version: '1.2.3',
				platform: 'linux',
				keyring: true
			})),
			...overrides.app
		},
		accounts: {
			list: vi.fn(async () => []),
			discover: vi.fn(async (email: string) => ({
				settings: {
					imapHost: 'imap.beispiel.de',
					imapPort: 993,
					imapSecurity: 'tls' as const,
					smtpHost: 'smtp.beispiel.de',
					smtpPort: 465,
					smtpSecurity: 'tls' as const,
					username: email
				},
				source: 'ispdb' as const
			})),
			test: vi.fn(async () => ({ imap: { ok: true }, smtp: { ok: true } }) as const),
			add: vi.fn(async () => ({
				ok: true as const,
				account: {
					id: 1,
					name: 'Persönlich',
					email: 'du@beispiel.de',
					color: '#2563eb',
					signature: ''
				}
			})),
			update: vi.fn(async (id: number, changes: AccountChanges) => ({
				id,
				name: changes.name ?? 'Persönlich',
				email: 'du@beispiel.de',
				color: '#2563eb',
				signature: changes.signature ?? ''
			})),
			remove: vi.fn(async () => {}),
			...overrides.accounts
		},
		settings: {
			get: vi.fn(async () => ({
				theme: 'system' as const,
				notifications: true,
				tray: false,
				avatars: true
			})),
			set: vi.fn(async (changes: Partial<Settings>) => ({
				theme: 'system' as const,
				notifications: true,
				tray: false,
				avatars: true,
				...changes
			})),
			...overrides.settings
		},
		mail: {
			mailboxes: vi.fn(async () => []),
			messages: vi.fn(async () => []),
			setSeen: vi.fn(async () => {}),
			thread: vi.fn(async () => []),
			replySource: vi.fn(async (id: number) => ({
				messageId: '<p@firma.de>',
				references: [],
				from: { name: 'Anna Becker', address: 'anna@firma.de' },
				to: [{ address: 'du@beispiel.de' }],
				cc: [],
				subject: 'Planung',
				date: Date.UTC(2026, 9, 24, 7, 42),
				text: 'Kannst du drüberschauen?',
				accountId: 1,
				accountEmail: 'du@beispiel.de',
				uid: id,
				isDraft: false
			})),
			pickFiles: vi.fn(async () => []),
			send: vi.fn(async () => {}),
			saveDraft: vi.fn(async () => 99),
			deleteDraft: vi.fn(async () => {}),
			move: vi.fn(async () => {}),
			search: vi.fn(async () => []),
			searchServer: vi.fn(async () => 0),
			trustSender: vi.fn(async () => {}),
			avatar: vi.fn(async () => null),
			body: vi.fn(async () => ({
				html: null,
				text: 'Hallo!',
				remoteContent: false,
				trusted: false,
				attachments: []
			})),
			openAttachment: vi.fn(async () => true),
			saveAttachment: vi.fn(async () => true),
			sync: vi.fn(async () => {}),
			onChanged: vi.fn(() => () => {}),
			onStatus: vi.fn(() => () => {}),
			onOpen: vi.fn(() => () => {}),
			onCompose: vi.fn(() => () => {}),
			...overrides.mail
		}
	};
	window.velo = api;
	return api;
}
