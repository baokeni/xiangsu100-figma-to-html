/** Synthetic regression only: not a Figma reconstruction or student trial. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {run} from '../scripts/verify_delivery.mjs';

function crc32(buffer){let crc=0xffffffff;for(const value of buffer){crc^=value;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function png(width,height){
 const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));return Buffer.concat([length,body,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const scan=Buffer.alloc((width*3+1)*height,255);for(let y=0;y<height;y++)scan[y*(width*3+1)]=0;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}

const root=await fs.mkdtemp(path.join(os.tmpdir(),'figma-skill-regression-'));
const here=path.dirname(fileURLToPath(import.meta.url));
try{
 await fs.mkdir(path.join(root,'assets'));await fs.writeFile(path.join(root,'assets/pixel.png'),png(1,1));await fs.writeFile(path.join(root,'reference.png'),png(360,640));
 await fs.writeFile(path.join(root,'style.css'),'body{margin:0;width:360px;min-height:640px;font:14px Arial}img{width:16px;height:16px}');
 await fs.writeFile(path.join(root,'app.js'),'const button=document.querySelector("#claim");button.addEventListener("click",()=>{button.textContent="Claimed";button.disabled=true;});');
 const source='<!doctype html><html><head><link rel="stylesheet" href="style.css"><script defer src="app.js"></script></head><body><h1 style="font-family:FigmaMissingRegressionFace,Arial,sans-serif">Font sample</h1><img src="assets/pixel.png"><button id="claim">Claim</button></body></html>';
 await fs.writeFile(path.join(root,'source.html'),source);
 execFileSync('python3',[path.join(here,'../scripts/bundle_html.py'),path.join(root,'source.html'),'--root',root,'--output',path.join(root,'standalone.html')],{stdio:'pipe'});
 const channel=process.argv.includes('--channel')?process.argv[process.argv.indexOf('--channel')+1]:null;
 const config={...(channel?{browser:{channel}}:{}),interactions:[{name:'deferred script and one-shot claim',action:'click',selector:'#claim',expect:{selector:'#claim',disabled:true,text:'Claimed'}}]};
 await fs.writeFile(path.join(root,'checks.json'),JSON.stringify(config));
 const common={reference:path.join(root,'reference.png'),width:360,height:640,dpr:1,mode:'standalone',project:process.cwd(),config:path.join(root,'checks.json')};
 const good=await run({...common,html:path.join(root,'standalone.html'),out:path.join(root,'good')});assert.equal(good.status,'automated_checks_passed',JSON.stringify(good.failures));assert.equal(good.visualReview,'pending');
 const broken=await run({...common,html:path.join(root,'source.html'),out:path.join(root,'broken')});assert.equal(broken.status,'failed');assert(broken.failures.some(f=>f.kind==='broken-image'));
 config.fonts=[{selector:'h1',postScriptName:'FigmaMissingRegressionFace'}];await fs.writeFile(path.join(root,'checks.json'),JSON.stringify(config));
 const fallback=await run({...common,html:path.join(root,'standalone.html'),out:path.join(root,'fallback')});assert.equal(fallback.status,'failed');assert(fallback.failures.some(f=>f.kind==='font-mismatch'));
  config.fonts=[];await fs.writeFile(path.join(root,'checks.json'),JSON.stringify(config));
  const grid=await run({...common,dpr:2,html:path.join(root,'standalone.html'),out:path.join(root,'grid')});assert.equal(grid.status,'failed');assert(grid.failures.some(f=>f.kind==='pixel-grid-mismatch'));
  config.interactions[0].expect.text='Claim';config.interactions[0].timeoutMs=100;await fs.writeFile(path.join(root,'checks.json'),JSON.stringify(config));
  const text=await run({...common,html:path.join(root,'standalone.html'),out:path.join(root,'exact-text')});assert.equal(text.status,'failed');assert(text.failures.some(f=>f.kind==='interaction'));
  // Multi-state path: scroll, overlay close/apply, route, return with state preserved.
  const flowHTML=`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;font:16px Arial}[hidden]{display:none!important}#results{height:200px;overflow:auto}#content{height:800px}#details{margin-top:160px}#panel{position:fixed;inset:100px 10px;background:white;border:1px solid}
  </style><section id="list"><button id="open">Filter</button><span id="badge">All</span><div id="results"><div id="content"><button id="details">Details</button></div></div></section>
  <section id="detail" hidden><h1 id="detail-title">Detail</h1><button id="back">Back</button><div id="late"></div></section>
  <div id="panel" hidden><button id="cancel">Cancel</button><button id="apply">Apply</button></div>
  <script>
  const byId=id=>document.getElementById(id);
  function route(){const detail=location.hash==='#detail';byId('list').hidden=detail;byId('detail').hidden=!detail;}
  if(!location.hash)location.hash='list';route();addEventListener('hashchange',route);
  byId('open').onclick=()=>byId('panel').hidden=false;
  byId('cancel').onclick=()=>byId('panel').hidden=true;
  byId('apply').onclick=()=>{byId('panel').hidden=true;byId('badge').textContent='Applied';};
  byId('details').onclick=()=>{location.hash='detail';};
  byId('back').onclick=()=>{location.hash='list';};
  </script>`;
  await fs.writeFile(path.join(root,'flow.html'),flowHTML);
  const steps=[
    {name:'scroll list',action:'scroll',selector:'#results',top:120,expect:{selector:'#results',scrollTop:120},checkpoint:{name:'list-scroll',reference:'reference.png'}},
    {name:'open overlay',action:'click',selector:'#open',expect:{selector:'#panel'},checkpoint:{name:'filter'}},
    {name:'cancel overlay',action:'click',selector:'#cancel',expect:{selector:'#panel',visible:false}},
    {name:'reopen overlay',action:'click',selector:'#open',expect:{selector:'#panel'}},
    {name:'apply filter',action:'click',selector:'#apply',expect:[{selector:'#panel',visible:false},{selector:'#badge',text:'Applied'}]},
    {name:'navigate detail',action:'click',selector:'#details',expect:{selector:'#detail-title',text:'Detail',urlHash:'#detail'},checkpoint:{name:'detail'}},
    {name:'return with scroll and filter',action:'click',selector:'#back',expect:[{selector:'#results',scrollTop:120,urlHash:'#list'},{selector:'#badge',text:'Applied'}],checkpoint:{name:'return'}}
  ];
  config.interactions=steps;await fs.writeFile(path.join(root,'checks.json'),JSON.stringify(config));
  const flow=await run({...common,html:path.join(root,'flow.html'),out:path.join(root,'flow')});assert.equal(flow.status,'automated_checks_passed',JSON.stringify(flow.failures));
  assert.equal(flow.interactions.length,21);assert.equal(flow.checks.filter(x=>x.checkpoint).length,12);
  for(const scenario of ['local-file','no-base-preview','isolated-file'])assert(flow.interactions.some(x=>x.scenario===scenario&&x.name==='return with scroll and filter'&&x.ok));
  config.interactions=steps.map(x=>({...x,timeoutMs:200}));config.interactions[6].expect=[{selector:'#badge',text:'Lost filter'}];
  await fs.writeFile(path.join(root,'checks.json'),JSON.stringify(config));
  const badBack=await run({...common,html:path.join(root,'flow.html'),out:path.join(root,'bad-back')});assert.equal(badBack.status,'failed');assert(badBack.interactions.some(x=>x.name==='return with scroll and filter'&&!x.ok));
  // A resource loaded only after a transition must not hide behind a healthy initial page.
  config.interactions=steps;await fs.writeFile(path.join(root,'checks.json'),JSON.stringify(config));
  await fs.writeFile(path.join(root,'late.html'),flowHTML.replace("location.hash='detail';};", "location.hash='detail';byId('late').innerHTML='<img src=missing-late.png>';};"));
  const late=await run({...common,html:path.join(root,'late.html'),out:path.join(root,'late')});assert.equal(late.status,'failed');assert(late.failures.some(x=>x.scenario.includes('step-6')&&x.kind==='broken-image'));
  // Directory links work locally but cannot qualify as a portable single HTML file.
  await fs.writeFile(path.join(root,'linked.html'),'<a id="next" href="detail.html">Next</a>');
  await fs.writeFile(path.join(root,'detail.html'),'<h1 id="linked-title">Linked detail</h1>');
  config.interactions=[{action:'click',selector:'#next',timeoutMs:200,expect:{selector:'#linked-title',text:'Linked detail'}}];await fs.writeFile(path.join(root,'checks.json'),JSON.stringify(config));
  const linked=await run({...common,html:path.join(root,'linked.html'),out:path.join(root,'linked')});assert.notEqual(linked.status,'automated_checks_passed');assert(linked.interactions.some(x=>x.scenario==='local-file'&&x.ok));assert(linked.interactions.some(x=>x.scenario!=='local-file'&&!x.ok));
  console.log(JSON.stringify({syntheticRegression:'passed',cases:['portable bundle and deferred interaction','relative-image failure detected','actual fallback font detected','DPR/reference pixel-grid mismatch detected','substring does not pass exact state assertion','7-step flow replayed in 3 opening modes with checkpoints','wrong return state detected','transition-only broken image detected','linked pages rejected as single-file delivery'],visualAcceptance:'not_performed'}));
}finally{await fs.rm(root,{recursive:true,force:true});}
