'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const engines=process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox'];
if(engines.some(name=>!['chromium','firefox','webkit'].includes(name)))throw Error('Choose chromium, firefox or webkit.');
const suites=['browser',...(process.env.GP_RUN_SMOKE==='1'?[]:['recovery.browser','interchange.browser'])];
for(const suite of suites){
  const result=spawnSync(process.execPath,[path.join(__dirname,'..','tests',suite+'.cjs'),...engines],{stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
