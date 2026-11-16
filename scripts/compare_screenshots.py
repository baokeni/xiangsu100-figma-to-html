#!/usr/bin/env python3
"""Produce color-managed comparison artifacts, never a fidelity score."""
import argparse
import io
import json
from pathlib import Path

def compare(reference, render, output, untagged='srgb'):
    try:
        from PIL import Image, ImageChops, ImageCms, ImageDraw, ImageEnhance, ImageStat
    except ImportError as error:
        raise RuntimeError('Install Pillow in the project environment before comparison') from error
    def load(path):
        with Image.open(path) as image:
            profile = image.info.get('icc_profile')
            if profile:
                source = ImageCms.ImageCmsProfile(io.BytesIO(profile))
                description = ImageCms.getProfileDescription(source).strip()
                return ImageCms.profileToProfile(image.convert('RGB'), source, ImageCms.createProfile('sRGB'), outputMode='RGB'), description
            if untagged == 'reject':
                raise ValueError('Untagged image: record its color space instead of guessing')
            return image.convert('RGB'), 'assumed sRGB (untagged)'
    a, ap = load(reference); b, bp = load(render)
    if a.size != b.size:
        raise ValueError(f'Pixel grids differ: {a.size} vs {b.size}; fix viewport/DPR/export scale, do not auto-resize')
    out = Path(output); out.mkdir(parents=True, exist_ok=True)
    difference = ImageChops.difference(a, b)
    difference.save(out / 'difference.png')
    ImageEnhance.Brightness(difference).enhance(4).save(out / 'difference-x4.png')
    width, height = a.size
    sheet = Image.new('RGB', (width * 2, height + 24), '#eeeeee')
    draw = ImageDraw.Draw(sheet); draw.text((4, 5), 'Figma reference (sRGB)', fill='black'); draw.text((width + 4, 5), 'HTML render (sRGB)', fill='black')
    sheet.paste(a, (0,24)); sheet.paste(b, (width,24)); sheet.save(out / 'side-by-side.png')
    report = {'status':'diagnostics_only', 'requiresVisualReview':True, 'size':list(a.size), 'profiles':{'reference':ap,'render':bp},
              'meanAbsoluteChannelDifference':sum(ImageStat.Stat(difference).mean)/3, 'channelRange':255,
              'pixelDifferenceBounds':difference.getbbox(), 'note':'Not a fidelity percentage, acceptance result, or proof of 1:1. Inspect local regions and interactions.'}
    (out / 'comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('reference');p.add_argument('render');p.add_argument('--out',required=True);p.add_argument('--untagged',choices=['srgb','reject'],default='srgb');a=p.parse_args()
    try:print(json.dumps(compare(a.reference,a.render,a.out,a.untagged),ensure_ascii=False))
    except (OSError,ValueError,RuntimeError) as error:p.exit(1,str(error)+'\n')

if __name__=='__main__':main()
