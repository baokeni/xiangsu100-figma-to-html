#!/usr/bin/env python3
"""Produce color-managed comparison artifacts, never a fidelity score."""
import argparse
import io
import json
from pathlib import Path

def compare(reference, render, output, untagged='srgb', background=None):
    try:
        from PIL import Image, ImageChops, ImageCms, ImageDraw, ImageEnhance, ImageStat, ImageColor
    except ImportError as error:
        raise RuntimeError('Install Pillow in the project environment before comparison') from error
    if untagged not in ('srgb', 'reject'):
        raise ValueError('untagged must be srgb or reject')
    if background is not None:
        if not isinstance(background, str) or len(background) != 7 or not background.startswith('#'):
            raise ValueError('Use an opaque sRGB background such as #ffffff')
        try: background_rgb = ImageColor.getrgb(background)
        except ValueError as error: raise ValueError('Invalid sRGB background') from error
    def load(path):
        with Image.open(path) as image:
            profile = image.info.get('icc_profile')
            alpha = image.convert('RGBA').getchannel('A')
            transparent = alpha.getextrema()[0] < 255
            if transparent and background is None:
                raise ValueError('Transparent image needs an explicit common --background; alpha cannot be discarded')
            if profile:
                source = ImageCms.ImageCmsProfile(io.BytesIO(profile))
                description = ImageCms.getProfileDescription(source).strip()
                rgb = ImageCms.profileToProfile(image.convert('RGB'), source, ImageCms.createProfile('sRGB'), outputMode='RGB')
            else:
                if untagged == 'reject':
                    raise ValueError('Untagged image: record its color space instead of guessing')
                rgb, description = image.convert('RGB'), 'assumed sRGB (untagged)'
            if transparent:
                rgba = rgb.convert('RGBA'); rgba.putalpha(alpha)
                rgb = Image.alpha_composite(Image.new('RGBA', image.size, (*background_rgb, 255)), rgba).convert('RGB')
            return rgb, description, transparent
    a, ap, aa = load(reference); b, bp, ba = load(render)
    if a.size != b.size:
        raise ValueError(f'Pixel grids differ: {a.size} vs {b.size}; fix viewport/DPR/export scale, do not auto-resize')
    out = Path(output); out.mkdir(parents=True, exist_ok=True)
    difference = ImageChops.difference(a, b)
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    Image.blend(a, b, 0.5).save(out / 'overlay-50.png', icc_profile=srgb)
    difference.save(out / 'difference.png', icc_profile=srgb)
    ImageEnhance.Brightness(difference).enhance(4).save(out / 'difference-x4.png', icc_profile=srgb)
    width, height = a.size
    sheet = Image.new('RGB', (width * 2, height + 24), '#eeeeee')
    draw = ImageDraw.Draw(sheet); draw.text((4, 5), 'Figma reference (sRGB)', fill='black'); draw.text((width + 4, 5), 'HTML render (sRGB)', fill='black')
    sheet.paste(a, (0,24)); sheet.paste(b, (width,24)); sheet.save(out / 'side-by-side.png', icc_profile=srgb)
    report = {'status':'diagnostics_only', 'requiresVisualReview':True, 'size':list(a.size), 'profiles':{'reference':ap,'render':bp},
              'overlay':{'file':'overlay-50.png','referenceWeight':0.5,'renderWeight':0.5,'space':'sRGB encoded RGB'},
              'alpha':{'reference':aa,'render':ba,'background':background,'compositingSpace':'sRGB encoded RGBA after profile conversion; no alpha discarded'},
              'meanAbsoluteChannelDifference':sum(ImageStat.Stat(difference).mean)/3, 'channelRange':255,
              'pixelDifferenceBounds':difference.getbbox(), 'note':'Not a fidelity percentage, acceptance result, or proof of 1:1. Inspect local regions and interactions.'}
    (out / 'comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('reference');p.add_argument('render');p.add_argument('--out',required=True);p.add_argument('--untagged',choices=['srgb','reject'],default='srgb');p.add_argument('--background',help='Explicit common opaque sRGB #RRGGBB background for transparent inputs');a=p.parse_args()
    try:print(json.dumps(compare(a.reference,a.render,a.out,a.untagged,a.background),ensure_ascii=False))
    except (OSError,ValueError,RuntimeError) as error:p.exit(1,str(error)+'\n')

if __name__=='__main__':main()
