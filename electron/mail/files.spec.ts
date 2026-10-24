import { describe, expect, it } from 'vitest';
import { isRunnable, safeFilename } from './files';

describe('safeFilename', () => {
	it('keeps the name but never a path', () => {
		expect(safeFilename('Angebot 2026.pdf', 'application/pdf')).toBe('Angebot 2026.pdf');
		expect(safeFilename('../../.bashrc', 'text/plain')).toBe('bashrc');
		expect(safeFilename('..\\..\\Windows\\evil.txt', 'text/plain')).toBe('_.._Windows_evil.txt');
		expect(safeFilename('a:b*c?.txt', 'text/plain')).toBe('a_b_c_.txt');
		expect(safeFilename(null, 'image/png')).toBe('anhang.png');
		expect(safeFilename('', 'application/octet-stream')).toBe('anhang.octetstream');
	});
});

describe('isRunnable', () => {
	it('flags types that would run code when opened', () => {
		expect(isRunnable('rechnung.pdf.exe')).toBe(true);
		expect(isRunnable('setup.MSI')).toBe(true);
		expect(isRunnable('script.js')).toBe(true);
		expect(isRunnable('foto.jpg')).toBe(false);
		expect(isRunnable('Angebot.pdf')).toBe(false);
	});
});
