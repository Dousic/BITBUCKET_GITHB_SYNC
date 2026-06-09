/**
 * Dousic — Search Panel
 *
 * On-screen keyboard + results. Moonstone VirtualKeyboard would be ideal
 * but is heavy; we use a custom minimal QWERTY grid that's TV-navigable
 * with arrow keys.
 */

import {useState, useCallback, useEffect, useRef} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import Scroller from '@enact/moonstone/Scroller';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spottable from '@enact/spotlight/Spottable';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import {useContentStore} from '../state/contentStore';
import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import ContentCard from '../components/ContentCard';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './SearchPanel.module.less';

const KEY_ROWS = [
	['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
	['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
	['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
	['z', 'x', 'c', 'v', 'b', 'n', 'm']
];

const KeyBase = ({value, label, width = 1, className, onPress, ...rest}) => {
	const handlePress = useCallback(() => onPress?.(value), [value, onPress]);

	// Spottable synthesizes click on Enter — no manual handler needed (H4).
	return (
		<div
			{...rest}
			className={classNames(css.key, className, width > 1 && css[`key-w${width}`])}
			onClick={handlePress}
			role="button"
			aria-label={label || value}
		>
			{label || value}
		</div>
	);
};

KeyBase.propTypes = {
	value: PropTypes.string.isRequired,
	className: PropTypes.string,
	label: PropTypes.string,
	onPress: PropTypes.func,
	width: PropTypes.number
};

const Key = Spottable(KeyBase);

const Keyboard = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	({onPress, onDelete, onSpace, onClear}) => (
		<div className={css.keyboard}>
			{KEY_ROWS.map((row, i) => (
				<div key={i} className={css.row}>
					{row.map((ch) => (
						<Key key={ch} value={ch} onPress={onPress} />
					))}
				</div>
			))}
			<div className={css.row}>
				<Key value="space" label={Strings.search.space()} width={4} onPress={onSpace} />
				<Key value="del" label={Strings.search.del()} width={2} onPress={onDelete} />
				<Key value="clear" label={Strings.search.clear()} width={2} onPress={onClear} />
			</div>
		</div>
	)
);

const SearchResults = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	({items, query, isSearching, onSelect}) => {
		if (isSearching) {
			return <div className={css.searchingText}>{Strings.search.searching()}</div>;
		}
		if (query.length >= 2 && (!items || items.length === 0)) {
			return (
				<div className={css.emptyText}>
					{Strings.search.emptyResults(query)}
				</div>
			);
		}
		if (!items || items.length === 0) {
			return null;
		}
		return (
			<div className={css.resultsGrid}>
				{items.map((item) => (
					<ContentCard
						key={item.id}
						id={item.id}
						title={item.title}
						thumbnailUrl={item.thumbnail_url}
						creator={item.creator?.handle}
						isLive={item.is_live}
						viewerCount={item.viewer_count}
						size="medium"
						onSelect={() => onSelect(item)}
					/>
				))}
			</div>
		);
	}
);

const SearchPanelBase = (props) => {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState([]);
	const [isSearching, setIsSearching] = useState(false);
	const searchTimer = useRef();
	const search = useContentStore((s) => s.search);
	const pushView = useAppStore((s) => s.pushView);

	// Restore scroll + focused element on remount (audit H6 follow-up).
	const persistence = useViewPersistence();

	useEffect(() => {
		telemetry.trackScreenView('search');
	}, []);

	// Debounced search
	useEffect(() => {
		if (!query || query.length < 2) {
			setResults([]);
			return;
		}
		clearTimeout(searchTimer.current);
		searchTimer.current = setTimeout(async () => {
			setIsSearching(true);
			try {
				const data = await search(query);
				setResults(data.results || []);
			} catch (_) {
				setResults([]);
			} finally {
				setIsSearching(false);
			}
		}, 300);
		return () => clearTimeout(searchTimer.current);
	}, [query, search]);

	const handleKeyPress = useCallback((char) => {
		setQuery((q) => q + char);
	}, []);

	const handleSpace = useCallback(() => {
		setQuery((q) => q + ' ');
	}, []);

	const handleDelete = useCallback(() => {
		setQuery((q) => q.slice(0, -1));
	}, []);

	const handleClear = useCallback(() => {
		setQuery('');
	}, []);

	const handleSelect = (item) => {
		if (item.is_live) {
			pushView('player', {contentId: item.id});
		} else {
			pushView('content-detail', {contentId: item.id});
		}
	};

	return (
		<Panel {...props} className={css.panel}>
			<Scroller
				{...persistence.scrollerProps}
				direction="vertical"
				verticalScrollbar="hidden"
				className={css.content}
			>
				<header className={css.header}>
					<h1 className={css.title}>{Strings.search.title()}</h1>
					<div className={css.queryBox}>
						<span className={css.queryText}>
							{query || <span className={css.placeholder}>{Strings.search.placeholder()}</span>}
						</span>
						<span className={css.caret} />
					</div>
				</header>

				<div className={css.body}>
					<Keyboard
						onPress={handleKeyPress}
						onSpace={handleSpace}
						onDelete={handleDelete}
						onClear={handleClear}
					/>

					<div className={css.results}>
						<SearchResults
							items={results}
							query={query}
							isSearching={isSearching}
							onSelect={handleSelect}
						/>
					</div>
				</div>
			</Scroller>
		</Panel>
	);
};

SearchPanelBase.propTypes = {};

const SearchPanel = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	SearchPanelBase
);

export default SearchPanel;
