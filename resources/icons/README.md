# Dousic webOS — Icon & Art Assets

This directory holds all visual assets referenced from `appinfo.json`. LG
Content Store enforces exact specs — wrong dimensions are an automated
rejection during cert. Generate these from the master brand files before
every submission.

## Required files

| File | Dimensions | Format | Usage |
|------|------------|--------|-------|
| `icon-80x80.png` | 80×80 | PNG with alpha | Small launcher icon |
| `icon-256x256.png` | 256×256 | PNG with alpha | Focused launcher on webOS 6+ |
| `bg-1920x1080.png` | 1920×1080 | PNG | App card background when focused on home screen |
| `splash-1920x1080.png` | 1920×1080 | PNG | Shown at app boot before HTML renders |

## Brand constraints

- Brand primary: `#FF00FF` (magenta)
- Brand black: `#0a0a0a`
- Wordmark: lowercase `dousic` with a red period accent
- Sans-serif, bold, letter-spacing -0.04em

## Store listing assets (submitted separately via Seller Lounge)

These are not bundled in the IPK. They live in `/resources/store-listing/`
alongside this directory and get uploaded via the Seller Lounge web UI.

| File | Dimensions | Purpose |
|------|------------|---------|
| `hero-1920x1080.png` | 1920×1080 | Featured home-screen tile |
| `square-400x400.png` | 400×400 | App detail page |
| `banner-1280x360.png` | 1280×360 | Category pages |
| `screenshot-home.png` | 1920×1080 | Home view screenshot |
| `screenshot-browse.png` | 1920×1080 | Browse view screenshot |
| `screenshot-live.png` | 1920×1080 | Live view screenshot |
| `screenshot-player.png` | 1920×1080 | Player view screenshot |
| `screenshot-detail.png` | 1920×1080 | Content detail screenshot |
| `preview.mp4` | 1920×1080, ≤20MB, H.264 | Optional 15–30s app preview |

## Generating placeholders for dev builds

Until final design assets are delivered, generate placeholders:

```bash
# Requires ImageMagick
cd resources/icons
magick -size 80x80 xc:'#0a0a0a' -fill '#FF00FF' \
  -gravity center -pointsize 48 -font Arial-Bold \
  -annotate 0 'd.' icon-80x80.png

magick -size 256x256 xc:'#0a0a0a' -fill '#FF00FF' \
  -gravity center -pointsize 160 -font Arial-Black \
  -annotate 0 'd.' icon-256x256.png

magick -size 1920x1080 \
  gradient:'#1a0e1a'-'#0a0a0a' bg-1920x1080.png

magick -size 1920x1080 \
  gradient:'#1a0e1a'-'#0a0a0a' \
  -fill '#ffffff' -gravity center -pointsize 180 -font Arial-Black \
  -annotate 0 'dousic' splash-1920x1080.png
```

Don't ship placeholders to LG. Real vector-derived PNGs only.
