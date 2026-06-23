/**
 * Dousic — Exit Confirmation
 *
 * Shown when user presses Back on the root view. LG certification requires
 * an explicit exit confirmation — no silent close.
 */

import {useEffect} from 'react';
import Button from '@enact/moonstone/Button';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import classNames from 'classnames';
import PropTypes from 'prop-types';

import luna from '../platform/luna';
import {useBackKey} from '../hooks/usePlatform';
import Strings from '../i18n/strings';
import css from './ExitConfirmation.module.less';

const ExitConfirmationBase = ({onCancel, className, ...rest}) => {
	// Back key cancels the dialog
	useBackKey(() => {
		onCancel?.();
		return true;
	});

	// Move focus onto the "Stay" button on mount. Force 5-way mode first:
	// webOS may still be in Magic-Remote pointer mode, in which case the arrow
	// keys have no focused element to move from and the dialog feels dead.
	//
	// We target the button by its spotlightId rather than the dialog's class:
	// `Spotlight.focus('.dialog')` was a no-op because the dialog <div> isn't
	// spottable, so focus stayed on whatever was behind the modal and 5-way
	// roamed the background instead of the dialog. A rAF retry covers the
	// frame where Spotlight hasn't registered the new buttons yet.
	useEffect(() => {
		Spotlight.setPointerMode(false);
		if (!Spotlight.focus('exit-stay')) {
			window.requestAnimationFrame(() => Spotlight.focus('exit-stay'));
		}
	}, []);

	const handleExit = () => luna.closeApp();

	return (
		// Spread the SpotlightContainerDecorator-injected props (the
		// data-spotlight-id / container marker) onto the root, and merge its
		// className — without this the overlay isn't registered as a Spotlight
		// container, so `restrict: 'self-only'` has nothing to restrict and
		// 5-way leaks out to the cards behind the modal.
		<div
			{...rest}
			className={classNames(css.overlay, className)}
			role="dialog"
			aria-modal="true"
			aria-labelledby="exit-title"
		>
			<div className={css.dialog}>
				<h2 id="exit-title" className={css.title}>{Strings.exit.title()}</h2>
				<p className={css.message}>
					{Strings.exit.message()}
				</p>
				<div className={css.actions}>
					<Button
						onClick={onCancel}
						spotlightId="exit-stay"
						className={spotlightDefaultClass}
					>
						{Strings.exit.stay()}
					</Button>
					<Button onClick={handleExit} spotlightId="exit-confirm">
						{Strings.exit.exit()}
					</Button>
				</div>
			</div>
		</div>
	);
};

ExitConfirmationBase.propTypes = {
	className: PropTypes.string,
	onCancel: PropTypes.func.isRequired
};

const ExitConfirmation = SpotlightContainerDecorator(
	// `enterTo: 'default-element'` honors the element marked with
	// spotlightDefaultClass (the "Stay" button above). Previously used
	// `defaultElement: '[data-spotlight-id="exit-stay"]'`, which would not
	// match because Moonstone's <Button> doesn't surface spotlightId as a
	// DOM attribute. (Audit H7.)
	//
	// `restrict: 'self-only'` traps 5-way navigation inside the dialog so
	// Left/Right move between the two buttons instead of leaking out to the
	// cards/nav still mounted behind the modal overlay (which made the arrows
	// appear dead in the dialog).
	{enterTo: 'default-element', restrict: 'self-only'},
	ExitConfirmationBase
);

export default ExitConfirmation;
