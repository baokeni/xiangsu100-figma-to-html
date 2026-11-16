import base64
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
def module(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/f'{name}.py');result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

bundle=module('bundle_html');fonts=module('inspect_fonts');compare=module('compare_screenshots');packages=module('package_skill')

class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)/'project';self.root.mkdir();(self.root/'css/nested').mkdir(parents=True);(self.root/'assets').mkdir();self.source=self.root/'source.html';self.output=self.root/'standalone.html'
    def tearDown(self):self.temp.cleanup()
    def write(self,path,text):
        p=self.root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8');return p
    def test_nested_css_font_asset_and_deferred_order(self):
        svg=b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6"><path d="M0 .5H10" stroke="red"/></svg>'
        (self.root/'assets/icon.svg').write_bytes(svg);font=b'synthetic-font-bytes';(self.root/'assets/demo.woff2').write_bytes(font)
        self.write('css/style.css','@import "nested/tokens.css"; .icon{background:url(../assets/icon.svg)}')
        self.write('css/nested/tokens.css','@font-face{font-family:Demo;src:url(../../assets/demo.woff2)}')
        self.write('app.js','document.querySelector("#button").disabled=true;')
        self.write('source.html','<!doctype html><html><head><link rel="stylesheet" href="css/style.css"><script defer src="app.js"></script></head><body><button id="button">Go</button><img src="assets/icon.svg"></body></html>')
        report=bundle.bundle(self.source,self.output,self.root);text=self.output.read_text()
        self.assertIn(base64.b64encode(svg).decode(),text);self.assertIn(base64.b64encode(font).decode(),text)
        self.assertLess(text.index('<button'),text.index('document.querySelector'));self.assertNotIn('defer src',text)
        self.assertIn('assets/demo.woff2',report['assets']);self.assertEqual(report['assets']['assets/demo.woff2']['mimeType'],'font/woff2')
        self.assertEqual((self.root/'assets/icon.svg').read_bytes(),svg);self.assertEqual(report['status'],'bundled_unverified')
    def test_missing_image_is_an_error_and_does_not_write_output(self):
        self.write('source.html','<img src="missing.png">')
        with self.assertRaisesRegex(bundle.BundleError,'Missing'):bundle.bundle(self.source,self.output,self.root)
        self.assertFalse(self.output.exists())
    def test_escape_and_symlink_are_rejected(self):
        outside=Path(self.temp.name)/'outside.svg';outside.write_text('<svg/>')
        for url in ['../outside.svg','assets/link.svg']:
            if 'link' in url:(self.root/url).symlink_to(outside)
            self.write('source.html',f'<img src="{url}">')
            with self.assertRaisesRegex(bundle.BundleError,'escapes'):bundle.bundle(self.source,self.output,self.root)
    def test_modules_and_csp_are_not_silently_weakened(self):
        for source in ['<script type="module" src="app.js"></script>','<meta http-equiv="Content-Security-Policy" content="default-src self">']:
            self.write('source.html',source)
            with self.assertRaises(bundle.BundleError):bundle.bundle(self.source,self.output,self.root)
    def test_remote_runtime_dependency_is_not_fetched(self):
        self.write('source.html','<img src="https://example.invalid/image.png">')
        with self.assertRaisesRegex(bundle.BundleError,'locally'):bundle.bundle(self.source,self.output,self.root)
    def test_input_is_preserved(self):
        self.write('source.html','<p>original</p>')
        with self.assertRaisesRegex(bundle.BundleError,'editable source'):bundle.bundle(self.source,self.source,self.root)
        self.assertEqual(self.source.read_text(),'<p>original</p>')
    def test_srcset_and_svg_fragment(self):
        self.write('assets/s.svg','<svg width="1" height="1"/>')
        self.write('source.html','<img src="assets/s.svg#symbol" srcset="assets/s.svg 1x, assets/s.svg 2x">')
        bundle.bundle(self.source,self.output,self.root);text=self.output.read_text();self.assertIn('#symbol',text);self.assertIn(' 2x',text)

    def test_script_end_tag_variants_do_not_close_inlined_script(self):
        from html.parser import HTMLParser
        class Scripts(HTMLParser):
            def __init__(self): super().__init__();self.scripts=[];self.current=None;self.sources=[]
            def handle_starttag(self, tag, attrs):
                if tag=='script':self.current='';self.sources.append(dict(attrs).get('src'))
            def handle_data(self, value):
                if self.current is not None:self.current+=value
            def handle_endtag(self, tag):
                if tag=='script':self.scripts.append(self.current);self.current=None
        self.write('app.js','window.values=["</SCRIPT>","</ScRiPt>","</script>"];window.finished=true;')
        self.write('source.html','<script src="app.js"></script>')
        bundle.bundle(self.source,self.output,self.root);parsed=Scripts();parsed.feed(self.output.read_text())
        self.assertEqual(len(parsed.scripts),1)
        self.assertEqual(base64.b64decode(parsed.sources[0].split(',',1)[1]),(self.root/'app.js').read_bytes())
        self.assertEqual(parsed.scripts[0],'')

