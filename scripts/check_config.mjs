/** Strict data-only check configuration. Unknown fields must never become a pass. */
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function object(value,keys,label){
  if(!plain(value))throw new Error(label+' must be an object');
  for(const key of Object.keys(value))if(!keys.includes(key))throw new Error(label+': unknown field '+key);
}
function string(value,label){if(typeof value!=='string'||!value.trim())throw new Error(label+' must be a nonempty string');}
function boolean(value,label){if(typeof value!=='boolean')throw new Error(label+' must be boolean');}
function number(value,label){if(typeof value!=='number'||!Number.isFinite(value))throw new Error(label+' must be finite');}
function fonts(values,label){
  if(!Array.isArray(values))throw new Error(label+' must be an array');
  for(const [i,font]of values.entries()){
    const name=label+'['+i+']';object(font,['selector','postScriptName','familyName','custom','allowFallback'],name);string(font.selector,name+'.selector');
    if(!font.postScriptName&&!font.familyName)throw new Error(name+' needs postScriptName or familyName');
    for(const key of ['postScriptName','familyName'])if(own(font,key))string(font[key],name+'.'+key);
    for(const key of ['custom','allowFallback'])if(own(font,key))boolean(font[key],name+'.'+key);
  }
}
function expectation(value,label){
  object(value,['selector','visible','text','disabled','scrollTop','scrollLeft','urlHash','urlIncludes','attributes','css','count','fullyVisible'],label);
  if(!['selector','urlHash','urlIncludes'].some(key=>own(value,key)))throw new Error(label+' needs selector or URL expectation');
  for(const key of ['selector','urlIncludes'])if(own(value,key))string(value[key],label+'.'+key);
  for(const key of ['text','urlHash'])if(own(value,key)&&typeof value[key]!=='string')throw new Error(label+'.'+key+' must be a string');
  const elementKeys=['visible','text','disabled','scrollTop','scrollLeft','attributes','css','count','fullyVisible'];
  if(!value.selector&&elementKeys.some(key=>own(value,key)))throw new Error(label+': element expectations need selector');
  for(const key of ['visible','disabled','fullyVisible'])if(own(value,key))boolean(value[key],label+'.'+key);
  for(const key of ['scrollTop','scrollLeft'])if(own(value,key))number(value[key],label+'.'+key);
  if(own(value,'count')&&(!Number.isInteger(value.count)||value.count<0))throw new Error(label+'.count must be a nonnegative integer');
  if(own(value,'count')&&value.count!==1&&elementKeys.filter(key=>key!=='count').some(key=>own(value,key)))throw new Error(label+': count != 1 must be a separate count-only expectation');
  if(value.visible===false&&['text','disabled','scrollTop','scrollLeft','attributes','css','fullyVisible'].some(key=>own(value,key)))throw new Error(label+': hidden expectation cannot assert visible element properties');
  for(const key of ['attributes','css'])if(own(value,key)){
    if(!plain(value[key])||!Object.keys(value[key]).length)throw new Error(label+'.'+key+' must be a nonempty object');
    for(const [name,wanted]of Object.entries(value[key])){
      if(!name.trim()||(key==='attributes'&&wanted!==null&&typeof wanted!=='string')||(key==='css'&&(typeof wanted!=='string'||!wanted.trim())))throw new Error(label+'.'+key+': invalid name or value');
    }
  }
}
export function validateConfig(config){
  object(config,['browser','fonts','interactions','captureFullPage','allowRemoteAssets','requirements'],'config');
  for(const key of ['captureFullPage','allowRemoteAssets'])if(own(config,key))boolean(config[key],'config.'+key);
  if(own(config,'browser')){object(config.browser,['channel','executablePath'],'browser');for(const [key,value]of Object.entries(config.browser))string(value,'browser.'+key);if(config.browser.channel&&config.browser.executablePath)throw new Error('Choose browser.channel or executablePath');}
  if(own(config,'fonts'))fonts(config.fonts,'fonts');
  if(own(config,'interactions')){
    if(!Array.isArray(config.interactions))throw new Error('interactions must be an array');
    for(const [i,action]of config.interactions.entries()){
      const label='interactions['+i+']';object(action,['name','action','selector','key','top','left','timeoutMs','expect','fonts','checkpoint'],label);
      string(action.selector,label+'.selector');if(!['click','press','scroll'].includes(action.action))throw new Error(label+': supported actions are click, press, scroll');
      if(own(action,'name'))string(action.name,label+'.name');
      if(action.action==='press')string(action.key,label+'.key');else if(own(action,'key'))throw new Error(label+'.key is only for press');
      for(const key of ['top','left'])if(own(action,key)){number(action[key],label+'.'+key);if(action.action!=='scroll')throw new Error(label+'.'+key+' is only for scroll');}
      if(own(action,'timeoutMs')){number(action.timeoutMs,label+'.timeoutMs');if(action.timeoutMs<=0)throw new Error(label+'.timeoutMs must be positive');}
      const expected=Array.isArray(action.expect)?action.expect:[action.expect];if(!expected.length)throw new Error(label+'.expect must not be empty');
      expected.forEach((value,j)=>expectation(value,label+'.expect['+j+']'));
      if(own(action,'fonts'))fonts(action.fonts,label+'.fonts');
      if(own(action,'checkpoint')){object(action.checkpoint,['name','reference'],label+'.checkpoint');if(!/^[a-zA-Z0-9_-]+$/.test(action.checkpoint.name??''))throw new Error(label+': invalid checkpoint name');if(own(action.checkpoint,'reference'))string(action.checkpoint.reference,label+'.checkpoint.reference');}
    }
  }
  if(own(config,'requirements')){
    object(config.requirements,['fonts','interactions'],'requirements');
    for(const [key,value]of Object.entries(config.requirements)){boolean(value,'requirements.'+key);if(value&&!config[key]?.length)throw new Error('Required '+key+' checks are not configured');}
  }
  return config;
}
