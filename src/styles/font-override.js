/**
 * Dousic — Font generator override for Enact
 *
 * Enact's build can inject @font-face declarations for the active theme.
 * We use LG Smart UI when available (present on webOS 4+ TVs) and fall
 * back to Museo Sans Rounded, then system fonts.
 *
 * This file is referenced from .enactrc's `fontGenerator` field.
 */

module.exports = function () {
	return `
		@font-face {
			font-family: 'LG Smart UI';
			font-weight: 400;
			font-style: normal;
			src: local('LG Smart UI'), local('Museo Sans Rounded');
		}
		@font-face {
			font-family: 'LG Smart UI';
			font-weight: 500;
			font-style: normal;
			src: local('LG Smart UI Medium'), local('Museo Sans Rounded');
		}
		@font-face {
			font-family: 'LG Smart UI';
			font-weight: 700;
			font-style: normal;
			src: local('LG Smart UI Bold'), local('Museo Sans Rounded');
		}
		@font-face {
			font-family: 'LG Smart UI';
			font-weight: 900;
			font-style: normal;
			src: local('LG Smart UI Black'), local('Museo Sans Rounded');
		}
	`;
};
