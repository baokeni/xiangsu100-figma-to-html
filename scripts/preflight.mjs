#!/usr/bin/env node
/** Read local dependencies without installing, opening browsers or claiming Figma access. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const options={project:process.cwd(),python:'python3'};
try{
  for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i]?.slice(2);if(!process.argv[i].startsWith('--')||!['project','python','out'].includes(key)||process.argv[i+1]===undefined)throw new Error('Use --project, --python or --out with a value');options[key]=process.argv[i+1];}
  const report={node:process.version,python:null,playwright:null,figmaConnection:'agent_must_check',browserLaunch:'not_attempted',missing:[]};
  try{report.python=JSON.parse(execFileSync(options.python,['-c','import sys,json;from PIL import Image,ImageCms;import PIL;ImageCms.createProfile("sRGB");print(json.dumps({"version":sys.version.split()[0],"pillow":PIL.__version__,"icc":True}))'],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));const [major,minor]=report.python.version.split('.').map(Number);if(major<3||(major===3&&minor<9))report.missing.push('Python 3.9+');}
  catch{report.missing.push('Python 3.9+ with Pillow/ICC support');}
  try{const require=createRequire(path.join(path.resolve(options.project),'package.json')),pkg=require('playwright/package.json'),api=require('playwright');report.playwright={version:pkg.version,nodeRequirement:pkg.engines?.node??'check installed package',bundledExecutablePresent:await fs.access(api.chromium.executablePath()).then(()=>true,()=>false)};}
  catch{report.missing.push('Playwright resolvable from target project');}
  report.status=report.missing.length?'dependencies_missing':'local_dependencies_found';
  report.note='Browser channel availability, permissions and Figma tools require agent checks. No install/network/browser launch performed.';
  if(options.out){await fs.mkdir(path.dirname(path.resolve(options.out)),{recursive:true});await fs.writeFile(options.out,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));if(report.missing.length)process.exitCode=1;
}catch(error){console.error(String(error));process.exitCode=1;}
