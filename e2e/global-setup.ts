import electron from 'electron';
import greenMailSetup from '../scripts/greenmail-setup.mjs';

/**
 * Runs once before the workers start. Importing electron resolves its binary,
 * downloading it on first use (Electron no longer does that on install);
 * workers launching the app while another one still unpacks it fail with
 * ETXTBSY. Then starts GreenMail and returns its teardown.
 */
export default function globalSetup() {
	if (!electron) throw new Error('Electron binary not found');
	return greenMailSetup();
}