class FontTests(unittest.TestCase):
    def test_internal_name_and_real_weight_without_using_file_name(self):
        values=[(1,'Demo Family'),(2,'Regular'),(5,'Version 2'),(6,'Demo-Regular')];strings=b'';records=[]
        for key,text in values:
            raw=text.encode('utf-16-be');records.append(struct.pack('>6H',3,1,0x409,key,len(raw),len(strings)));strings+=raw
        name=struct.pack('>3H',0,len(records),6+12*len(records))+b''.join(records)+strings
        os2=bytearray(10);struct.pack_into('>H',os2,4,500);struct.pack_into('>H',os2,8,4)
        head=bytearray(20);struct.pack_into('>H',head,18,1000)
        blocks=[(b'name',name),(b'OS/2',bytes(os2)),(b'head',bytes(head))];offset=12+16*len(blocks);directory=[];payload=b''
        for tag,data in blocks:directory.append(struct.pack('>4sIII',tag,0,offset,len(data)));payload+=data;offset+=len(data)
        font=b'\x00\x01\x00\x00'+struct.pack('>4H',len(blocks),0,0,0)+b''.join(directory)+payload
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'unrelated-file-name.ttf';p.write_bytes(font);row=fonts.inspect(p)[0]
        self.assertIn('Demo Family',row['names']['1']);self.assertEqual(row['weightClass'],500);self.assertEqual(row['embeddingFlags'],4)

