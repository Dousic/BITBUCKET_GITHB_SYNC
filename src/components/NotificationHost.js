/**
 * Dousic — Notification Host
 * Renders toast notifications from the app store.
 */

import classNames from 'classnames';
import {useAppStore} from '../state/appStore';
import css from './NotificationHost.module.less';

const NotificationHost = () => {
	const notifications = useAppStore((s) => s.notifications);

	if (notifications.length === 0) return null;

	return (
		<div className={css.host} aria-live="polite" aria-atomic="false">
			{notifications.map((n) => (
				<div
					key={n.id}
					className={classNames(css.toast, css[n.type])}
					role="status"
				>
					{n.message}
				</div>
			))}
		</div>
	);
};

export default NotificationHost;
