/**
 * Dousic — Boot Screen
 * Shown during auth/telemetry init, before first view renders.
 */

import Strings from '../i18n/strings';
import css from './BootScreen.module.less';

const BootScreen = () => (
	<div className={css.bootScreen}>
		<div className={css.mark}>
			dousic<span className={css.accent}>.</span>
		</div>
		<div className={css.tagline}>{Strings.tagline()}</div>
		<div className={css.pulseRing} role="progressbar" aria-label={Strings.loading()} />
	</div>
);

export default BootScreen;
