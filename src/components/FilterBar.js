/**
 * Dousic — Filter Bar (Media Types · Genres · Vibes)
 *
 * The dousic.media/market filter dropdowns, adapted for the 10-foot TV. Each
 * filter is a focusable button that opens a 5-way-navigable options list (the
 * web hover-dropdown becomes a Spotlight popup). Selecting an option applies
 * the filter and returns focus to the button; Back closes the open list.
 *
 * The taxonomy mirrors the website exactly. `onChange(key, value)` reports a
 * change; a value of 'All' means "no filter on this axis".
 */

import {useState, useCallback, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import {useBackKey} from '../hooks/usePlatform';
import Strings from '../i18n/strings';
import css from './FilterBar.module.less';

// Taxonomy — identical to dousic.media (Media Types / Genres / Vibes).
export const FILTER_DEFS = [
	{key: 'media', label: () => Strings.filters.media(),  options: ['All', 'Video', 'Audio', 'Images', 'Text', 'Podcast', 'Radio', 'Review Shows', 'Citizen News']},
	{key: 'genre', label: () => Strings.filters.genre(),  options: ['All', 'Hip-Hop', 'R&B', 'Funk', 'Gospel', 'Electronic', 'Indie', 'World', 'Talk', 'Tech', 'News']},
	{key: 'vibe',  label: () => Strings.filters.vibe(),   options: ['All', 'Energetic', 'Chill', 'Smooth', 'Uplifting', 'Classic', 'Mellow']}
];

const OptionBase = ({label, selected, className, ...rest}) => (
	<div {...rest} className={classNames(css.option, className, {[css.optionSel]: selected})} role="option" aria-selected={selected}>
		<span className={css.optionLabel}>{label}</span>
		{selected && <span className={css.check}>✓</span>}
	</div>
);
OptionBase.propTypes = {className: PropTypes.string, label: PropTypes.string, selected: PropTypes.bool};
const Option = Spottable(OptionBase);

// The open options list. Spreads container props onto the root (required for
// `restrict: self-only` to actually contain 5-way) and traps focus inside.
const OptionsList = SpotlightContainerDecorator(
	{enterTo: 'default-element', restrict: 'self-only'},
	({options, value, onPick, className, ...rest}) => (
		<div {...rest} className={classNames(css.list, className)} role="listbox">
			{options.map((o) => (
				<Option
					key={o}
					label={o}
					selected={o === value}
					className={o === value ? spotlightDefaultClass : null}
					onClick={() => onPick(o)}
				/>
			))}
		</div>
	)
);
OptionsList.propTypes = {onPick: PropTypes.func, options: PropTypes.array, value: PropTypes.string};

const DropdownButtonBase = ({label, active, open, className, ...rest}) => (
	<div {...rest} className={classNames(css.button, className, {[css.buttonActive]: active, [css.buttonOpen]: open})} role="button" aria-expanded={open} aria-haspopup="listbox">
		<span className={css.buttonLabel}>{label}</span>
		<span className={css.caret}>{open ? '▲' : '▼'}</span>
	</div>
);
DropdownButtonBase.propTypes = {active: PropTypes.bool, className: PropTypes.string, label: PropTypes.string, open: PropTypes.bool};
const DropdownButton = Spottable(DropdownButtonBase);

const Dropdown = ({id, label, value, options, onChange}) => {
	const [open, setOpen] = useState(false);
	const btnId = `filter-${id}`;
	const listId = `filteropts-${id}`;

	const close = useCallback((refocus = true) => {
		setOpen(false);
		if (refocus) Spotlight.focus(btnId);
	}, [btnId]);

	// Back closes the open list (and only then — otherwise let it bubble to
	// the app-level Back handler).
	useBackKey(() => {
		if (open) { close(); return true; }
		return false;
	}, open);

	// When the list opens, move focus into it (defaults to the selected row).
	useEffect(() => {
		if (!open) return () => {};
		const raf = window.requestAnimationFrame(() => {
			Spotlight.setPointerMode(false);
			if (!Spotlight.focus(listId)) {
				window.requestAnimationFrame(() => Spotlight.focus(listId));
			}
		});
		return () => window.cancelAnimationFrame(raf);
	}, [open, listId]);

	const toggle = useCallback(() => setOpen((o) => !o), []);
	const handlePick = useCallback((o) => {
		onChange(id, o);
		close();
	}, [id, onChange, close]);

	const active = value && value !== 'All';
	const buttonLabel = active ? `${label}: ${value}` : label;

	return (
		<div className={css.dropdown}>
			<DropdownButton
				spotlightId={btnId}
				label={buttonLabel}
				active={active}
				open={open}
				onClick={toggle}
			/>
			{open && (
				<OptionsList
					spotlightId={listId}
					options={options}
					value={value}
					onPick={handlePick}
				/>
			)}
		</div>
	);
};
Dropdown.propTypes = {
	id: PropTypes.string.isRequired,
	label: PropTypes.string,
	onChange: PropTypes.func.isRequired,
	options: PropTypes.array.isRequired,
	value: PropTypes.string
};

const ClearButtonBase = ({className, ...rest}) => (
	<div {...rest} className={classNames(css.clear, className)} role="button">{Strings.filters.clear()}</div>
);
ClearButtonBase.propTypes = {className: PropTypes.string};
const ClearButton = Spottable(ClearButtonBase);

const FilterBar = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	({filters, onChange, onClear}) => {
		const anyActive = FILTER_DEFS.some((f) => filters[f.key] && filters[f.key] !== 'All');
		return (
			<div className={css.bar}>
				{FILTER_DEFS.map((f) => (
					<Dropdown
						key={f.key}
						id={f.key}
						label={f.label()}
						value={filters[f.key] || 'All'}
						options={f.options}
						onChange={onChange}
					/>
				))}
				{anyActive && <ClearButton onClick={onClear} />}
			</div>
		);
	}
);
FilterBar.propTypes = {
	filters: PropTypes.object,
	onChange: PropTypes.func,
	onClear: PropTypes.func
};

export default FilterBar;
