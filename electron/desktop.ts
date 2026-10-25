// What the app does outside its window: light or dark look, the unread badge
// on the app icon, the tray icon, notifications for new mail and reminders.
import { m } from '../src/lib/paraglide/messages.js';
import { app, BrowserWindow, Menu, nativeImage, nativeTheme, Notification, Tray } from 'electron';
import path from 'node:path';
import type { Settings } from '../src/lib/api';
import { dateFormat, timeFormat } from '../src/lib/language';
import type { Reminder } from './calendar/reminders';
import type { NewMail } from './mail/manager';

export interface DesktopDeps {
	/** Folder with the tray icons (resources/tray). */
	iconDir: string;
	/** Shows the main window, creating it if needed. */
	show(): BrowserWindow;
	/** Shows a message in the window. */
	open(messageId: number): void;
	compose(): void;
	/** Shows the calendar on a day (local midnight). */
	showDay(day: number): void;
}

/** "Anna Becker" or the address; the text a notification starts with. */
export function senderOf(mail: NewMail) {
	return mail.fromName || mail.fromAddress || m.sender_unknown();
}

/** One notification per message, or a summary when many arrive at once. */
export function notificationsFor(accountName: string, mails: NewMail[]) {
	if (mails.length > 3) {
		const senders = [...new Set(mails.map(senderOf))];
		return [
			{
				title: m.notify_new_mails({ count: mails.length, account: accountName }),
				body: senders.slice(0, 3).join(', ') + (senders.length > 3 ? ' …' : ''),
				messageId: undefined
			}
		];
	}
	return mails.map((mail) => ({
		title: senderOf(mail),
		body: mail.subject || m.no_subject(),
		messageId: mail.id
	}));
}

const clock = timeFormat;
const date = () => dateFormat({ weekday: 'short', day: 'numeric', month: 'short' });

function midnight(time: Date) {
	return new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime();
}

/** "Heute 15:00–16:00 · Küche", "Morgen (ganztägig)", "Do., 5. Nov. 09:00–10:00". */
export function reminderText(reminder: Reminder, now = new Date()) {
	const days = Math.round((midnight(reminder.start) - midnight(now)) / 86_400_000);
	const day =
		days === 0
			? m.today()
			: days === 1
				? m.tomorrow()
				: days === -1
					? m.yesterday()
					: date().format(reminder.start);
	const when = reminder.allDay
		? m.event_all_day({ day })
		: `${day} ${clock().format(reminder.start)}–${clock().format(reminder.end)}`;
	return {
		title: reminder.summary || m.event(),
		body: reminder.location ? `${when} · ${reminder.location}` : when
	};
}

export class Desktop {
	private settings?: Settings;
	private tray?: Tray;
	private unread = 0;
	/** Shown notifications; kept so they are not garbage-collected before a click. */
	private shown = new Set<Notification>();

	constructor(private readonly deps: DesktopDeps) {}

	apply(settings: Settings) {
		this.settings = settings;
		nativeTheme.themeSource = settings.theme;
		if (settings.tray && !this.tray) this.createTray();
		if (!settings.tray && this.tray) {
			this.tray.destroy();
			this.tray = undefined;
		}
		// The language may have changed.
		this.tray?.setToolTip(this.tooltip());
		this.tray?.setContextMenu(this.menu());
	}

	/** Closing the window hides it, the app keeps syncing in the tray. */
	get keepsRunning() {
		return !!this.tray;
	}

	setUnread(count: number) {
		if (count === this.unread) return;
		this.unread = count;
		// macOS dock and Unity/KDE launchers; a no-op elsewhere.
		app.setBadgeCount(count);
		this.tray?.setToolTip(this.tooltip());
	}

	notify(accountName: string, mails: NewMail[]) {
		if (!this.settings?.notifications || !Notification.isSupported()) return;
		// The user is looking at the app already.
		if (BrowserWindow.getAllWindows().some((window) => window.isFocused())) return;
		for (const { title, body, messageId } of notificationsFor(accountName, mails)) {
			const notification = new Notification({ title, body, silent: false });
			notification.on('click', () => {
				this.deps.show();
				if (messageId !== undefined) this.deps.open(messageId);
			});
			notification.on('close', () => this.shown.delete(notification));
			this.shown.add(notification);
			notification.show();
		}
	}

	/** Shown even while the window has focus: a reminder is easy to miss otherwise. */
	remind(reminder: Reminder) {
		if (!Notification.isSupported()) return;
		const { title, body } = reminderText(reminder);
		const notification = new Notification({ title, body, silent: false });
		notification.on('click', () => {
			this.deps.show();
			this.deps.showDay(midnight(reminder.start));
		});
		notification.on('close', () => this.shown.delete(notification));
		this.shown.add(notification);
		notification.show();
	}

	private tooltip() {
		if (this.unread === 0) return 'Velo Mail';
		return m.tray_unread({ count: this.unread });
	}

	private createTray() {
		const icon = nativeImage.createFromPath(
			path.join(this.deps.iconDir, process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')
		);
		this.tray = new Tray(icon);
		this.tray.on('click', () => this.deps.show());
	}

	private menu() {
		return Menu.buildFromTemplate([
			{ label: m.tray_open(), click: () => this.deps.show() },
			{ label: m.compose_new(), click: () => this.deps.compose() },
			{ type: 'separator' },
			{ label: m.tray_quit(), click: () => app.quit() }
		]);
	}
}
