import { vi } from 'vitest';
import type { VeloApi } from '#lib/api.ts';

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
				account: { id: 1, name: 'Persönlich', email: 'du@beispiel.de', color: '#2563eb' }
			})),
			remove: vi.fn(async () => {}),
			...overrides.accounts
		}
	};
	window.velo = api;
	return api;
}
