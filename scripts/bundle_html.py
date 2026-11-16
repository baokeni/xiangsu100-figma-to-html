#!/usr/bin/env python3
"""Bundle ordinary local HTML without altering source asset bytes.

No network fetching. Modules/async scripts/CSP rewriting require a real build
pipeline. A successful bundle still needs runtime and visual verification.
"""
import argparse
import base64
import hashlib
from html import escape
from html.parser import HTMLParser
import json
import mimetypes
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

class BundleError(ValueError):
    pass

class Bundler(HTMLParser):
    def __init__(self, source, root, max_bytes=25 * 1024 * 1024):
        super().__init__(convert_charrefs=False)
        self.source, self.root = source.resolve(), root.resolve()
        self.max_bytes, self.assets = max_bytes, {}
        self.parts, self.deferred = [], []
        self.in_style, self.skip_script = False, False

    def local_path(self, url, directory):
        split = urlsplit(url)
        if split.scheme or split.netloc:
            raise BundleError('Download runtime resources locally first: ' + split.scheme + ' resource')
        target = (directory / unquote(split.path)).resolve()
        if not target.is_relative_to(self.root):
            raise BundleError('Resource escapes --root: ' + url)
        if not target.is_file():
            raise BundleError('Missing resource: ' + url)
        if target.stat().st_size == 0 or target.stat().st_size > self.max_bytes:
            raise BundleError('Empty or oversized resource: ' + url)
        return target, split.fragment

    def read(self, url, directory):
        target, fragment = self.local_path(url, directory)
        data = target.read_bytes()
        mime = {'.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.otf':'font/otf', '.svg':'image/svg+xml'}.get(target.suffix.lower(), mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
        self.assets[target.relative_to(self.root).as_posix()] = {
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'mimeType': mime,
        }
        return target, data, mime, fragment

    def url(self, value, directory):
        if not value or value.startswith(('data:', '#')):
            return value
        if value.startswith('blob:'):
            raise BundleError('A blob URL is not a persistent deliverable')
        _, data, mime, fragment = self.read(value, directory)
        return 'data:' + mime + ';base64,' + base64.b64encode(data).decode('ascii') + ('#' + fragment if fragment else '')

    def css(self, source, directory, trail=()):
        # Imports are expanded before url(), preserving their own directory base.
        pattern = r'@import\s+(?:url\(\s*[\"\']?([^\)\"\']+)[\"\']?\s*\)|[\"\']([^\"\']+)[\"\'])\s*([^;]*);'
        def imported(match):
            target, _, _, _ = self.read((match[1] or match[2]).strip(), directory)
            if target in trail:
                raise BundleError('Circular CSS import')
            media = match[3].strip()
            if re.search(r'\b(layer|supports)\b', media):
                raise BundleError('Use a CSS build tool for @import layer/supports')
            text = self.css(target.read_text(encoding='utf-8-sig'), target.parent, trail + (target,))
            return '@media ' + media + '{' + text + '}' if media else text
        source = re.sub(pattern, imported, source, flags=re.I)
        if re.search(r'@import\b', re.sub(r'/\*.*?\*/', '', source, flags=re.S), re.I):
            raise BundleError('Unsupported CSS import syntax')
        def rewrite(match):
            value = match[2] if match[1] else match[3].strip()
            return 'url("' + self.url(value, directory).replace('"', '%22') + '")'
        return re.sub(r'url\(\s*(?:([\"\'])(.*?)\1|([^)]*))\s*\)', rewrite, source, flags=re.I | re.S)

    @staticmethod
    def attrs(attrs):
        return ''.join(' ' + key + ('' if value is None else '="' + escape(value, quote=True) + '"') for key, value in attrs.items())

    def script(self, text):
        # Escaping a slash changes tagged-template raw values. Encode the whole
        # classic script instead when HTML could interpret an end delimiter.
        if re.search(r'</script', text, flags=re.I):
            encoded = base64.b64encode(text.encode('utf-8')).decode('ascii')
            return '<script src="data:text/javascript;charset=utf-8;base64,' + encoded + '"></script>'
        return '<script>' + text + '</script>'

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        directory = self.source.parent
        if tag == 'meta' and values.get('http-equiv', '').lower() == 'content-security-policy':
            raise BundleError('CSP needs a project-aware build; do not weaken it for packaging')
        if tag == 'link' and values.get('rel', '').lower() == 'stylesheet':
            target, _, _, _ = self.read(values.get('href', ''), directory)
            css = self.css(target.read_text(encoding='utf-8-sig'), target.parent, (target,))
            if '</style' in css.lower():
                raise BundleError('Stylesheet contains an HTML closing delimiter')
            preserved = {k:v for k,v in values.items() if k in ('media', 'nonce', 'title')}
            self.parts.append('<style' + self.attrs(preserved) + '>' + css + '</style>')
            return
        if tag == 'script':
            if values.get('type', '').lower() == 'module' or 'async' in values:
                raise BundleError('Use the project bundler for modules/async scripts')
            if 'src' in values:
                if values.get('type', '').lower() not in ('', 'text/javascript', 'application/javascript'):
                    raise BundleError('Unsupported script type')
                target, _, _, _ = self.read(values['src'], directory)
                text = target.read_text(encoding='utf-8-sig')
                if re.search(r'\bimport\s*(?:\(|\{|[\"\'])|\bexport\s+(?:default|const|function)', text):
                    raise BundleError('Use the project bundler for JavaScript imports')
                if 'defer' in values:
                    self.deferred.append(self.script(text))
                else:
                    self.parts.append(self.script(text))
                self.skip_script = True
                return
        if tag in ('iframe', 'object', 'embed') and any(key in values for key in ('src','data')):
            raise BundleError('Nested documents require a project-aware build')
        if tag == 'use' and values.get('href', values.get('xlink:href', '')).split('#')[0]:
            raise BundleError('External SVG use requires an explicit compatible export')
        for key in ('src', 'poster'):
            if key in values:
                values[key] = self.url(values[key], directory)
        if tag == 'link' and 'href' in values and values.get('rel', '').lower() in ('icon', 'preload'):
            values['href'] = self.url(values['href'], directory)
        if 'srcset' in values:
            if 'data:' in values['srcset']:
                raise BundleError('Data srcset needs a project-aware parser')
            candidates = []
            for item in values['srcset'].split(','):
                match = re.fullmatch(r'\s*(\S+)(?:\s+(\d+(?:\.\d+)?[wx]))?\s*', item)
                if not match:
                    raise BundleError('Unsupported srcset syntax')
                candidates.append(self.url(match[1], directory) + (' ' + match[2] if match[2] else ''))
            values['srcset'] = ', '.join(candidates)
        if 'style' in values:
            values['style'] = self.css(values['style'], directory)
        self.parts.append('<' + tag + self.attrs(values) + '>')
        if tag == 'style':
            self.in_style = True

    def handle_endtag(self, tag):
        if tag == 'script' and self.skip_script:
            self.skip_script = False
            return
        if tag == 'body':
            self.parts.extend(self.deferred)
            self.deferred.clear()
        self.parts.append('</' + tag + '>')
        if tag == 'style':
            self.in_style = False

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in ('img','source','link','meta','input','br','hr'):
            self.handle_endtag(tag)

    def handle_data(self, text):
        if not self.skip_script:
            self.parts.append(self.css(text, self.source.parent) if self.in_style else text)

    def handle_entityref(self, name): self.parts.append('&' + name + ';')
    def handle_charref(self, name): self.parts.append('&#' + name + ';')
    def handle_comment(self, data): self.parts.append('<!--' + data + '-->')
    def handle_decl(self, decl): self.parts.append('<!' + decl + '>')

def bundle(source, output, root=None, manifest_path=None):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output:
        raise BundleError('Keep the editable source; choose a different output')
    parser = Bundler(source, Path(root).resolve() if root else source.parent)
    parser.feed(source.read_text(encoding='utf-8-sig'))
    parser.close()
    parser.parts.extend(parser.deferred)
    result = ''.join(parser.parts)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(result, encoding='utf-8')
    report = {'status':'bundled_unverified', 'requiresRuntimeAndVisualReview':True, 'assets':parser.assets, 'htmlBytes':len(result.encode())}
    destination = Path(manifest_path) if manifest_path else output.with_suffix('.manifest.json')
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source'); p.add_argument('--output', required=True); p.add_argument('--root'); p.add_argument('--manifest')
    a = p.parse_args()
    try:
        report = bundle(a.source, a.output, a.root, a.manifest)
        print(json.dumps({'status':report['status'], 'assets':len(report['assets']), 'htmlBytes':report['htmlBytes']}))
    except (OSError, UnicodeError, BundleError) as error:
        p.exit(1, 'Bundle failed: ' + str(error) + '\n')

if __name__ == '__main__': main()
