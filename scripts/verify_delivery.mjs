#!/usr/bin/env node
/** Verify a local delivery and capture evidence; never certify visual parity. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

function args(argv) {
  const out={mode:'standalone',dpr:1};
  for(let i=0;i<argv.length;i+=2){if(!argv[i].startsWith('--')||argv[i+1]===undefined)throw new Error('Use --option value');out[argv[i].slice(2)]=argv[i+1];}
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
  const config=options.config?JSON.parse(await fs.readFile(options.config,'utf8')):{};
  let playwright;
  try{const req=createRequire(path.join(path.resolve(options.project??path.dirname(html)),'package.json'));playwright=req('playwright');}
  catch{try{playwright=createRequire(import.meta.url)('playwright');}catch{throw new Error('Install playwright in the project; the skill does not install dependencies automatically');}}
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'figma-html-check-'));
  const report={status:'running',mode:options.mode,viewport:{width:options.width,height:options.height},dpr:options.dpr,captureMode:config.captureFullPage?'full-page':'viewport',
    sourceReference:path.basename(reference),requiresVisualReview:true,visualReview:'pending',checks:[],failures:[],requests:[],fontChecks:[],interactions:[]};
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
      return {async finish(){
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
        return evidence;
      }};
    }
    const page=context.pages()[0];let check=await inspect(page,'local-file');
    await page.goto(pathToFileURL(html).href,{waitUntil:'load'});await check.finish();
    await page.screenshot({path:path.join(out,'render.png'),fullPage:config.captureFullPage??false,animations:'disabled'});
    const refBytes=await fs.readFile(reference),renderBytes=await fs.readFile(path.join(out,'render.png'));
    if(refBytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
      report.pixelGrids={reference:[refBytes.readUInt32BE(16),refBytes.readUInt32BE(20)],render:[renderBytes.readUInt32BE(16),renderBytes.readUInt32BE(20)]};
      if(JSON.stringify(report.pixelGrids.reference)!==JSON.stringify(report.pixelGrids.render))report.failures.push({kind:'pixel-grid-mismatch',...report.pixelGrids});
    }else report.checks.push({scenario:'reference-grid',status:'needs_comparison_helper',note:'PNG metadata not available; compare_screenshots.py must check dimensions'});
    // Reading declarations alone is not proof of the rendered font.
    if(config.fonts?.length){
      const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const dom=await cdp.send('DOM.getDocument');
      for(const expected of config.fonts){
        if(!expected.postScriptName&&!expected.familyName)throw new Error('Each font expectation needs postScriptName or familyName');
        const found=await cdp.send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:expected.selector});
        if(!found.nodeId){report.failures.push({kind:'font-selector-missing',selector:expected.selector});continue;}
        const actual=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId:found.nodeId})).fonts;
        const matches=actual.filter(f=>(!expected.postScriptName||f.postScriptName===expected.postScriptName)&&(!expected.familyName||f.familyName===expected.familyName)&&(!expected.custom||f.isCustomFont));
        const ok=actual.length>0&&(expected.allowFallback?matches.length>0:matches.length===actual.length);report.fontChecks.push({selector:expected.selector,expected,actual,ok});
        if(!ok)report.failures.push({kind:'font-mismatch',selector:expected.selector});
      }
      await cdp.detach();
    }else report.checks.push({scenario:'actual-fonts',status:'not_configured',note:'Inspect computed and actual fonts manually; fonts.loaded is not enough'});
    const dynamicError=error=>report.failures.push({kind:'interaction-javascript',error:String(error)});
    const dynamicResource=request=>report.failures.push({kind:'interaction-resource',resource:request.url().split('?')[0],error:request.failure()?.errorText});
    page.on('pageerror',dynamicError);page.on('requestfailed',dynamicResource);
    for(const action of config.interactions??[]){
      try{
        const locator=page.locator(action.selector);
        if(action.action==='click')await locator.click();
        else if(action.action==='press')await locator.press(action.key);
        else throw new Error('Supported actions: click, press');
        const target=page.locator(action.expect.selector);
        await target.waitFor({state:'visible',timeout:action.timeoutMs??5000});
        const deadline=Date.now()+(action.timeoutMs??5000);let matched=false;
        do{
          const textMatches=action.expect.text===undefined||(await target.textContent())?.trim()===String(action.expect.text);
          const disabledMatches=action.expect.disabled===undefined||await target.isDisabled()===action.expect.disabled;
          if(textMatches&&disabledMatches){matched=true;break;}
          await new Promise(resolve=>setTimeout(resolve,50));
        }while(Date.now()<deadline);
        if(!matched)throw new Error('Expected exact text or disabled state differs');
        report.interactions.push({name:action.name??action.selector,ok:true});
      }catch(error){report.interactions.push({name:action.name??action.selector,ok:false,error:String(error)});report.failures.push({kind:'interaction',name:action.name??action.selector,error:String(error)});}
    }
    page.off('pageerror',dynamicError);page.off('requestfailed',dynamicResource);
    if(options.mode==='standalone'){
      const source=await fs.readFile(html,'utf8'),preview=await context.newPage();
      // New about:blank document intentionally has no useful directory base.
      check=await inspect(preview,'no-base-preview');await preview.setContent(source,{waitUntil:'load'});await check.finish();
      const isolated=path.join(profile,'isolated-delivery');await fs.mkdir(isolated);const single=path.join(isolated,'page.html');await fs.copyFile(html,single);
      check=await inspect(preview,'isolated-file');await preview.goto(pathToFileURL(single).href,{waitUntil:'load'});await check.finish();
      await preview.screenshot({path:path.join(out,'isolated-render.png'),fullPage:config.captureFullPage??false,animations:'disabled'});await preview.close();
    }else report.checks.push({scenario:'standalone-portability',status:'not_applicable',note:'Folder mode does not establish single-file portability; verify the unpacked directory'});
    report.status=report.failures.length?'failed':'automated_checks_passed';
    return report;
  }catch(error){report.status='blocked';report.failures.push({kind:'execution',error:String(error)});return report;}
  finally{
    if(context)await context.close();await fs.rm(profile,{recursive:true,force:true});
    await fs.writeFile(path.join(out,'automated-report.json'),JSON.stringify(report,null,2));
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const options=args(process.argv.slice(2));const report=await run(options);console.log(JSON.stringify({status:report.status,requiresVisualReview:report.requiresVisualReview,failures:report.failures},null,2));process.exitCode=report.status==='automated_checks_passed'?0:1;}
  catch(error){console.error(String(error));process.exitCode=1;}
}
