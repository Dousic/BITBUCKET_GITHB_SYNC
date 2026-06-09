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
import classNames from 'classnames';
import PropTypes from 'prop-types';

import {useAppStore} from '../state/appStore';
import Strings from '../i18n/strings';
import css from './NavBar.module.less';

// Labels are functions so they re-evaluate after locale change.
const NAV_ITEMS = [
	{id: 'home',    label: () => Strings.nav.home(),    icon: 'home'},
	{id: 'browse',  label: () => Strings.nav.browse(),  icon: 'browse'},
	{id: 'live',    label: () => Strings.nav.live(),    icon: 'live'},
	{id: 'search',  label: () => Strings.nav.search(),  icon: 'search'},
	{id: 'profile', label: () => Strings.nav.profile(), icon: 'profile'}
];

// Spottable owns activation: it synthesizes a click on Enter for the host
// element, so we only need `onClick`. The previous code also had an
// `onKeyDown` Enter handler, which could double-fire on certain remote
// firmwares — see audit H4. Spottable also manages `tabIndex` internally;
// the previous `tabIndex={-1}` (audit H5) fought that bookkeeping.
const NavItemBase = ({id, label, icon, active, onSelect}) => {
	const handleSelect = useCallback(() => onSelect?.(id), [id, onSelect]);

	const labelText = typeof label === 'function' ? label() : label;

	return (
		<div
			className={classNames(css.item, {[css.active]: active})}
			onClick={handleSelect}
			role="button"
			aria-label={labelText}
			aria-current={active ? 'page' : null}
		>
			<div className={classNames(css.icon, css[`icon-${icon}`])} />
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
	onSelect: PropTypes.func
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
					<span className={css.logo}>d<span className={css.accent}>.</span></span>
				</div>

				<div className={css.items}>
					{NAV_ITEMS.map((item) => (
						<NavItem
							key={item.id}
							{...item}
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
