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
import PropTypes from 'prop-types';

import luna from '../platform/luna';
import {useBackKey} from '../hooks/usePlatform';
import Strings from '../i18n/strings';
import css from './ExitConfirmation.module.less';

const ExitConfirmationBase = ({onCancel}) => {
	// Back key cancels the dialog
	useBackKey(() => {
		onCancel?.();
		return true;
	});

	// Move focus into the dialog on mount
	useEffect(() => {
		Spotlight.focus(`.${css.dialog}`);
	}, []);

	const handleExit = () => luna.closeApp();

	return (
		<div className={css.overlay} role="dialog" aria-modal="true" aria-labelledby="exit-title">
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
	onCancel: PropTypes.func.isRequired
};

const ExitConfirmation = SpotlightContainerDecorator(
	// `enterTo: 'default-element'` honors the element marked with
	// spotlightDefaultClass (the "Stay" button above). Previously used
	// `defaultElement: '[data-spotlight-id="exit-stay"]'`, which would not
	// match because Moonstone's <Button> doesn't surface spotlightId as a
	// DOM attribute. (Audit H7.)
	{enterTo: 'default-element'},
	ExitConfirmationBase
);

export default ExitConfirmation;
