/**
 * Dousic — webOS TV app entry point
 *
 * Enact's build system looks for index.js as the root module.
 * We bootstrap the app with MoonstoneDecorator (LG design system),
 * initialize services, and hide the splash once React is mounted.
 */
/* eslint-env browser */

import {createRoot} from 'react-dom/client';
import App from './src/App/App';
import './src/styles/global.less';

// Hide the inline splash once we're ready to render.
const hideSplash = () => {
	const splash = document.getElementById('dousic-splash');
	if (!splash) return;
	splash.classList.add('hide');
	setTimeout(() => splash.remove(), 500);
};

// Mount the app.
const appElement = document.getElementById('root');
const root = createRoot(appElement);
root.render(<App />);

// Splash hides on next paint after mount.
requestAnimationFrame(hideSplash);

// Mark app as ready for webOS launch tracking.
if (typeof window !== 'undefined' && window.PalmSystem) {
	try {
		window.PalmSystem.stageReady();
	} catch (_) { /* noop */ }
}
