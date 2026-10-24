// What the app does outside its window: light or dark look, the unread badge
// on the app icon, the tray icon and notifications for new mail.
import { app, BrowserWindow, Menu, nativeImage, nativeTheme, Notification, Tray } from 'electron';
import path from 'node:path';
import type { Settings } from '../src/lib/api';
import type { NewMail } from './mail/manager';

export interface DesktopDeps {
	/** Folder with the tray icons (resources/tray). */
	iconDir: string;
	/** Shows the main window, creating it if needed. */
	show(): BrowserWindow;
	/** Shows a message in the window. */
	open(messageId: number): void;
	compose(): void;
}

/** "Anna Becker" or the address; the text a notification starts with. */
export function senderOf(mail: NewMail) {
	return mail.fromName || mail.fromAddress || 'Unbekannter Absender';
}

/** One notification per message, or a summary when many arrive at once. */
export function notificationsFor(accountName: string, mails: NewMail[]) {
	if (mails.length > 3) {
		const senders = [...new Set(mails.map(senderOf))];
		return [
			{
				title: `${mails.length} neue Nachrichten · ${accountName}`,
				body: senders.slice(0, 3).join(', ') + (senders.length > 3 ? ' …' : ''),
				messageId: undefined
			}
		];
	}
	return mails.map((mail) => ({
		title: senderOf(mail),
		body: mail.subject || '(kein Betreff)',
		messageId: mail.id
	}));
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

	private tooltip() {
		if (this.unread === 0) return 'Velo Mail';
		return `Velo Mail – ${this.unread} ungelesen`;
	}

	private createTray() {
		const icon = nativeImage.createFromPath(
			path.join(this.deps.iconDir, process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')
		);
		this.tray = new Tray(icon);
		this.tray.setToolTip(this.tooltip());
		this.tray.setContextMenu(
			Menu.buildFromTemplate([
				{ label: 'Velo Mail öffnen', click: () => this.deps.show() },
				{ label: 'Neue Nachricht', click: () => this.deps.compose() },
				{ type: 'separator' },
				{ label: 'Beenden', click: () => app.quit() }
			])
		);
		this.tray.on('click', () => this.deps.show());
	}
}
