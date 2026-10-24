import { velo, type Account, type AccountChanges } from '#lib/api.ts';

/** The configured accounts, shared by the sidebar and the dialogs. */
class Accounts {
	list = $state<Account[]>([]);

	async load() {
		this.list = (await velo()?.accounts.list()) ?? [];
	}

	async update(id: number, changes: AccountChanges) {
		const updated = await velo()?.accounts.update(id, changes);
		if (updated) this.list = this.list.map((a) => (a.id === id ? updated : a));
	}

	async remove(id: number) {
		await velo()?.accounts.remove(id);
		await this.load();
	}
}

export const accounts = new Accounts();
