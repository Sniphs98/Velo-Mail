/** The settings page to show; see components/settings/pages.ts. */
export type SettingsPage =
	| 'general'
	| 'appearance'
	| 'notifications'
	| 'privacy'
	| 'accounts'
	| 'inbox'
	| 'calendars'
	| 'about';

/** The app's dialogs, so that any part of the page can open them at the right place. */
class Dialogs {
	settings = $state(false);
	settingsPage = $state<SettingsPage>('general');
	/** The account shown on the accounts page. */
	settingsAccount = $state<number>();
	addAccount = $state(false);
	addCalendar = $state(false);
	tidy = $state(false);
	/** Tidying up newsletters in these accounts (empty: all). */
	tidyAccounts = $state<number[]>([]);

	/** Opens the settings, on the page last seen or the one given. */
	showSettings(page?: SettingsPage, accountId?: number) {
		if (page) this.settingsPage = page;
		if (accountId !== undefined) this.settingsAccount = accountId;
		this.settings = true;
	}

	showTidy(accountIds: number[] = []) {
		this.tidyAccounts = accountIds;
		this.tidy = true;
	}
}

export const dialogs = new Dialogs();
