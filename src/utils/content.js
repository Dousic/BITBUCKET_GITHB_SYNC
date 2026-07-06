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

// Deterministic gradient for an avatar/media placeholder, derived from a
// string so the same creator always gets the same colors (no Math.random,
// which is unavailable in some sandboxes and would flicker between renders).
const GRADIENTS = [
	['#DD1C78', '#D91CDD'],
	['#D91CDD', '#DD1C78'],
	['#FF8000', '#FFD200'],
	['#0FBF6F', '#DD1C78'],
	['#D91CDD', '#7b2ff7'],
	['#DD1C78', '#a01060']
];
export const gradientFor = (seed = '') => {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
	const [a, b] = GRADIENTS[h % GRADIENTS.length];
	return `linear-gradient(135deg, ${a}, ${b})`;
};

// Two-letter avatar initials from a name/handle.
export const initialsFor = (name = '') => {
	const parts = String(name).replace(/^@/, '').trim().split(/[\s._-]+/).filter(Boolean);
	if (!parts.length) return 'D';
	return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
};

/**
 * Normalize a raw feed entry (dousic.media/feed post) to the shape FeedPost
 * renders. Tolerates the various field names the API may use.
 * @param {object} p
 * @returns {object}
 */
export const toFeedPost = (p = {}) => {
	const creator = p.creator || p.author || {};
	const name = (typeof creator === 'string' ? creator : creator.display_name || creator.name) || p.name || 'Creator';
	const handle = (typeof creator === 'object' ? creator.handle : null) || p.handle || '';
	const live = isLiveItem(p);
	const type = (p.type || p.media_type || p.kind || '').toString().toLowerCase();
	return {
		id: p.id,
		name,
		handle,
		avatarUrl: (typeof creator === 'object' && (creator.avatar_url || creator.avatar)) || p.avatar_url,
		initials: initialsFor(name || handle),
		avatarGradient: gradientFor(handle || name),
		meta: p.meta || p.posted_at_label || p.timeago || p.time || '',
		caption: p.caption || p.text || p.description || p.title || '',
		title: p.title || p.track_title || '',
		subtitle: p.subtitle || p.duration_label || '',
		thumbnailUrl: resolveThumbnail(p),
		mediaGradient: gradientFor(p.title || p.id || name),
		isLive: live,
		isAudio: type === 'audio',
		type,
		tag: p.tag || (live ? 'Live' : (type ? type.charAt(0).toUpperCase() + type.slice(1) : '')),
		viewerCount: p.viewer_count ?? p.viewerCount,
		likes: p.likes ?? p.like_count,
		comments: p.comments ?? p.comment_count,
		contentId: p.content_id || p.id
	};
};

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
