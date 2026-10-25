import { velo, type SenderPicture } from '#lib/api.ts';

/** Sender pictures, asked from the main process once per address. */
class Pictures {
	/** Bumped when the cache is cleared, so shown avatars ask again. */
	version = $state(0);
	private cache = new Map<string, Promise<SenderPicture | null>>();

	/** The name tells a provider's own mail ("Yahoo") from its users' (avatars.ts). */
	get(address: string, name: string | null = null): Promise<SenderPicture | null> {
		const key = address.toLowerCase();
		let picture = this.cache.get(key);
		if (!picture) {
			picture =
				velo()
					?.mail.avatar(key, name)
					.catch(() => null) ?? Promise.resolve(null);
			this.cache.set(key, picture);
		}
		return picture;
	}

	clear() {
		this.cache.clear();
		this.version++;
	}
}

export const pictures = new Pictures();
