import { describe, expect, it } from 'vitest';
import { discoverSettings, parseAutoconfig, type DiscoveryDeps } from './autoconfig';

const xml = `<?xml version="1.0"?>
<clientConfig version="1.1">
  <emailProvider id="beispiel.de">
    <incomingServer type="pop3">
      <hostname>pop.beispiel.de</hostname><port>995</port><socketType>SSL</socketType>
    </incomingServer>
    <incomingServer type="imap">
      <hostname>imap.beispiel.de</hostname><port>143</port><socketType>STARTTLS</socketType>
      <username>%EMAILLOCALPART%</username>
    </incomingServer>
    <incomingServer type="imap">
      <hostname>imap.beispiel.de</hostname><port>993</port><socketType>SSL</socketType>
      <username>%EMAILLOCALPART%</username>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.%EMAILDOMAIN%</hostname><port>587</port><socketType>STARTTLS</socketType>
      <username>%EMAILADDRESS%</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;

const expected = {
	imapHost: 'imap.beispiel.de',
	imapPort: 993,
	imapSecurity: 'tls',
	smtpHost: 'smtp.beispiel.de',
	smtpPort: 587,
	smtpSecurity: 'starttls',
	username: 'du'
};

function deps(overrides: Partial<DiscoveryDeps> & { pages?: Record<string, string> } = {}) {
	const requested: string[] = [];
	const { pages = {}, ...rest } = overrides;
	const d: DiscoveryDeps = {
		fetchText: async (url) => {
			requested.push(url);
			const page = Object.entries(pages).find(([prefix]) => url.startsWith(prefix));
			return page?.[1] ?? null;
		},
		resolveMx: async () => [],
		resolveSrv: async () => [],
		...rest
	};
	return { deps: d, requested };
}

describe('parseAutoconfig', () => {
	it('picks the IMAP and SMTP server with the strongest encryption', () => {
		expect(parseAutoconfig(xml, 'du@beispiel.de')).toEqual(expected);
	});

	it('rejects files without IMAP or SMTP, and garbage', () => {
		const popOnly = xml.replace(/<incomingServer type="imap">[\s\S]*?<\/incomingServer>/g, '');
		expect(parseAutoconfig(popOnly, 'du@beispiel.de')).toBeNull();
		expect(parseAutoconfig('<html>nope</html>', 'du@beispiel.de')).toBeNull();
		expect(parseAutoconfig('<<<', 'du@beispiel.de')).toBeNull();
		expect(parseAutoconfig(null, 'du@beispiel.de')).toBeNull();
	});
});

describe('discoverSettings', () => {
	it("prefers the provider's own autoconfig file", async () => {
		const { deps: d, requested } = deps({
			pages: { 'https://autoconfig.beispiel.de/mail/config-v1.1.xml': xml }
		});
		expect(await discoverSettings('du@beispiel.de', d)).toEqual({
			settings: expected,
			source: 'autoconfig'
		});
		expect(requested[0]).toBe(
			'https://autoconfig.beispiel.de/mail/config-v1.1.xml?emailaddress=du%40beispiel.de'
		);
	});

	it("falls back to Mozilla's ISP database", async () => {
		const { deps: d } = deps({
			pages: { 'https://autoconfig.thunderbird.net/v1.1/beispiel.de': xml }
		});
		expect(await discoverSettings('du@beispiel.de', d)).toMatchObject({ source: 'ispdb' });
	});

	it('looks up the domain the MX records point to', async () => {
		const { deps: d, requested } = deps({
			pages: { 'https://autoconfig.thunderbird.net/v1.1/google.com': xml },
			resolveMx: async () => [
				{ exchange: 'alt1.aspmx.l.google.com', priority: 5 },
				{ exchange: 'aspmx.l.google.com.', priority: 1 }
			]
		});
		expect(await discoverSettings('du@firma.de', d)).toMatchObject({ source: 'ispdb' });
		expect(requested).toContain('https://autoconfig.thunderbird.net/v1.1/google.com');
	});

	it('uses DNS SRV records', async () => {
		const records: Record<string, { name: string; port: number; priority: number }[]> = {
			'_imaps._tcp.firma.de': [{ name: '.', port: 0, priority: 0 }],
			'_imap._tcp.firma.de': [{ name: 'mail.firma.de.', port: 143, priority: 0 }],
			'_submissions._tcp.firma.de': [{ name: 'mail.firma.de', port: 465, priority: 0 }]
		};
		const { deps: d } = deps({ resolveSrv: async (name) => records[name] ?? [] });
		expect(await discoverSettings('du@firma.de', d)).toEqual({
			settings: {
				imapHost: 'mail.firma.de',
				imapPort: 143,
				imapSecurity: 'starttls',
				smtpHost: 'mail.firma.de',
				smtpPort: 465,
				smtpSecurity: 'tls',
				username: 'du@firma.de'
			},
			source: 'srv'
		});
	});

	it('guesses the common host names last, and survives DNS errors', async () => {
		const { deps: d } = deps({
			resolveMx: async () => {
				throw new Error('ENOTFOUND');
			},
			resolveSrv: async () => {
				throw new Error('ENOTFOUND');
			}
		});
		expect(await discoverSettings('du@Firma.de', d)).toEqual({
			settings: {
				imapHost: 'imap.firma.de',
				imapPort: 993,
				imapSecurity: 'tls',
				smtpHost: 'smtp.firma.de',
				smtpPort: 465,
				smtpSecurity: 'tls',
				username: 'du@Firma.de'
			},
			source: 'guess'
		});
	});
});
