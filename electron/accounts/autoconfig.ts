// Finds the IMAP and SMTP settings for an address, in the order Thunderbird
// uses: the provider's own autoconfig file, Mozilla's ISP database (also for
// the domain the MX records point to, which covers e.g. Google Workspace),
// DNS SRV records (RFC 6186), and finally the common host names.
import { XMLParser } from 'fast-xml-parser';
import type { Discovery, Security, ServerSettings } from '../../src/lib/api';

export interface DiscoveryDeps {
	/** Body of a successful HTTPS GET, or null on any failure. */
	fetchText(url: string): Promise<string | null>;
	resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
	resolveSrv(name: string): Promise<{ name: string; port: number; priority: number }[]>;
}

export async function discoverSettings(email: string, deps: DiscoveryDeps): Promise<Discovery> {
	const domain = email.split('@')[1].toLowerCase();
	const encoded = encodeURIComponent(email);

	for (const url of [
		`https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encoded}`,
		`https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=${encoded}`
	]) {
		const settings = parseAutoconfig(await deps.fetchText(url), email);
		if (settings) return { settings, source: 'autoconfig' };
	}

	for (const lookup of [domain, await mxDomain(domain, deps)]) {
		if (!lookup) continue;
		const xml = await deps.fetchText(`https://autoconfig.thunderbird.net/v1.1/${lookup}`);
		const settings = parseAutoconfig(xml, email);
		if (settings) return { settings, source: 'ispdb' };
	}

	const srv = await fromSrv(domain, email, deps);
	if (srv) return { settings: srv, source: 'srv' };

	return {
		settings: {
			imapHost: `imap.${domain}`,
			imapPort: 993,
			imapSecurity: 'tls',
			smtpHost: `smtp.${domain}`,
			smtpPort: 465,
			smtpSecurity: 'tls',
			username: email
		},
		source: 'guess'
	};
}

/** The registrable part of the best MX host, e.g. google.com for aspmx.l.google.com. */
async function mxDomain(domain: string, deps: DiscoveryDeps): Promise<string | null> {
	const records = await deps.resolveMx(domain).catch(() => []);
	const best = records.sort((a, b) => a.priority - b.priority)[0];
	if (!best) return null;
	const mx = best.exchange.toLowerCase().replace(/\.$/, '').split('.').slice(-2).join('.');
	return mx && mx !== domain ? mx : null;
}

async function fromSrv(
	domain: string,
	email: string,
	deps: DiscoveryDeps
): Promise<ServerSettings | null> {
	async function first(names: [string, Security][]) {
		for (const [name, security] of names) {
			const records = await deps.resolveSrv(`${name}.${domain}`).catch(() => []);
			// "." as target means the service is explicitly not offered.
			const best = records
				.filter((r) => r.name && r.name !== '.')
				.sort((a, b) => a.priority - b.priority)[0];
			if (best) return { host: best.name.replace(/\.$/, ''), port: best.port, security };
		}
		return null;
	}
	const imap = await first([
		['_imaps._tcp', 'tls'],
		['_imap._tcp', 'starttls']
	]);
	const smtp = await first([
		['_submissions._tcp', 'tls'],
		['_submission._tcp', 'starttls']
	]);
	if (!imap || !smtp) return null;
	return {
		imapHost: imap.host,
		imapPort: imap.port,
		imapSecurity: imap.security,
		smtpHost: smtp.host,
		smtpPort: smtp.port,
		smtpSecurity: smtp.security,
		username: email
	};
}

interface XmlServer {
	'@_type'?: string;
	hostname?: string;
	port?: number | string;
	socketType?: string;
	username?: string;
}

const parser = new XMLParser({
	ignoreAttributes: false,
	isArray: (name) => name.endsWith('Server')
});

/** Reads a Thunderbird config-v1.1.xml; null if it has no usable IMAP and SMTP server. */
export function parseAutoconfig(xml: string | null, email: string): ServerSettings | null {
	if (!xml) return null;
	let provider: { incomingServer?: XmlServer[]; outgoingServer?: XmlServer[] } | undefined;
	try {
		provider = parser.parse(xml)?.clientConfig?.emailProvider;
	} catch {
		return null;
	}
	const imap = pick(provider?.incomingServer, 'imap');
	const smtp = pick(provider?.outgoingServer, 'smtp');
	if (!imap || !smtp) return null;

	const [localPart, domain] = email.split('@');
	const fill = (value: string | undefined) =>
		(value ?? '%EMAILADDRESS%')
			.replaceAll('%EMAILADDRESS%', email)
			.replaceAll('%EMAILLOCALPART%', localPart)
			.replaceAll('%EMAILDOMAIN%', domain);

	return {
		imapHost: fill(imap.hostname),
		imapPort: Number(imap.port),
		imapSecurity: security(imap.socketType),
		smtpHost: fill(smtp.hostname),
		smtpPort: Number(smtp.port),
		smtpSecurity: security(smtp.socketType),
		username: fill(imap.username)
	};
}

/** The server of that type with the strongest encryption. */
function pick(servers: XmlServer[] | undefined, type: string) {
	const rank = { tls: 0, starttls: 1, none: 2 };
	return (servers ?? [])
		.filter((s) => s['@_type'] === type && s.hostname && Number(s.port) > 0)
		.sort((a, b) => rank[security(a.socketType)] - rank[security(b.socketType)])[0];
}

function security(socketType: string | undefined): Security {
	if (socketType === 'SSL') return 'tls';
	if (socketType === 'STARTTLS') return 'starttls';
	return 'none';
}
