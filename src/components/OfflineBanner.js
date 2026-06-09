/**
 * Dousic — Offline Banner
 * Persistent banner shown when network connection is lost.
 */

import Strings from '../i18n/strings';
import css from './OfflineBanner.module.less';

const OfflineBanner = () => (
	<div className={css.banner} role="status" aria-live="polite">
		<div className={css.dot} />
		<div className={css.text}>{Strings.offline.banner()}</div>
	</div>
);

export default OfflineBanner;