class CompareTests(unittest.TestCase):
    def test_transparent_hidden_rgb_requires_background_and_does_not_create_false_difference(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);a=root/'a.png';b=root/'b.png'
            Image.new('RGBA',(4,3),(255,0,0,0)).save(a);Image.new('RGBA',(4,3),(0,0,255,0)).save(b)
            with self.assertRaisesRegex(ValueError,'background'):compare.compare(a,b,root/'missing')
            self.assertFalse((root/'missing').exists())
            report=compare.compare(a,b,root/'out',background='#ffffff')
            self.assertEqual(report['meanAbsoluteChannelDifference'],0)
            with Image.open(root/'out/overlay-50.png')as image:
                self.assertEqual(image.getpixel((0,0)),(255,255,255));self.assertIn('icc_profile',image.info)
            self.assertEqual(Image.open(a).getpixel((0,0)),(255,0,0,0))

    def test_partial_alpha_and_icc_are_preserved_before_common_background_composite(self):
        from PIL import Image,ImageCms
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);a=root/'a.png';b=root/'b.png';icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
            Image.new('RGBA',(4,3),(255,0,0,128)).save(a,icc_profile=icc)
            Image.new('RGB',(4,3),(255,127,127)).save(b,icc_profile=icc)
            report=compare.compare(a,b,root/'out',background='#ffffff');self.assertEqual(report['meanAbsoluteChannelDifference'],0)
            self.assertTrue(report['alpha']['reference']);self.assertFalse(report['alpha']['render'])
            with self.assertRaises(ValueError):compare.compare(a,b,root/'bad',background='transparent')

    def test_overlay_uses_equal_weights_without_resizing(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);a=root/'a.png';b=root/'b.png'
            Image.new('RGB',(3,2),(0,40,100)).save(a);Image.new('RGB',(3,2),(200,80,0)).save(b)
            report=compare.compare(a,b,root/'out')
            with Image.open(root/'out/overlay-50.png') as overlay:
                self.assertEqual(overlay.size,(3,2));self.assertEqual(overlay.getpixel((0,0)),(100,60,50))
            self.assertEqual(report['overlay']['referenceWeight'],0.5)
            with Image.open(a) as original:self.assertEqual(original.getpixel((0,0)),(0,40,100))

    def test_color_profile_and_dimensions_are_not_ignored(self):
        try:from PIL import Image,ImageCms
        except ImportError:self.skipTest('Pillow is not installed')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);a=root/'a.png';b=root/'b.png';icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes();Image.new('RGB',(8,8),(20,40,60)).save(a,icc_profile=icc);Image.new('RGB',(8,8),(20,40,60)).save(b)
            report=compare.compare(a,b,root/'out');self.assertEqual(report['meanAbsoluteChannelDifference'],0);self.assertTrue(report['requiresVisualReview']);self.assertIn('sRGB',report['profiles']['reference']);self.assertEqual(report['status'],'diagnostics_only')
            Image.new('RGB',(9,8)).save(b)
            with self.assertRaisesRegex(ValueError,'Pixel grids differ'):compare.compare(a,b,root/'out2')
            with self.assertRaisesRegex(ValueError,'Untagged'):compare.compare(a,b,root/'out3','reject')

class PackageTests(unittest.TestCase):
    def test_archive_manifest_matches_extracted_sources_and_excludes_artifacts(self):
        import zipfile,hashlib
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp)/'skill';root.mkdir()
            for name in packages.TOP:(root/name).write_text('test document')
            (root/'SKILL.md').write_text('---\nname: synthetic-skill\nmetadata:\n  version: 1.2.3\n---\n')
            (root/'scripts').mkdir();(root/'scripts/helper.py').write_text('print(1)')
            (root/'scripts/__pycache__').mkdir();(root/'scripts/__pycache__/bad.py').write_text('ignore')
            (root/'private').mkdir();(root/'private/design.png').write_bytes(b'private')
            output=Path(tmp)/'delivery.zip';report=packages.package(root,output)
            with zipfile.ZipFile(output)as archive:
                manifest=json.loads(archive.read('synthetic-skill/package-manifest.json'))
                self.assertEqual(manifest['version'],'1.2.3')
                for row in manifest['files']:
                    data=archive.read('synthetic-skill/'+row['path']);self.assertEqual(data,(root/row['path']).read_bytes());self.assertEqual(hashlib.sha256(data).hexdigest(),row['sha256'])
                self.assertFalse(any('private' in name or '__pycache__'in name for name in archive.namelist()))
            self.assertFalse(report['published'])
            before=output.read_bytes();packages.package(root,output);self.assertEqual(before,output.read_bytes())
            with self.assertRaisesRegex(ValueError,'outside'):packages.package(root,root/'bad.zip')

    def test_package_does_not_follow_linked_source(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp)/'skill';root.mkdir()
            for name in packages.TOP:(root/name).write_text('doc')
            (root/'SKILL.md').write_text('name: synthetic-skill\nmetadata:\n  version: 1.2.3\n')
            outside=Path(tmp)/'outside.md';outside.write_text('external')
            (root/'README.md').unlink();(root/'README.md').symlink_to(outside)
            with self.assertRaisesRegex(ValueError,'linked'):packages.package(root,Path(tmp)/'bad.zip')

if __name__=='__main__':unittest.main()
