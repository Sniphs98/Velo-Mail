// GreenMail (https://greenmail-mail-test.github.io/greenmail/), a real IMAP
// and SMTP server for the integration and E2E tests. Runs the standalone jar
// from Maven Central with Java, so no Docker is needed; the jar is cached in
// .cache/.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const version = '2.1.14';
const jar = path.resolve('.cache', `greenmail-standalone-${version}.jar`);
const url = `https://repo1.maven.org/maven2/com/icegreen/greenmail-standalone/${version}/greenmail-standalone-${version}.jar`;

/** Plain ports of GreenMail's test setup (greenmail.setup.test.*). */
export const greenMail = {
	host: '127.0.0.1',
	imapPort: 3143,
	smtpPort: 3025,
	/** Logs in with the full address. */
	user: { email: 'anna@beispiel.test', password: 'geheim' }
};

function download() {
	if (existsSync(jar)) return;
	mkdirSync(path.dirname(jar), { recursive: true });
	// curl honours the proxy settings of CI and dev containers.
	execFileSync('curl', ['-fsSL', '--retry', '3', '-o', jar, url], { stdio: 'inherit' });
}

/** @param {number} port */
function portOpen(port) {
	return new Promise((resolve) => {
		const socket = net.connect(port, greenMail.host);
		socket.once('connect', () => {
			socket.destroy();
			resolve(true);
		});
		socket.once('error', () => resolve(false));
	});
}

/** Starts GreenMail and resolves once IMAP and SMTP accept connections. */
export async function startGreenMail() {
	download();
	const { user } = greenMail;
	const server = spawn(
		'java',
		[
			'-Dgreenmail.setup.test.imap',
			'-Dgreenmail.setup.test.smtp',
			`-Dgreenmail.hostname=${greenMail.host}`,
			`-Dgreenmail.users=${user.email.split('@')[0]}:${user.password}@${user.email.split('@')[1]}`,
			// Only the users above may log in (GreenMail creates unknown ones otherwise).
			'-Dgreenmail.users.login=email',
			'-jar',
			jar
		],
		{ stdio: ['ignore', 'ignore', 'inherit'] }
	);

	const exited = new Promise((_, reject) =>
		server.once('exit', (code) => reject(new Error(`GreenMail exited with ${code}`)))
	);
	const ready = (async () => {
		for (let i = 0; i < 120; i++) {
			if ((await portOpen(greenMail.imapPort)) && (await portOpen(greenMail.smtpPort))) return;
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error('GreenMail did not start within 30 seconds');
	})();

	try {
		await Promise.race([ready, exited]);
	} catch (error) {
		server.kill();
		throw error;
	}
	return () => {
		server.kill();
	};
}

/**
 * Delivers a mail to the test user through GreenMail's SMTP server.
 * @param {{ subject: string, from?: string, text?: string, html?: string,
 *   attachments?: import('nodemailer/lib/mailer').Attachment[],
 *   messageId?: string, inReplyTo?: string, references?: string[] }} mail
 */
export async function sendTestMail({
	subject,
	from = 'Jonas Weber <jonas@beispiel.test>',
	text = 'Hallo!',
	html,
	attachments,
	messageId,
	inReplyTo,
	references
}) {
	const { default: nodemailer } = await import('nodemailer');
	const transport = nodemailer.createTransport({
		host: greenMail.host,
		port: greenMail.smtpPort,
		secure: false,
		ignoreTLS: true,
		auth: { user: greenMail.user.email, pass: greenMail.user.password }
	});
	try {
		await transport.sendMail({
			from,
			to: greenMail.user.email,
			subject,
			text,
			html,
			attachments,
			messageId,
			inReplyTo,
			references
		});
	} finally {
		transport.close();
	}
}

/**
 * Runs `use` with a logged-in IMAP client for the test user, e.g. to empty the
 * inbox or change flags behind the app's back.
 * @template T
 * @param {(client: import('imapflow').ImapFlow) => Promise<T>} use
 */
export async function withImap(use) {
	const { ImapFlow } = await import('imapflow');
	const client = new ImapFlow({
		host: greenMail.host,
		port: greenMail.imapPort,
		secure: false,
		doSTARTTLS: false,
		auth: { user: greenMail.user.email, pass: greenMail.user.password },
		logger: false
	});
	await client.connect();
	try {
		return await use(client);
	} finally {
		await client.logout();
	}
}
