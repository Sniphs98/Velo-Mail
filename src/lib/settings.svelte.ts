import { velo, type Settings } from '#lib/api.ts';

/** The app settings, loaded once and saved on every change. */
class AppSettings {
	value = $state<Settings>({
		theme: 'system',
		notifications: true,
		tray: false,
		avatars: true
	});

	async load() {
		const loaded = await velo()?.settings.get();
		if (loaded) this.value = loaded;
	}

	async set(changes: Partial<Settings>) {
		// Shown right away; the saved result follows.
		this.value = { ...this.value, ...changes };
		const saved = await velo()?.settings.set(changes);
		if (saved) this.value = saved;
	}
}

export const settings = new AppSettings();
