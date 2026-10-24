import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { canOpen, markFromInternet, safeFilename } from './files';

describe('safeFilename', () => {
	it('keeps the name but never a path', () => {
		expect(safeFilename('Angebot 2026.pdf', 'application/pdf')).toBe('Angebot 2026.pdf');
		expect(safeFilename('../../.bashrc', 'text/plain')).toBe('bashrc');
		expect(safeFilename('..\\..\\Windows\\evil.txt', 'text/plain')).toBe('_.._Windows_evil.txt');
		expect(safeFilename('a:b*c?.txt', 'text/plain')).toBe('a_b_c_.txt');
		expect(safeFilename(null, 'image/png')).toBe('anhang.png');
		expect(safeFilename('', 'application/octet-stream')).toBe('anhang.octetstream');
	});

	it('drops what Windows would drop or what disguises the type', () => {
		expect(safeFilename('rechnung.exe.', 'application/pdf')).toBe('rechnung.exe');
		expect(safeFilename('rechnung.exe . ', 'application/pdf')).toBe('rechnung.exe');
		expect(safeFilename('rechnung‮fdp.exe', 'application/pdf')).toBe('rechnungfdp.exe');
		expect(safeFilename('CON.txt', 'text/plain')).toBe('_CON.txt');
		expect(safeFilename('...', 'text/plain')).toBe('anhang.plain');
	});
});

describe('canOpen', () => {
	it('opens documents and media, nothing that could run', () => {
		expect(canOpen('Angebot.pdf')).toBe(true);
		expect(canOpen('foto.JPG')).toBe(true);
		expect(canOpen('Tabelle.xlsx')).toBe(true);
		for (const name of [
			'rechnung.pdf.exe',
			'setup.MSI',
			'script.js',
			'link.url',
			'hilfe.chm',
			'seite.html',
			'bild.svg',
			'archiv.zip',
			'start.py',
			'konsole.msc',
			'ohne-endung'
		]) {
			expect(canOpen(safeFilename(name, 'application/octet-stream')), name).toBe(false);
		}
		expect(canOpen(safeFilename('rechnung.exe.', 'application/pdf'))).toBe(false);
	});
});

describe('markFromInternet', () => {
	it('writes the zone of the internet on Windows', async () => {
		const file = path.join(mkdtempSync(path.join(tmpdir(), 'velo-')), 'a.pdf');
		await markFromInternet(file, 'win32');
		// On Linux the stream name becomes part of an ordinary file name.
		expect(readFileSync(`${file}:Zone.Identifier`, 'utf8')).toBe('[ZoneTransfer]\r\nZoneId=3\r\n');
	});

	it('sets the quarantine flag on macOS and never fails', async () => {
		const run = vi.fn(async () => {});
		await markFromInternet('/tmp/a.pdf', 'darwin', run);
		expect(run).toHaveBeenCalledWith('xattr', [
			'-w',
			'com.apple.quarantine',
			expect.stringMatching(/^0081;[0-9a-f]+;Velo Mail;$/),
			'/tmp/a.pdf'
		]);
		await expect(
			markFromInternet('/tmp/a.pdf', 'darwin', async () => {
				throw new Error('kein xattr');
			})
		).resolves.toBeUndefined();
	});
});
