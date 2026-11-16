#!/usr/bin/env python3
"""Build a local Skill ZIP and a versioned, hashed manifest; never publish."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

TOP = ('SKILL.md', 'README.md', 'CHANGELOG.md', 'VALIDATION.md', 'LICENSE', 'AGENTS.md')
DIRS = ('agents', 'references', 'scripts', 'tests')
EXTENSIONS = ('.md', '.py', '.mjs', '.json', '.yaml', '.yml')

def package(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output.is_relative_to(source):
        raise ValueError('Keep package output outside the Skill source directory')
    text = (source / 'SKILL.md').read_text(encoding='utf-8')
    name = re.search(r'^name:\s*([a-z0-9-]+)\s*$', text, re.M)
    version = re.search(r'^\s+version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$', text, re.M)
    if not name or not version:
        raise ValueError('SKILL.md needs name and metadata.version')
    files = [source / item for item in TOP]
    for directory in DIRS:
        files.extend(p for p in (source / directory).rglob('*') if p.is_file()
                     and not any(part.startswith('.') or part == '__pycache__' for part in p.relative_to(source).parts)
                     and p.suffix in EXTENSIONS)
    records, data = [], {}
    for path in sorted(set(files)):
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(source):
            raise ValueError('Missing, linked or external package source: ' + path.name)
        relative = path.relative_to(source).as_posix()
        payload = path.read_bytes(); data[relative] = payload
        records.append({'path': relative, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
    manifest = {'name': name[1], 'version': version[1], 'files': records,
                'note': 'Manifest excludes itself; ZIP digest is in the adjacent JSON report. Local build only.'}
    data['package-manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=8) as archive:
        for relative, payload in sorted(data.items()):
            info = zipfile.ZipInfo(name[1] + '/' + relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED; info.external_attr = 0o100644 << 16
            archive.writestr(info, payload)
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError('Archive integrity check failed')
        for row in records:
            payload = archive.read(name[1] + '/' + row['path'])
            if hashlib.sha256(payload).hexdigest() != row['sha256']:
                raise ValueError('Archive content differs from source')
    report = {'status': 'local_package_checked', 'name': name[1], 'version': version[1],
              'files': len(data), 'zipBytes': output.stat().st_size,
              'zipSHA256': hashlib.sha256(output.read_bytes()).hexdigest(), 'published': False}
    output.with_suffix('.package.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try: print(json.dumps(package(args.source, args.output), ensure_ascii=False))
    except (OSError, ValueError) as error: parser.exit(1, str(error) + '\n')

if __name__ == '__main__': main()
