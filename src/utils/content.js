/**
 * Dousic — Content item helpers
 *
 * The backend returns content items in a few shapes across endpoints
 * (/content/home, /content/browse, /content/search, /content/live, …) and is
 * not perfectly consistent about field names. Rather than repeat the same
 * tolerant field-resolution in every rail, grid and detail view, normalize it
 * once here. This keeps the card-rendering call sites a single line and means
 * a new field-name variant only has to be handled in one place.
 */

import Strings from '../i18n/strings';

/**
 * Resolve the best artwork URL for a content item, tolerating the various
 * field names the API uses for the same thing.
 * @param {object} item
 * @returns {string|undefined}
 */
export const resolveThumbnail = (item = {}) =>
	item.thumbnail_url || item.thumbnailUrl || item.cover_url || item.image_url ||
	item.image || item.poster_url || item.backdrop_url;

/**
 * Whether an item represents a live stream (snake_case or camelCase).
 * @param {object} item
 * @returns {boolean}
 */
export const isLiveItem = (item = {}) => Boolean(item.is_live ?? item.isLive);

/**
 * Resolve a creator display string from the several shapes the API returns
 * (object with handle/display_name, or a bare string).
 * @param {object} item
 * @returns {string|undefined}
 */
export const resolveCreator = (item = {}) => {
	const c = item.creator;
	if (!c) return c;
	return typeof c === 'string' ? c : (c.handle || c.display_name);
};

/**
 * True when an item should be presented as free — explicitly flagged free, or
 * priced at zero / no price set. `price` may be a number or numeric string.
 * @param {number|string} price
 * @param {boolean} isFree
 * @returns {boolean}
 */
export const isFreePrice = (price, isFree) => {
	const amount = typeof price === 'string' ? parseFloat(price) : price;
	return Boolean(isFree) || amount == null || Number.isNaN(amount) || amount <= 0;
};

/**
 * Localized marketplace price label: "$X.XX" for paid items, "Free" otherwise.
 * Mirrors dousic.media/market.
 * @param {number|string} price
 * @param {boolean} isFree
 * @returns {string}
 */
export const formatPriceLabel = (price, isFree) => {
	if (isFreePrice(price, isFree)) return Strings.free();
	const amount = typeof price === 'string' ? parseFloat(price) : price;
	return `$${amount.toFixed(2)}`;
};

/**
 * Map a raw API content item to the prop set ContentCard expects. Spread the
 * result straight onto <ContentCard {...toCardProps(item)} onSelect={…} />.
 * @param {object} item
 * @returns {object}
 */
export const toCardProps = (item = {}) => ({
	id: item.id,
	title: item.title,
	thumbnailUrl: resolveThumbnail(item),
	subtitle: item.subtitle,
	creator: resolveCreator(item),
	isLive: isLiveItem(item),
	viewerCount: item.viewer_count ?? item.viewerCount,
	duration: item.duration,
	type: item.type || item.media_type,
	price: item.price ?? item.amount ?? item.cost,
	isFree: item.is_free ?? item.isFree ?? item.free
});

/**
 * Normalize a list payload to an array, whatever envelope the backend wraps it
 * in (bare array, or {items|featured|hero|results|data}).
 * @param {*} payload
 * @returns {Array}
 */
export const asItems = (payload) =>
	Array.isArray(payload) ?
		payload :
		(payload?.items || payload?.featured || payload?.hero || payload?.results || payload?.data || []);
