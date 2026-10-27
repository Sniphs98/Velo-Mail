// The pages of the settings, in the order of the navigation. A new page is a
// component in pages/ and an entry here; navigation and search read this list.
import { m } from '#lib/paraglide/messages.js';
import { Bell, Calendar, Inbox, Info, Palette, Settings2, Shield, UserRound } from '@lucide/svelte';
import type { Component } from 'svelte';
import type { SettingsPage } from '#lib/dialogs.svelte.ts';
import About from './pages/about.svelte';
import Accounts from './pages/accounts.svelte';
import Appearance from './pages/appearance.svelte';
import Calendars from './pages/calendars.svelte';
import General from './pages/general.svelte';
import InboxPage from './pages/inbox.svelte';
import Notifications from './pages/notifications.svelte';
import Privacy from './pages/privacy.svelte';

export interface SettingsPageInfo {
	id: SettingsPage;
	group: () => string;
	label: () => string;
	icon: typeof Bell;
	component: Component;
	/** What the search finds the page by, besides its label. */
	keywords: () => string[];
}

export const pages: SettingsPageInfo[] = [
	{
		id: 'general',
		group: m.settings_group_app,
		label: m.settings_general,
		icon: Settings2,
		component: General,
		keywords: () => [m.settings_language(), m.settings_tray()]
	},
	{
		id: 'appearance',
		group: m.settings_group_app,
		label: m.settings_appearance,
		icon: Palette,
		component: Appearance,
		keywords: () => [m.settings_theme(), m.theme_dark(), m.theme_light()]
	},
	{
		id: 'notifications',
		group: m.settings_group_app,
		label: m.settings_notifications,
		icon: Bell,
		component: Notifications,
		keywords: () => [m.settings_reminders(), m.account_notify_important()]
	},
	{
		id: 'privacy',
		group: m.settings_group_app,
		label: m.settings_privacy,
		icon: Shield,
		component: Privacy,
		keywords: () => [m.settings_avatars(), m.settings_trusted()]
	},
	{
		id: 'accounts',
		group: m.settings_group_mail,
		label: m.settings_accounts,
		icon: UserRound,
		component: Accounts,
		keywords: () => [
			m.account_signature(),
			m.account_color(),
			m.account_name(),
			m.account_add(),
			m.account_remove()
		]
	},
	{
		id: 'inbox',
		group: m.settings_group_mail,
		label: m.settings_inbox,
		icon: Inbox,
		component: InboxPage,
		keywords: () => [m.settings_sender_rules(), m.tidy_title()]
	},
	{
		id: 'calendars',
		group: m.settings_group_calendar,
		label: m.settings_calendars,
		icon: Calendar,
		component: Calendars,
		keywords: () => [m.calendar_add(), m.calendar_remove()]
	},
	{
		id: 'about',
		group: m.settings_group_system,
		label: m.settings_about,
		icon: Info,
		component: About,
		keywords: () => [m.settings_updates(), m.settings_version()]
	}
];

/** The pages whose label, group or keywords contain the text. */
export function findPages(text: string) {
	const needle = text.trim().toLocaleLowerCase();
	if (!needle) return pages;
	return pages.filter((page) =>
		[page.label(), page.group(), ...page.keywords()].some((words) =>
			words.toLocaleLowerCase().includes(needle)
		)
	);
}
