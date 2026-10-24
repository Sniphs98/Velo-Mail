import { ipcErrorMessage } from '#lib/account-messages.ts';
import { velo, type UpdateInfo } from '#lib/api.ts';

/** A newer release and how far installing it got. */
class Update {
	available = $state<UpdateInfo | null>(null);
	phase = $state<'idle' | 'downloading' | 'ready' | 'failed'>('idle');
	percent = $state(0);
	error = $state<string>();
	/** "Später" hides the notice until the next start. */
	dismissed = $state(false);

	/** Looks for a newer release; returns it, or null when up to date. */
	async check() {
		const found = (await velo()?.app.checkUpdate()) ?? null;
		this.available = found;
		this.dismissed = false;
		return found;
	}

	async install() {
		const api = velo();
		if (!api) return;
		this.phase = 'downloading';
		this.percent = 0;
		this.error = undefined;
		const off = api.app.onUpdateProgress((percent) => (this.percent = percent));
		try {
			await api.app.installUpdate();
			this.phase = 'ready';
		} catch (error) {
			this.phase = 'failed';
			this.error = ipcErrorMessage(error);
		} finally {
			off();
		}
	}

	restart() {
		return velo()?.app.restartToUpdate();
	}
}

export const update = new Update();
