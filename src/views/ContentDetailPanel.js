/**
 * Dousic — Content Detail Panel
 *
 * Full-bleed content landing page. Backdrop, title, logline, metadata,
 * action buttons (Play, Add to Watchlist, About Creator). Related content
 * rail at bottom.
 */

import {useEffect, useState} from 'react';
import {Panel} from '@enact/moonstone/Panels';
import Scroller from '@enact/moonstone/Scroller';
import SpotlightContainerDecorator, {spotlightDefaultClass} from '@enact/spotlight/SpotlightContainerDecorator';
import Button from '@enact/moonstone/Button';
import PropTypes from 'prop-types';

import {useAppStore} from '../state/appStore';
import {useViewPersistence} from '../hooks/useViewPersistence';
import {content as contentApi, user as userApi, resolveAssetUrl} from '../services/api';
import ContentRail from '../components/ContentRail';
import telemetry from '../platform/telemetry';
import Strings from '../i18n/strings';
import css from './ContentDetailPanel.module.less';

const ContentDetailPanelBase = ({contentId}) => {
	const [meta, setMeta] = useState(null);
	const [isInWatchlist, setIsInWatchlist] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	const pushView = useAppStore((s) => s.pushView);
	const notify = useAppStore((s) => s.notify);

	// Restore scroll + focused element on remount (audit H6 follow-up).
	const persistence = useViewPersistence();

	useEffect(() => {
		(async () => {
			try {
				const data = await contentApi.getById(contentId);
				setMeta(data);
				setIsInWatchlist(data.in_watchlist === true);
				telemetry.trackScreenView('content_detail', {content_id: contentId});
			} catch (e) {
				telemetry.captureException(e, {contentId});
			} finally {
				setIsLoading(false);
			}
		})();
	}, [contentId]);

	const handlePlay = () => {
		pushView('player', {contentId, isLive: meta?.is_live});
	};

	const handleToggleWatchlist = async () => {
		try {
			if (isInWatchlist) {
				await userApi.removeFromWatchlist(contentId);
				setIsInWatchlist(false);
				notify('Removed from watchlist');
			} else {
				await userApi.addToWatchlist(contentId);
				setIsInWatchlist(true);
				notify(Strings.detail.inWatchlist(), {type: 'success'});
			}
		} catch (e) {
			notify(Strings.error(), {type: 'error'});
		}
	};

	const handleViewCreator = () => {
		if (meta?.creator?.handle) {
			pushView('creator', {handle: meta.creator.handle});
		}
	};

	if (isLoading) {
		return (
			<Panel className={css.panel}>
				<div className={css.loading}>
					<div className={css.spinner} />
				</div>
			</Panel>
		);
	}

	if (!meta) {
		return (
			<Panel className={css.panel}>
				<div className={css.errorView}>
					<h1>{Strings.detail.notFound()}</h1>
				</div>
			</Panel>
		);
	}

	// Tolerate the various artwork field names the API may use.
	const backdropArt = meta.backdrop_url || meta.cover_url || meta.image_url ||
		meta.image || meta.poster_url || meta.thumbnail_url;
	const logoArt = meta.logo_url || meta.logo;

	// Price / "Free" label, mirroring dousic.media/market. Live streams are
	// never priced. A paid item shows the formatted amount; everything else
	// (explicitly free, $0, or no price) reads "Free".
	const rawPrice = meta.price ?? meta.amount ?? meta.cost;
	const priceAmount = typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice;
	const isFreeContent = (meta.is_free ?? meta.isFree ?? meta.free) === true ||
		priceAmount == null || Number.isNaN(priceAmount) || priceAmount <= 0;
	const priceLabel = meta.is_live ? null :
		(isFreeContent ? Strings.free() : `$${priceAmount.toFixed(2)}`);

	return (
		<Panel className={css.panel}>
			<div className={css.backdrop}>
				{backdropArt && (
					<img src={resolveAssetUrl(backdropArt)} alt="" className={css.backdropImage} />
				)}
				<div className={css.gradient} />
			</div>

			<Scroller
				{...persistence.scrollerProps}
				direction="vertical"
				verticalScrollbar="hidden"
				className={css.scroller}
			>
				<div className={css.content}>
					{logoArt ? (
						<img src={resolveAssetUrl(logoArt)} alt={meta.title} className={css.logo} />
					) : (
						<h1 className={css.title}>{meta.title}</h1>
					)}

					<div className={css.meta}>
						{meta.is_live && (
							<span className={css.liveTag}>
								<span className={css.liveDot} />{Strings.player.liveLabel()}
							</span>
						)}
						{meta.year && <span>{meta.year}</span>}
						{meta.genre && <span>{meta.genre}</span>}
						{meta.duration_label && <span>{meta.duration_label}</span>}
						{meta.rating && <span className={css.rating}>{meta.rating}</span>}
						{priceLabel && (
							<span className={isFreeContent ? css.priceFree : css.price}>{priceLabel}</span>
						)}
					</div>

					<p className={css.logline}>{meta.logline || meta.description}</p>

					{meta.creator && (
						<div className={css.creatorRow}>
							<span className={css.creatorLabel}>{Strings.detail.creator()}</span>
							<span className={css.creatorName}>
								{meta.creator.display_name || meta.creator.handle}
							</span>
						</div>
					)}

					<div className={css.actions}>
						<Button
							onClick={handlePlay}
							spotlightId="detail-play"
							className={spotlightDefaultClass}
						>
							{meta.is_live ? Strings.detail.watchLive() : (meta.resume_position > 0 ? Strings.detail.resume() : Strings.detail.play())}
						</Button>
						<Button onClick={handleToggleWatchlist}>
							{isInWatchlist ? Strings.detail.inWatchlist() : Strings.detail.addWatchlist()}
						</Button>
						{meta.creator?.handle && (
							<Button onClick={handleViewCreator}>{Strings.detail.aboutCreator()}</Button>
						)}
					</div>
				</div>

				{meta.related?.length > 0 && (
					<div className={css.related}>
						<ContentRail
							title={Strings.detail.relatedTitle()}
							items={meta.related}
							cardSize="medium"
							onSelectItem={(item) => pushView('content-detail', {contentId: item.id})}
						/>
					</div>
				)}
			</Scroller>
		</Panel>
	);
};

ContentDetailPanelBase.propTypes = {
	contentId: PropTypes.string.isRequired
};

const ContentDetailPanel = SpotlightContainerDecorator(
	// `enterTo: 'default-element'` honors the play button marked with
	// spotlightDefaultClass above. Previously `defaultElement` pointed at
	// `[data-spotlight-id="detail-play"]` — that selector won't match
	// because Moonstone's <Button> doesn't surface spotlightId as a DOM
	// attribute. (Audit H7.)
	{enterTo: 'default-element'},
	ContentDetailPanelBase
);

export default ContentDetailPanel;
