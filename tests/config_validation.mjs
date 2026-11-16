import assert from 'node:assert/strict';
import {validateConfig} from '../scripts/check_config.mjs';
const action=expect=>({action:'click',selector:'#control',expect});
const valid=[{}, {requirements:{fonts:false,interactions:false}},
  {interactions:[action([{selector:'#chosen',count:2},{selector:'#control',text:'Saved',attributes:{'aria-pressed':'true','data-old':null},css:{backgroundColor:'black'},fullyVisible:true}])]},
  {fonts:[{selector:'#title',postScriptName:'Demo-Regular',custom:false}],requirements:{fonts:true}}];
for(const config of valid)assert.equal(validateConfig(config),config);
const invalid=[
  {captureFullpage:true}, {allowRemoteAssets:'yes'}, {browser:{headless:false}},
  {fonts:[{selector:'#title',postscriptName:'Typo'}]}, {requirements:{fonts:true}},
  {interactions:[{...action({selector:'#ok'}),force:true}]},
  {interactions:[action({selector:'#ok',style:{color:'red'}})]},
  {interactions:[action({selector:'#ok',attributes:{checked:true}})]},
  {interactions:[action({selector:'#ok',css:{color:42}})]},
  {interactions:[action({selector:'#ok',text:42})]},
  {interactions:[action({selector:'#ok',count:2,text:'ambiguous'})]},
  {interactions:[action({selector:'#ok',count:-1})]},
  {interactions:[action({selector:'#ok',visible:false,text:'hidden'})]},
  {interactions:[action([])]}, {interactions:[action({css:{color:'red'}})]},
  {interactions:[{action:'press',selector:'#ok',expect:{selector:'#ok'}}]}
];
for(const config of invalid)assert.throws(()=>validateConfig(config));
console.log(JSON.stringify({configurationCases:valid.length+invalid.length,status:'passed'}));
