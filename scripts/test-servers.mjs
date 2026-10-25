// globalSetup for Vitest's integration project and Playwright: starts the
// test servers once for the run (GreenMail for mail, Radicale for calendars)
// and returns the teardown.
import { startGreenMail } from './greenmail.mjs';
import { startRadicale } from './radicale.mjs';

export default async function setup() {
	const stops = await Promise.all([startGreenMail(), startRadicale()]);
	return () => {
		for (const stop of stops) stop();
	};
}
