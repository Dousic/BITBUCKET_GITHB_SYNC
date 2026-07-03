/**
 * Dousic — Boot Screen
 * Shown during auth/telemetry init, before first view renders.
 */

import Strings from '../i18n/strings';
import lockupUrl from '../assets/dousic-lockup.png';
import css from './BootScreen.module.less';

const BootScreen = () => (
	<div className={css.bootScreen}>
		<img className={css.mark} src={lockupUrl} alt={Strings.appName()} />
		<div className={css.tagline}>{Strings.tagline()}</div>
		<div className={css.pulseRing} role="progressbar" aria-label={Strings.loading()} />
	</div>
);

export default BootScreen;
