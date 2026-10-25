// The empty search and whether a search narrows anything; shared by the main
// process and the page.
import type { SearchFilters, SearchQuery } from './api';

export const noFilters: SearchFilters = {
	accounts: [],
	from: '',
	since: null,
	until: null,
	attachments: false,
	unread: false
};

/** How many filters are set (not counting the words). */
export function activeFilters(filters: SearchFilters): number {
	return (
		(filters.accounts.length > 0 ? 1 : 0) +
		(filters.from.trim() ? 1 : 0) +
		(filters.since !== null || filters.until !== null ? 1 : 0) +
		(filters.attachments ? 1 : 0) +
		(filters.unread ? 1 : 0)
	);
}

/** A search lists something only once it has words or a filter. */
export function isSearching(query: SearchQuery): boolean {
	return query.text.trim() !== '' || activeFilters(query) > 0;
}
