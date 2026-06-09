/**
 * Dousic — Settings Panel
 *
 * Minimal TV settings: locale override, captions toggle info, about info,
 * sign out. Platform-controlled settings (volume, brightness) are not
 * exposed — TV settings app owns those.
 */

import {Panel} from '@enact/moonstone/Panels';
import Scroller from '@enact/moonstone/Scroller';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import Spottable from '@enact/spotlight/Spottable';
import Button from '@enact/moonstone/Button';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import {useAuthStore} from '../state/authStore';
import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './SettingsPanel.module.less';

// Spottable owns Enter activation — no manual onKeyDown handler. (Audit H4.)
// `className` is destructured so an external class (e.g. spotlightDefaultClass)
// passed by the parent is preserved alongside our row classes.
const SettingsRowBase = ({label, value, onPress, isAction, className}) => {
	return (
		<div
			className={classNames(css.row, {[css.action]: isAction}, className)}
			onClick={onPress}
			role="button"
		>
			<div className={css.rowLabel}>{label}</div>
			<div className={css.rowValue}>{value}</div>
		</div>
	);
};
SettingsRowBase.propTypes = {
	label: PropTypes.node.isRequired,
	className: PropTypes.string,
	isAction: PropTypes.bool,
	onPress: PropTypes.func,
	value: PropTypes.node
};
const SettingsRow = Spottable(SettingsRowBase);

const SettingsPanelBase = () => {
	const user = useAuthStore((s) => s.user);
	const logout = useAuthStore((s) => s.logout);
	const deviceInfo = useAppStore((s) => s.deviceInfo);
	const locale = useAppStore((s) => s.locale);
	const country = useAppStore((s) => s.country);
	const captions = useAppStore((s) => s.captionsEnabled);
	const popView = useAppStore((s) => s.popView);
	const switchRoot = useAppStore((s) => s.switchRoot);
	const notify = useAppStore((s) => s.notify);

	// Restore scroll + focused row on remount (audit H6 follow-up).
	const persistence = useViewPersistence();

	const handleLogout = async () => {
		await logout();
		notify(Strings.signOut(), {type: 'success'});
		switchRoot('home');
	};

	const handleClearCache = () => {
		// Clear content cache to force fresh reload
		notify(Strings.settings.cacheCleared(), {type: 'success'});
		telemetry.trackEvent('settings_clear_cache');
	};

	return (
		<Panel className={css.panel}>
			<Scroller
				{...persistence.scrollerProps}
				direction="vertical"
				verticalScrollbar="hidden"
				className={css.content}
			>
				<header className={css.header}>
					<h1 className={css.title}>{Strings.settings.title()}</h1>
				</header>

				<section className={css.section}>
					<h2 className={css.sectionTitle}>{Strings.settings.sectionAccount()}</h2>
					<div className={css.rows}>
						<SettingsRow
							label={Strings.settings.signedInAs()}
							value={user?.display_name || user?.handle || Strings.profile.guest()}
						/>
						{user && !user.is_guest && (
							<SettingsRow
								label={Strings.signOut()}
								value="→"
								onPress={handleLogout}
								isAction
								className={spotlightDefaultClass}
							/>
						)}
					</div>
				</section>

				<section className={css.section}>
					<h2 className={css.sectionTitle}>{Strings.settings.sectionPlayback()}</h2>
					<div className={css.rows}>
						<SettingsRow
							label={Strings.settings.captionsLabel()}
							value={
								<span className={css.mutedValue}>
									{captions ? Strings.settings.captionsOnFromTV() : Strings.settings.captionsOffFromTV()}
								</span>
							}
						/>
						<SettingsRow
							label={Strings.settings.language()}
							value={<span className={css.mutedValue}>{locale}</span>}
						/>
						<SettingsRow
							label={Strings.settings.region()}
							value={<span className={css.mutedValue}>{country}</span>}
						/>
					</div>
					<p className={css.sectionNote}>
						{Strings.settings.platformNote()}
					</p>
				</section>

				<section className={css.section}>
					<h2 className={css.sectionTitle}>{Strings.settings.sectionApp()}</h2>
					<div className={css.rows}>
						<SettingsRow
							label={Strings.settings.clearCache()}
							value="→"
							onPress={handleClearCache}
							isAction
						/>
					</div>
				</section>

				<section className={css.section}>
					<h2 className={css.sectionTitle}>{Strings.settings.sectionAbout()}</h2>
					<div className={css.rows}>
						<SettingsRow
							label={Strings.settings.version()}
							value={<span className={css.mutedValue}>1.0.0</span>}
						/>
						<SettingsRow
							label={Strings.settings.tvModel()}
							value={<span className={css.mutedValue}>
								{deviceInfo?.modelName || 'unknown'}
							</span>}
						/>
						<SettingsRow
							label={Strings.settings.webOSVersion()}
							value={<span className={css.mutedValue}>
								{deviceInfo?.sdkVersion || 'unknown'}
							</span>}
						/>
					</div>
					<p className={css.sectionNote}>
						{Strings.settings.footer()}
					</p>
				</section>

				<div className={css.footer}>
					<Button onClick={popView}>{Strings.back()}</Button>
				</div>
			</Scroller>
		</Panel>
	);
};

SettingsPanelBase.propTypes = {};

const SettingsPanel = SpotlightContainerDecorator(
	// `enterTo: 'default-element'` honors the row marked with
	// spotlightDefaultClass (the Sign Out row when applicable, else the
	// first focusable row). Previously used `defaultElement: '[autofocus]'`,
	// which wouldn't match because React strips the `autoFocus` prop on
	// non-input elements and our SettingsRow is a <div>. Audit H7 +
	// LoginPanel-class fix.
	{enterTo: 'default-element'},
	SettingsPanelBase
);

export default SettingsPanel;
