// Radicale (https://radicale.org), a real CalDAV server for the integration
// tests of the calendar, like GreenMail is for mail. Installed with pip into a
// virtual environment in .cache/ on first use; each start gets empty storage.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const version = '3.8.3';
const venv = path.resolve('.cache', `radicale-${version}`);
const python = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

export const radicale = {
	url: 'http://127.0.0.1:5232',
	user: { username: 'anna', password: 'geheim' }
};

function install() {
	if (existsSync(python)) return;
	execFileSync('python3', ['-m', 'venv', venv], { stdio: 'inherit' });
	execFileSync(python, ['-m', 'pip', 'install', '--quiet', `radicale==${version}`], {
		stdio: 'inherit'
	});
}

/** @param {number} port */
function portOpen(port) {
	return new Promise((resolve) => {
		const socket = net.connect(port, '127.0.0.1');
		socket.once('connect', () => {
			socket.destroy();
			resolve(true);
		});
		socket.once('error', () => resolve(false));
	});
}

/** Starts Radicale with one user and resolves once it accepts connections. */
export async function startRadicale() {
	install();
	const dir = mkdtempSync(path.join(tmpdir(), 'velo-radicale-'));
	const users = path.join(dir, 'users');
	writeFileSync(users, `${radicale.user.username}:${radicale.user.password}\n`);
	const config = path.join(dir, 'config');
	writeFileSync(
		config,
		[
			'[server]',
			'hosts = 127.0.0.1:5232',
			'[auth]',
			'type = htpasswd',
			`htpasswd_filename = ${users}`,
			'htpasswd_encryption = plain',
			'[storage]',
			`filesystem_folder = ${path.join(dir, 'collections')}`,
			'[logging]',
			'level = warning'
		].join('\n')
	);
	const server = spawn(python, ['-m', 'radicale', '--config', config], {
		stdio: ['ignore', 'ignore', 'inherit']
	});
	const exited = new Promise((_, reject) =>
		server.once('exit', (code) => reject(new Error(`Radicale exited with ${code}`)))
	);
	const ready = (async () => {
		for (let i = 0; i < 80; i++) {
			if (await portOpen(5232)) return;
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error('Radicale did not start within 20 seconds');
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
