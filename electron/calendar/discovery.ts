// Where to look for a CalDAV server, given an address. Known providers first,
// then the domain itself (tsdav follows /.well-known/caldav from there).

const known: Record<string, string> = {
	'icloud.com': 'https://caldav.icloud.com',
	'me.com': 'https://caldav.icloud.com',
	'mac.com': 'https://caldav.icloud.com',
	'yahoo.com': 'https://caldav.calendar.yahoo.com',
	'yahoo.de': 'https://caldav.calendar.yahoo.com',
	'ymail.com': 'https://caldav.calendar.yahoo.com',
	'gmx.de': 'https://caldav.gmx.net',
	'gmx.net': 'https://caldav.gmx.net',
	'gmx.at': 'https://caldav.gmx.net',
	'gmx.ch': 'https://caldav.gmx.net',
	'web.de': 'https://caldav.web.de',
	'posteo.de': 'https://posteo.de:8443',
	'mailbox.org': 'https://dav.mailbox.org',
	'fastmail.com': 'https://caldav.fastmail.com',
	't-online.de': 'https://caldav.t-online.de'
};

/** Google and Microsoft only allow their calendars with OAuth2 (not built yet). */
export function needsOAuth(email: string) {
	const domain = email.split('@')[1]?.toLowerCase() ?? '';
	return /^(gmail\.com|googlemail\.com|outlook\.(com|de)|hotmail\.(com|de)|live\.(com|de)|msn\.com)$/.test(
		domain
	);
}

export function serverCandidates(email: string): string[] {
	const domain = email.split('@')[1]?.toLowerCase();
	if (!domain) return [];
	const urls = [
		known[domain],
		`https://${domain}`,
		`https://caldav.${domain}`,
		`https://dav.${domain}`
	];
	return [...new Set(urls.filter((url): url is string => !!url))];
}
