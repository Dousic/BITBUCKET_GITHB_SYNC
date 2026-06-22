/**
 * Tests for the content normalization helpers. These guard the tolerant
 * field-name resolution that every rail/grid/detail view depends on.
 */

import {
	resolveThumbnail,
	isLiveItem,
	resolveCreator,
	isFreePrice,
	formatPriceLabel,
	toCardProps,
	asItems
} from './content';

// $L (used by formatPriceLabel via Strings.free) returns the key unchanged in
// the test environment, so "Free" comes through as "Free".

describe('resolveThumbnail', () => {
	it('prefers thumbnail_url, then falls back through the chain', () => {
		expect(resolveThumbnail({thumbnail_url: 'a', cover_url: 'b'})).toBe('a');
		expect(resolveThumbnail({cover_url: 'b'})).toBe('b');
		expect(resolveThumbnail({image: 'c'})).toBe('c');
		expect(resolveThumbnail({backdrop_url: 'd'})).toBe('d');
	});

	it('returns undefined when no artwork field is present', () => {
		expect(resolveThumbnail({})).toBeUndefined();
		expect(resolveThumbnail()).toBeUndefined();
	});
});

describe('isLiveItem', () => {
	it('reads both snake_case and camelCase', () => {
		expect(isLiveItem({is_live: true})).toBe(true);
		expect(isLiveItem({isLive: true})).toBe(true);
		expect(isLiveItem({is_live: false})).toBe(false);
		expect(isLiveItem({})).toBe(false);
	});
});

describe('resolveCreator', () => {
	it('handles object and bare-string creators', () => {
		expect(resolveCreator({creator: {handle: 'mxckenzie'}})).toBe('mxckenzie');
		expect(resolveCreator({creator: {display_name: 'Mac K'}})).toBe('Mac K');
		expect(resolveCreator({creator: 'plainstring'})).toBe('plainstring');
		expect(resolveCreator({})).toBeUndefined();
	});
});

describe('isFreePrice', () => {
	it('treats explicit free, zero, missing and non-numeric as free', () => {
		expect(isFreePrice(0)).toBe(true);
		expect(isFreePrice(null)).toBe(true);
		expect(isFreePrice()).toBe(true); // price omitted (undefined)
		expect(isFreePrice('abc')).toBe(true);
		expect(isFreePrice(9.99, true)).toBe(true);
	});

	it('treats a positive amount as paid', () => {
		expect(isFreePrice(9.99)).toBe(false);
		expect(isFreePrice('4.50')).toBe(false);
	});
});

describe('formatPriceLabel', () => {
	it('formats paid amounts to two decimals', () => {
		expect(formatPriceLabel(9.9)).toBe('$9.90');
		expect(formatPriceLabel('4.5')).toBe('$4.50');
	});

	it('labels free content', () => {
		expect(formatPriceLabel(0)).toBe('Free');
		expect(formatPriceLabel(5, true)).toBe('Free');
	});
});

describe('toCardProps', () => {
	it('maps a mixed-shape item to canonical card props', () => {
		const props = toCardProps({
			id: '42',
			title: 'Neon Harvest',
			cover_url: '/img/x.jpg',
			creator: {handle: 'nova'},
			is_live: false,
			media_type: 'video',
			amount: '12.00'
		});
		expect(props).toMatchObject({
			id: '42',
			title: 'Neon Harvest',
			thumbnailUrl: '/img/x.jpg',
			creator: 'nova',
			isLive: false,
			type: 'video',
			price: '12.00'
		});
	});

	it('does not throw on an empty item', () => {
		expect(() => toCardProps({})).not.toThrow();
		expect(() => toCardProps()).not.toThrow();
	});
});

describe('asItems', () => {
	it('passes arrays through', () => {
		expect(asItems([1, 2])).toEqual([1, 2]);
	});

	it('unwraps the common envelopes', () => {
		expect(asItems({items: [1]})).toEqual([1]);
		expect(asItems({results: [2]})).toEqual([2]);
		expect(asItems({data: [3]})).toEqual([3]);
	});

	it('returns an empty array for empty/unknown payloads', () => {
		expect(asItems(null)).toEqual([]);
		expect(asItems({})).toEqual([]);
	});
});
