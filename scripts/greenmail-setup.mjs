// globalSetup for Vitest's integration project and Playwright: starts
// GreenMail once for the run and returns the teardown.
import { startGreenMail } from './greenmail.mjs';

export default function setup() {
	return startGreenMail();
}
