// Dark mode follows prefers-color-scheme. In Electron that reflects the theme
// chosen in the settings (nativeTheme.themeSource), elsewhere the system's.

/** Keeps the `dark` class on <html> in step; returns the cleanup. */
export function followColorScheme(root = document.documentElement) {
	const query = window.matchMedia('(prefers-color-scheme: dark)');
	const apply = () => root.classList.toggle('dark', query.matches);
	apply();
	query.addEventListener('change', apply);
	return () => query.removeEventListener('change', apply);
}
