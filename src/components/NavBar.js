/**
 * Dousic — Primary Nav Bar
 *
 * Fixed left-side navigation providing access to Home / Browse / Live /
 * Search / Profile. Collapses to icon-only when focus leaves, expands
 * with labels on focus-within.
 *
 * This is the "persistent shell" that always stays on screen, matching
 * Netflix-style TV app conventions.
 *
 * The expand/collapse behavior is driven by React state rather than the
 * CSS `:has()` selector. `:has()` only shipped in Chromium 105 (webOS 24+),
 * so the previous implementation left the bar permanently collapsed on
 * every TV in the field. Focus events bubble in React — `onFocus`/`onBlur`
 * on the container catch focus moving into or out of any descendant
 * Spottable without needing `:has()`. (Audit B3.)
 */

import {useCallback, useState} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import classNames from 'classnames';
import PropTypes from 'prop-types';

import {useAppStore} from '../state/appStore';
import Strings from '../i18n/strings';
import markUrl from '../assets/dousic-mark.png';
import lockupUrl from '../assets/dousic-lockup.png';
import css from './NavBar.module.less';

// Labels are functions so they re-evaluate after locale change.
const NAV_ITEMS = [
	{id: 'home',    label: () => Strings.nav.home(),    icon: 'home'},
	{id: 'browse',  label: () => Strings.nav.browse(),  icon: 'browse'},
	{id: 'live',    label: () => Strings.nav.live(),    icon: 'live'},
	{id: 'search',  label: () => Strings.nav.search(),  icon: 'search'},
	{id: 'profile', label: () => Strings.nav.profile(), icon: 'profile'}
];

// Inline SVG icons (filled via `fill: currentColor`). Replaces the previous
// CSS `-webkit-mask` approach, which intermittently dropped the icon on
// webOS Chromium when the nav's width transition triggered a compositor
// repaint on focus — leaving items blank and selection ambiguous.
const ICON_PATHS = {
	home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
	browse: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
	search: 'M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.49-1.49zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z',
	profile: 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'
};

const NavIcon = ({icon}) => (
	<svg className={css.icon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
		{icon === 'live' ? (
			<>
				<circle cx="12" cy="12" r="4" />
				<path d="M12 4a8 8 0 1 0 8 8 8 8 0 0 0-8-8zm0 14a6 6 0 1 1 6-6 6 6 0 0 1-6 6z" />
			</>
		) : (
			<path d={ICON_PATHS[icon]} />
		)}
	</svg>
);

NavIcon.propTypes = {icon: PropTypes.string.isRequired};

// Spottable owns activation: it synthesizes a click on Enter for the host
// element, so we only need `onClick`. The previous code also had an
// `onKeyDown` Enter handler, which could double-fire on certain remote
// firmwares — see audit H4. Spottable also manages `tabIndex` internally;
// the previous `tabIndex={-1}` (audit H5) fought that bookkeeping.
const NavItemBase = ({id, label, icon, active, onSelect, className, onKeyDown, prevId, nextId, ...rest}) => {
	const handleSelect = useCallback(() => onSelect?.(id), [id, onSelect]);

	// Drive vertical nav explicitly. Spotlight's spatial nav kept leaking Down
	// to the off-axis content grid instead of the next nav item, so we move
	// focus to the sibling ourselves. Up/Down only — OK/Enter activation is
	// handled globally by the Magic Remote OK-key bridge (platform/okKey.js).
	const handleKeyDown = useCallback((e) => {
		const k = e.keyCode;
		if (k === 38 && prevId) {        // Up
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus(prevId);
			return;
		}
		if (k === 40 && nextId) {        // Down
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus(nextId);
			return;
		}
		onKeyDown?.(e);
	}, [onKeyDown, prevId, nextId]);

	const labelText = typeof label === 'function' ? label() : label;

	// Spread Spotlight's injected props (tabIndex, focus/key handlers, the
	// `spottable` class) onto the root and MERGE className — without this the
	// nav items aren't focusable by the remote's 5-way at all (pointer-only).
	return (
		<div
			{...rest}
			className={classNames(css.item, className, {[css.active]: active})}
			onClick={handleSelect}
			onKeyDown={handleKeyDown}
			role="button"
			aria-label={labelText}
			aria-current={active ? 'page' : null}
		>
			<NavIcon icon={icon} />
			<div className={css.label}>{labelText}</div>
			{active && <div className={css.activeIndicator} />}
		</div>
	);
};

NavItemBase.propTypes = {
	icon: PropTypes.string.isRequired,
	id: PropTypes.string.isRequired,
	label: PropTypes.oneOfType([PropTypes.string, PropTypes.func]).isRequired,
	active: PropTypes.bool,
	className: PropTypes.string,
	nextId: PropTypes.string,
	onSelect: PropTypes.func,
	onKeyDown: PropTypes.func,
	prevId: PropTypes.string
};

const NavItem = Spottable(NavItemBase);

const NavBar = SpotlightContainerDecorator(
	{enterTo: 'last-focused'},
	() => {
		const activeRoot = useAppStore((s) => s.activeRoot);
		const switchRoot = useAppStore((s) => s.switchRoot);

		// Container-level focus tracking replaces the CSS `:has()` selector
		// (which is webOS 24+ only). React focus events bubble in synthetic
		// form, so onFocus/onBlur on the <nav> capture every descendant.
		const [expanded, setExpanded] = useState(false);
		const handleFocus = useCallback(() => setExpanded(true), []);
		const handleBlur = useCallback((e) => {
			// Only collapse when focus leaves the nav entirely. relatedTarget
			// is the element receiving focus; if it's still inside <nav>, we
			// stay expanded. Without this check, moving focus between two
			// NavItems would briefly collapse + re-expand the bar.
			if (!e.currentTarget.contains(e.relatedTarget)) {
				setExpanded(false);
			}
		}, []);

		return (
			<nav
				className={classNames(css.navBar, {[css.expanded]: expanded})}
				aria-label={Strings.nav.primaryAria()}
				onFocus={handleFocus}
				onBlur={handleBlur}
			>
				<div className={css.brand}>
					<img className={css.logoMark} src={markUrl} alt={Strings.appName()} />
					<img className={css.logoLockup} src={lockupUrl} alt={Strings.appName()} />
				</div>

				<div className={css.items}>
					{NAV_ITEMS.map((item, i) => (
						<NavItem
							key={item.id}
							{...item}
							spotlightId={`nav-${item.id}`}
							prevId={i > 0 ? `nav-${NAV_ITEMS[i - 1].id}` : null}
							nextId={i < NAV_ITEMS.length - 1 ? `nav-${NAV_ITEMS[i + 1].id}` : null}
							active={activeRoot === item.id}
							onSelect={switchRoot}
						/>
					))}
				</div>
			</nav>
		);
	}
);

export default NavBar;
