#!/usr/bin/env python3
"""
Generate placeholder icons for the Dousic webOS build.
Replace with real brand assets before LG submission.
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join(os.path.dirname(__file__))
BRAND_PRIMARY = (255, 0, 255, 255)
BRAND_BLACK = (10, 10, 10, 255)
WHITE = (255, 255, 255, 255)


def make_gradient(w, h, c1, c2):
    img = Image.new('RGBA', (w, h), c2)
    for y in range(h):
        t = (y / h) ** 2
        r = int(c1[0] * (1 - t) + c2[0] * t)
        g = int(c1[1] * (1 - t) + c2[1] * t)
        b = int(c1[2] * (1 - t) + c2[2] * t)
        for x in range(w):
            img.putpixel((x, y), (r, g, b, 255))
    return img


def get_font(size):
    # Try common bold fonts
    for path in [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
    ]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def make_icon(size, out_path):
    img = Image.new('RGBA', (size, size), BRAND_BLACK)
    draw = ImageDraw.Draw(img)
    # Rounded corners by drawing
    font_size = int(size * 0.55)
    font = get_font(font_size)
    text = 'd.'
    # Approximate centering
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.04
    # Draw "d" in white
    draw.text((x, y), 'd', fill=WHITE, font=font)
    # Draw "." in red - approximate position after "d"
    d_bbox = draw.textbbox((0, 0), 'd', font=font)
    dw = d_bbox[2] - d_bbox[0]
    draw.text((x + dw, y), '.', fill=BRAND_PRIMARY, font=font)
    img.save(out_path, 'PNG')
    print(f'  {out_path}: {size}x{size}')


def make_background(w, h, out_path):
    img = make_gradient(w, h, (26, 14, 14, 255), BRAND_BLACK)
    img.save(out_path, 'PNG')
    print(f'  {out_path}: {w}x{h}')


def make_splash(w, h, out_path):
    img = make_gradient(w, h, (26, 14, 14, 255), BRAND_BLACK)
    draw = ImageDraw.Draw(img)
    font_size = int(h * 0.2)
    font = get_font(font_size)
    text = 'dousic'
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (w - tw) / 2 - bbox[0]
    y = (h - th) / 2 - bbox[1] - h * 0.05
    draw.text((x, y), text, fill=WHITE, font=font)
    # Red dot after
    dot_font = get_font(font_size)
    draw.text((x + tw, y), '.', fill=BRAND_PRIMARY, font=dot_font)
    img.save(out_path, 'PNG')
    print(f'  {out_path}: {w}x{h}')


if __name__ == '__main__':
    print('Generating Dousic placeholder icons:')
    make_icon(80, os.path.join(OUT_DIR, 'icon-80x80.png'))
    make_icon(256, os.path.join(OUT_DIR, 'icon-256x256.png'))
    make_background(1920, 1080, os.path.join(OUT_DIR, 'bg-1920x1080.png'))
    make_splash(1920, 1080, os.path.join(OUT_DIR, 'splash-1920x1080.png'))
    print('Done. Replace with real brand assets before LG submission.')
