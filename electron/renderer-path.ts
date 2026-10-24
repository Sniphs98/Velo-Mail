import path from 'node:path';

/**
 * The file in the renderer build that answers a request to the app:// scheme.
 * Anything that is not a file inside the build folder (client-side routes,
 * attempts to climb out with `..`) gets the SPA shell, index.html.
 */
export function rendererPath(
	rendererDir: string,
	url: string,
	isFile: (file: string) => boolean
): string {
	const fallback = path.join(rendererDir, 'index.html');
	let pathname: string;
	try {
		pathname = decodeURIComponent(new URL(url).pathname);
	} catch {
		return fallback;
	}
	const file = path.join(rendererDir, pathname);
	const inside = file.startsWith(rendererDir + path.sep);
	return inside && isFile(file) ? file : fallback;
}
