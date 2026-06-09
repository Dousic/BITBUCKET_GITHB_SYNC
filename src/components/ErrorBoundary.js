/**
 * Dousic — Error Boundary
 *
 * Catches React render errors, displays branded fallback UI,
 * reports to telemetry, offers reload.
 */

import {Component} from 'react';
import PropTypes from 'prop-types';
import Button from '@enact/moonstone/Button';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';

import css from './ErrorBoundary.module.less';

class ErrorBoundary extends Component {
	static propTypes = {
		children: PropTypes.node
	};

	state = {hasError: false, error: null};

	static getDerivedStateFromError (error) {
		return {hasError: true, error};
	}

	componentDidCatch (error, errorInfo) {
		telemetry.captureException(error, {
			componentStack: errorInfo.componentStack,
			source: 'ErrorBoundary'
		});
	}

	handleReload = () => {
		window.location.reload();
	};

	render () {
		if (!this.state.hasError) return this.props.children;

		return (
			<div className={css.errorBoundary}>
				<div className={css.content}>
					<h1 className={css.title}>{Strings.errorBoundary.title()}</h1>
					<p className={css.message}>
						{Strings.errorBoundary.message()}
					</p>
					<div className={css.actions}>
						<Button onClick={this.handleReload}>{Strings.errorBoundary.retry()}</Button>
					</div>
					<div className={css.errorCode}>
						{this.state.error?.message || 'Unknown'}
					</div>
				</div>
			</div>
		);
	}
}

export default ErrorBoundary;
