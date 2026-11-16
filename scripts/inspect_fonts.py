#!/usr/bin/env python3
"""Inspect SFNT font identities in project, user and system font directories.
No installing, copying or embedding. fsType is metadata, not a license verdict.
"""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import struct

def inspect(path):
    data = Path(path).read_bytes()
    if data[:4] == b'ttcf':
        count = struct.unpack_from('>I',data,8)[0]
        offsets = struct.unpack_from('>'+str(count)+'I',data,12)
    elif data[:4] in (b'OTTO',b'\x00\x01\x00\x00',b'true'):
        offsets = (0,)
    else:
        raise ValueError('Unsupported container; use fontTools for WOFF/WOFF2')
    rows=[]
    for index,origin in enumerate(offsets):
        count = struct.unpack_from('>H',data,origin+4)[0]
        tables={}
        for i in range(count):
            tag,_,offset,length=struct.unpack_from('>4sIII',data,origin+12+i*16)
            tables[tag.decode('ascii')]=(offset,length)
        start,_=tables['name'];_,count,strings=struct.unpack_from('>HHH',data,start);names={}
        for i in range(count):
            plat,encoding,language,key,length,offset=struct.unpack_from('>HHHHHH',data,start+6+i*12)
            if key not in (1,2,4,5,6,16,17):continue
            raw=data[start+strings+offset:start+strings+offset+length]
            try:value=raw.decode('utf-16-be' if plat in (0,3) else 'mac_roman')
            except UnicodeError:continue
            names.setdefault(str(key),set()).add(value)
        os2=tables.get('OS/2');head=tables.get('head')
        rows.append({'faceIndex':index,'names':{k:sorted(v) for k,v in names.items()},
                     'weightClass':struct.unpack_from('>H',data,os2[0]+4)[0] if os2 else None,
                     'embeddingFlags':struct.unpack_from('>H',data,os2[0]+8)[0] if os2 else None,
                     'unitsPerEm':struct.unpack_from('>H',data,head[0]+18)[0] if head else None})
    return rows

def roots(project):
    project=Path(project).resolve();dirs=[project/'fonts',project/'assets/fonts',project/'public/fonts']
    if platform.system()=='Darwin':dirs += [Path.home()/'Library/Fonts',Path('/Library/Fonts'),Path('/System/Library/Fonts')]
    elif platform.system()=='Windows':
        import os
        dirs += [Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts',Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'Microsoft/Windows/Fonts']
    else:dirs += [Path.home()/'.local/share/fonts',Path.home()/'.fonts',Path('/usr/share/fonts'),Path('/usr/local/share/fonts')]
    return dirs

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',default='.');p.add_argument('--search-dir',action='append');p.add_argument('--family',action='append',required=True);p.add_argument('--out');p.add_argument('--max-files',type=int,default=1500);a=p.parse_args()
    dirs=[Path(d) for d in a.search_dir] if a.search_dir else roots(a.project)
    queries=[q.casefold().replace(' ','') for q in a.family];found=[];errors=[];seen=set();scanned=0;limited=False
    for directory in dirs:
        if not directory.is_dir():continue
        for path in sorted(directory.rglob('*')):
            if path.suffix.lower() not in ('.ttf','.otf','.ttc','.woff','.woff2') or not path.is_file():continue
            resolved=path.resolve()
            if resolved in seen:continue
            seen.add(resolved)
            if scanned>=a.max_files:limited=True;break
            scanned+=1
            try:
                faces=inspect(path)
                matches=[row for row in faces if any(q in ' '.join(value for values in row['names'].values() for value in values).casefold().replace(' ','') for q in queries)]
                if matches:found.append({'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'faces':matches})
            except (OSError,ValueError,KeyError,struct.error) as error:errors.append({'file':path.name,'error':str(error)})
        if limited:break
    report={'searchedDirectories':[str(d) for d in dirs],'filesScanned':scanned,'scanLimited':limited,'matches':found,'unreadableOrUnsupported':errors,
            'note':'No match does not prove absence when scan is limited or containers cannot be read. Font names/embeddingFlags do not establish redistribution rights.'}
    text=json.dumps(report,ensure_ascii=False,indent=2)
    if a.out:
        Path(a.out).write_text(text,encoding='utf-8')
        print(json.dumps({'filesScanned':scanned,'matchedFiles':len(found),'scanLimited':limited,'unsupportedOrUnreadable':len(errors),'report':a.out},ensure_ascii=False))
    else:print(text)

if __name__=='__main__':main()
