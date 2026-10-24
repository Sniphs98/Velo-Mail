import { velo, type Account } from '#lib/api.ts';

/** The configured accounts, shared by the sidebar and the dialogs. */
class Accounts {
	list = $state<Account[]>([]);

	async load() {
		this.list = (await velo()?.accounts.list()) ?? [];
	}

	async remove(id: number) {
		await velo()?.accounts.remove(id);
		await this.load();
	}
}

export const accounts = new Accounts();
