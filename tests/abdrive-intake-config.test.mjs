import test from 'node:test';
import assert from 'node:assert/strict';
import {intakeConfig} from '../server/abdrive/intake-config.mjs';
const complete={ABDRIVE_TELEGRAM_BOT_TOKEN:'test-token',ABDRIVE_TELEGRAM_CHAT_ID:'123',ABDRIVE_CONSENT_VERSION:'operator-v1'};
test('lead intake needs all own dependencies and cannot inherit BY Telegram credentials',()=>{
 assert.equal(intakeConfig(complete,'Published operator policy').enabled,true);
 for(const key of Object.keys(complete)){
  const incomplete={...complete};delete incomplete[key];assert.equal(intakeConfig(incomplete,'Published operator policy').enabled,false,key);
 }
 for(const document of [null,'','   '])assert.equal(intakeConfig(complete,document).enabled,false);
 assert.equal(intakeConfig({...complete,ABDRIVE_TELEGRAM_CHAT_ID:'oops'},'Policy').enabled,false);
 const legacy={TELEGRAM_BOT_TOKEN:'legacy',TELEGRAM_CHAT_ID:'123',ABDRIVE_CONSENT_VERSION:'v1'};
 assert.equal(intakeConfig(legacy,'Policy').enabled,false);
 assert.equal(intakeConfig(legacy,'Policy').consentVersion,null);
});
