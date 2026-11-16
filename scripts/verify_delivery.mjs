#!/usr/bin/env node
/** Verify a local delivery and capture evidence; never certify visual parity. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {validateConfig} from './check_config.mjs';
import {inspectVisibleState} from './visible_state.mjs';

function args(argv) {
  const out={mode:'standalone',dpr:1};
  const allowed=['html','reference','width','height','out','mode','dpr','project','config'];
  for(let i=0;i<argv.length;i+=2){if(!argv[i].startsWith('--')||argv[i+1]===undefined)throw new Error('Use --option value');const key=argv[i].slice(2);if(!allowed.includes(key))throw new Error('Unknown option --'+key);out[key]=argv[i+1];}
  for(const key of ['html','reference','width','height','out'])if(!out[key])throw new Error('Missing --'+key);
  for(const key of ['width','height','dpr']){out[key]=Number(out[key]);if(!Number.isFinite(out[key])||out[key]<=0)throw new Error('Invalid '+key);}
  if(!Number.isInteger(out.width)||!Number.isInteger(out.height))throw new Error('Viewport width/height must be integers');
  if(!['standalone','folder'].includes(out.mode))throw new Error('Mode must be standalone or folder');
  return out;
}

export async function run(options) {
  const html=path.resolve(options.html),out=path.resolve(options.out),reference=path.resolve(options.reference);
  if(out===path.dirname(html))throw new Error('Use a dedicated verification output directory');
  await fs.access(html);await fs.access(reference);await fs.mkdir(out,{recursive:true});
  let config;
  try{config=validateConfig(options.config?JSON.parse(await fs.readFile(options.config,'utf8')):{});}
  catch(error){const blocked={status:'blocked',visualReview:'pending',requiresVisualReview:true,failures:[{kind:'configuration',error:String(error)}]};await fs.writeFile(path.join(out,'automated-report.json'),JSON.stringify(blocked,null,2));return blocked;}
  let playwright;
  try{const req=createRequire(path.join(path.resolve(options.project??path.dirname(html)),'package.json'));playwright=req('playwright');}
  catch{try{playwright=createRequire(import.meta.url)('playwright');}catch{throw new Error('Install playwright in the project; the skill does not install dependencies automatically');}}
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'figma-html-check-'));
  const report={status:'running',mode:options.mode,viewport:{width:options.width,height:options.height},dpr:options.dpr,captureMode:config.captureFullPage?'full-page':'viewport',
    sourceReference:path.basename(reference),requiresVisualReview:true,visualReview:'pending',checks:[],failures:[],requests:[],fontChecks:[],interactions:[],
    coverage:{fonts:config.fonts?.length?'configured':'not_configured',interactions:config.interactions?.length?'configured':'not_configured',visualReview:'pending',scope:'configured checks only; not design acceptance'},warnings:[],
    sourceSnapshot:{htmlSHA256:createHash('sha256').update(await fs.readFile(html)).digest('hex'),referenceSHA256:createHash('sha256').update(await fs.readFile(reference)).digest('hex'),note:'HTML/reference hashes do not cover external folder dependencies'}};
  for(const key of ['fonts','interactions'])if(report.coverage[key]==='not_configured')report.warnings.push(key+' checks are not configured');
  const expectations=(config.interactions??[]).flatMap(action=>Array.isArray(action.expect)?action.expect:[action.expect]);
  report.coverage.stateAssertions={attributes:expectations.reduce((n,item)=>n+Object.keys(item.attributes??{}).length,0),css:expectations.reduce((n,item)=>n+Object.keys(item.css??{}).length,0),counts:expectations.filter(item=>item.count!==undefined).length,visibleTextOrElements:expectations.filter(item=>item.fullyVisible===true||(item.text!==undefined&&item.fullyVisible!==false)).length,dataOnlyOptOuts:expectations.filter(item=>item.fullyVisible===false).length};
  if(report.coverage.stateAssertions.dataOnlyOptOuts)report.warnings.push('Some expectations explicitly skip visual text/geometry checks (fullyVisible:false)');
  let context;
  try {
    context=await playwright.chromium.launchPersistentContext(profile,{
      headless:true,chromiumSandbox:true,viewport:report.viewport,deviceScaleFactor:options.dpr,
      ...(config.browser?.channel?{channel:config.browser.channel}:{}),
      ...(config.browser?.executablePath?{executablePath:config.browser.executablePath}:{}),
    });
    async function inspect(page,label) {
      const failures=[];const requests=[];
      const onFailed=request=>failures.push({kind:'request',resource:path.basename(request.url().split('?')[0]),error:request.failure()?.errorText});
      const onError=error=>failures.push({kind:'javascript',error:String(error)});
      const onResponse=response=>{if(response.status()>=400)failures.push({kind:'http',status:response.status(),resource:response.url().split('?')[0]});};
      const onRequest=request=>{if(/^https?:/i.test(request.url()))requests.push({type:request.resourceType(),url:request.url().split('?')[0]});};
      page.on('requestfailed',onFailed);page.on('pageerror',onError);page.on('response',onResponse);page.on('request',onRequest);
      let finished;
      return {async finish(){
        if(finished)return finished;
        await page.evaluate(async()=>{
          await document.fonts.ready;
          await Promise.all([...document.images].map(img=>Promise.race([img.decode().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,5000))])));
        });
        const evidence=await page.evaluate(()=>({
          document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,innerWidth,innerHeight,devicePixelRatio},
          images:[...document.images].map(img=>{const r=img.getBoundingClientRect();return {node:img.closest('[data-node-id]')?.dataset.nodeId,source:img.getAttribute('src')?.startsWith('data:')?'embedded':img.getAttribute('src'),loaded:img.complete&&img.naturalWidth>0,natural:[img.naturalWidth,img.naturalHeight],rect:{x:r.x,y:r.y,width:r.width,height:r.height}};}),
          fonts:[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status})),
          cssResources:[...document.querySelectorAll('*')].flatMap(el=>['','::before','::after'].flatMap(pseudo=>{const style=getComputedStyle(el,pseudo||null);return ['backgroundImage','maskImage'].filter(key=>style[key]?.includes('url(')).map(key=>({node:el.getAttribute('data-node-id'),pseudo,property:key,value:style[key].replace(/data:[^)]*/g,'data:embedded')}));})),
        }));
        if(evidence.document.width>options.width)failures.push({kind:'overflow',width:evidence.document.width});
        for(const image of evidence.images)if(!image.loaded)failures.push({kind:'broken-image',source:image.source});
        if(requests.length&&!config.allowRemoteAssets)failures.push({kind:'remote-runtime-dependencies',count:requests.length});
        await fs.writeFile(path.join(out,label+'.json'),JSON.stringify(evidence,null,2));
        page.off('requestfailed',onFailed);page.off('pageerror',onError);page.off('response',onResponse);page.off('request',onRequest);
        report.requests.push(...requests.map(x=>({scenario:label,...x})));report.failures.push(...failures.map(x=>({scenario:label,...x})));
        report.checks.push({scenario:label,imageCount:evidence.images.length,brokenImages:evidence.images.filter(i=>!i.loaded).length});
        finished=evidence;return evidence;
      }};
    }
    async function checkGrid(render, source, label) {
      const a=await fs.readFile(source),b=await fs.readFile(render),signature=Buffer.from([137,80,78,71,13,10,26,10]);
      if(a.length>=24&&a.subarray(0,8).equals(signature)){
        const grids={reference:[a.readUInt32BE(16),a.readUInt32BE(20)],render:[b.readUInt32BE(16),b.readUInt32BE(20)]};
        report.checks.push({scenario:label,pixelGrids:grids});
        if(JSON.stringify(grids.reference)!==JSON.stringify(grids.render))report.failures.push({scenario:label,kind:'pixel-grid-mismatch',...grids});
      }else report.checks.push({scenario:label,status:'needs_comparison_helper',note:'Use compare_screenshots.py to check non-PNG dimensions'});
    }
    async function checkFonts(page, expectations, scenario) {
      if(!expectations?.length){report.checks.push({scenario,check:'actual-fonts',status:'not_configured'});return;}
      const cdp=await context.newCDPSession(page);
      try{
        await cdp.send('DOM.enable');await cdp.send('CSS.enable');const dom=await cdp.send('DOM.getDocument');
        for(const expected of expectations){
          if(!expected.postScriptName&&!expected.familyName)throw new Error('Each font expectation needs postScriptName or familyName');
          const found=await cdp.send('DOM.querySelectorAll',{nodeId:dom.root.nodeId,selector:expected.selector});
          if(found.nodeIds.length!==1){report.failures.push({scenario,kind:'font-selector-not-unique',selector:expected.selector});continue;}
          const actual=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId:found.nodeIds[0]})).fonts;
          const matches=actual.filter(f=>(!expected.postScriptName||f.postScriptName===expected.postScriptName)&&(!expected.familyName||f.familyName===expected.familyName)&&(expected.custom===undefined||f.isCustomFont===expected.custom));
          const ok=actual.length>0&&(expected.allowFallback?matches.length>0:matches.length===actual.length);
          report.fontChecks.push({scenario,selector:expected.selector,expected,actual,ok});
          if(!ok)report.failures.push({scenario,kind:'font-mismatch',selector:expected.selector});
        }
      }finally{await cdp.detach();}
    }
    async function expectState(page, expected, timeout=5000) {
      if(!expected||!['selector','urlHash','urlIncludes'].some(key=>expected[key]!==undefined))throw new Error('Each step needs an observable expectation');
      const target=expected.selector?page.locator(expected.selector):null;
      if(target&&expected.count===undefined){
        await target.waitFor({state:expected.visible===false?'hidden':'visible',timeout});
        if(expected.visible===false&&['text','disabled','scrollTop','scrollLeft'].some(key=>expected[key]!==undefined))throw new Error('Hidden expectation cannot assert visible state properties');
      }else if(!target&&['visible','text','disabled','scrollTop','scrollLeft'].some(key=>expected[key]!==undefined))throw new Error('Element expectations need a selector');
      const deadline=Date.now()+timeout;
      let details;
      do{
        const count=target?await target.count():null;
        const countMatches=!target||(expected.count===undefined?count===1||expected.visible===false:count===expected.count);
        const onlyCount=expected.count!==undefined&&!['visible','text','disabled','scrollTop','scrollLeft','attributes','css','fullyVisible'].some(key=>expected[key]!==undefined);
        let elementMatches=!target||expected.visible===false||onlyCount||(count===1&&(
          (expected.text===undefined||(await target.textContent())?.trim()===String(expected.text))&&
          (expected.disabled===undefined||await target.isDisabled()===expected.disabled)&&
          (expected.scrollTop===undefined||Math.abs(await target.evaluate(el=>el.scrollTop)-expected.scrollTop)<=1)&&
          (expected.scrollLeft===undefined||Math.abs(await target.evaluate(el=>el.scrollLeft)-expected.scrollLeft)<=1)));
        if(target&&count===1&&expected.visible!==false&&!onlyCount){
          if(!await target.isVisible())elementMatches=false;
          const state=await target.evaluate((el,wanted)=>{
            const attributes={};for(const key of Object.keys(wanted.attributes??{}))attributes[key]=el.getAttribute(key);
            const css={},normalized={};
            for(const [key,value]of Object.entries(wanted.css??{})){
              const property=key.startsWith('--')?key:key.replace(/[A-Z]/g,char=>'-'+char.toLowerCase());
              if(!CSS.supports(property,value))throw new Error('Unsupported CSS expectation: '+key+'='+value);
              css[key]=getComputedStyle(el).getPropertyValue(property).trim();
              // Normalize literal colors/units in the same parent; do not load expected URLs.
              if(/url\(/i.test(value)||property.startsWith('--'))normalized[key]=value.trim();
              else if(['display','position','visibility'].includes(property))normalized[key]=value.trim();
              else{const probe=document.createElement('span');probe.style.cssText='all:initial!important;position:fixed!important;display:none!important;pointer-events:none!important';probe.style.setProperty('color',getComputedStyle(el).color,'important');probe.style.setProperty('font-size',getComputedStyle(el).fontSize,'important');probe.style.setProperty(property,value,'important');el.parentElement.append(probe);normalized[key]=getComputedStyle(probe).getPropertyValue(property).trim();probe.remove();}
            }
            return {attributes,css,normalized};
          },expected);
          if(Object.entries(expected.attributes??{}).some(([key,value])=>state.attributes[key]!==value))elementMatches=false;
          if(Object.keys(expected.css??{}).some(key=>state.css[key]!==state.normalized[key]))elementMatches=false;
          const visual=(expected.fullyVisible===true||(expected.text!==undefined&&expected.fullyVisible!==false))?await target.evaluate(inspectVisibleState,{wholeElement:expected.fullyVisible===true}):null;
          if(visual&&!visual.ok)elementMatches=false;
          details={...state,visual};
        }
        if(target&&expected.visible===false&&count>0)elementMatches=count===1&&await target.isHidden();
        const url=new URL(page.url());
        if(countMatches&&elementMatches&&(expected.urlHash===undefined||url.hash===expected.urlHash)&&(expected.urlIncludes===undefined||page.url().includes(expected.urlIncludes)))return;
        await new Promise(resolve=>setTimeout(resolve,50));
      }while(Date.now()<deadline);
      const actual={urlHash:new URL(page.url()).hash,count:target?await target.count():null,details,...(target&&await target.count()===1&&expected.visible!==false?{text:(await target.textContent())?.trim(),disabled:await target.isDisabled(),scroll:await target.evaluate(el=>({top:el.scrollTop,left:el.scrollLeft}))}:{})};
      throw new Error('Expected state differs: '+JSON.stringify({expected,actual}));
    }
    async function journey(page, scenario) {
      const actions=config.interactions??[];
      if(!actions.length)report.checks.push({scenario,check:'interactions',status:'not_configured'});
      for(const [index,action] of actions.entries()){
        const label=`${scenario}-step-${index+1}`,check=await inspect(page,label);
        let failed=false;
        try{
          const locator=page.locator(action.selector);
          if(action.action==='click')await locator.click({timeout:action.timeoutMs??5000});
          else if(action.action==='press')await locator.press(action.key,{timeout:action.timeoutMs??5000});
          else if(action.action==='scroll')await locator.evaluate((el,position)=>el.scrollTo(position),{top:action.top??0,left:action.left??0,behavior:'instant'});
          else throw new Error('Supported actions: click, press, scroll');
          const expected=Array.isArray(action.expect)?action.expect:[action.expect];
          for(const state of expected)await expectState(page,state,action.timeoutMs??5000);
          await check.finish();
          if(action.fonts)await checkFonts(page,action.fonts,label);
          if(action.checkpoint){
            const name=action.checkpoint.name;
            if(!/^[a-zA-Z0-9_-]+$/.test(name??''))throw new Error('Checkpoint name must use letters, numbers, _ or -');
            const file=label+'-'+name+'.png';await page.screenshot({path:path.join(out,file),fullPage:config.captureFullPage??false,animations:'disabled'});
            const source=action.checkpoint.reference?path.resolve(path.dirname(path.resolve(options.config)),action.checkpoint.reference):null;
            if(source)await checkGrid(path.join(out,file),source,label);
            report.checks.push({scenario:label,checkpoint:file,sourceReference:source?path.basename(source):null,visualReview:'pending'});
          }
          report.interactions.push({scenario,name:action.name??action.selector,ok:true});
        }catch(error){
          failed=true;report.interactions.push({scenario,name:action.name??action.selector,ok:false,error:String(error)});
          report.failures.push({scenario,kind:'interaction',name:action.name??action.selector,error:String(error)});
        }finally{await check.finish();}
        // A failed step invalidates the rest of this path; do not report later states as visited.
        if(failed)break;
      }
    }
    const page=context.pages()[0];let check=await inspect(page,'local-file');
    await page.goto(pathToFileURL(html).href,{waitUntil:'load'});await check.finish();
    await page.screenshot({path:path.join(out,'render.png'),fullPage:config.captureFullPage??false,animations:'disabled'});
    await checkGrid(path.join(out,'render.png'),reference,'initial-grid');
    await checkFonts(page,config.fonts,'local-file');await journey(page,'local-file');
    if(options.mode==='standalone'){
      const source=await fs.readFile(html,'utf8'),preview=await context.newPage();
      // New about:blank intentionally has no useful directory base; replay the full configured path.
      check=await inspect(preview,'no-base-preview');await preview.setContent(source,{waitUntil:'load'});await check.finish();
      await checkFonts(preview,config.fonts,'no-base-preview');await journey(preview,'no-base-preview');
      const isolated=path.join(profile,'isolated-delivery');await fs.mkdir(isolated);const single=path.join(isolated,'page.html');await fs.copyFile(html,single);
      check=await inspect(preview,'isolated-file');await preview.goto(pathToFileURL(single).href,{waitUntil:'load'});await check.finish();
      await preview.screenshot({path:path.join(out,'isolated-render.png'),fullPage:config.captureFullPage??false,animations:'disabled'});
      await checkFonts(preview,config.fonts,'isolated-file');await journey(preview,'isolated-file');await preview.close();
    }else report.checks.push({scenario:'standalone-portability',status:'not_applicable',note:'Verify the unpacked directory; folder mode does not establish single-file portability'});
    report.status=report.failures.length?'failed':'automated_checks_passed';
    return report;
  }catch(error){report.status='blocked';report.failures.push({kind:'execution',error:String(error)});return report;}
  finally{
    if(context)await context.close();await fs.rm(profile,{recursive:true,force:true});
    await fs.writeFile(path.join(out,'automated-report.json'),JSON.stringify(report,null,2));
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const options=args(process.argv.slice(2));const report=await run(options);console.log(JSON.stringify({status:report.status,requiresVisualReview:report.requiresVisualReview,coverage:report.coverage,warnings:report.warnings,failures:report.failures},null,2));process.exitCode=report.status==='automated_checks_passed'?0:1;}
  catch(error){console.error(String(error));process.exitCode=1;}
}
