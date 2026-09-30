import test from 'node:test';
import assert from 'node:assert/strict';
import { getPricingState, getServerPricingState, subscribePricing, chooseDecreePricing, chooseQuotaPricing, restorePricingChoice } from '../src/pricing-state.js';
import { estimateLandedCost } from '../src/pricing.js';

test('one state drives switches, calculations and storage; server remains default', () => {
  const previous=globalThis.window;const values=new Map();let changes=0;
  const stop=subscribePricing(()=>changes++);
  const car={source:'Che168',chinaPrice:100000,year:2024,type:'Электромобиль'};
  try {
    globalThis.window={location:{search:''},localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}};
    restorePricingChoice();const normal=estimateLandedCost(car).totalUsd;
    chooseDecreePricing(true);assert.equal(getPricingState().refund50,true);
    assert.ok(estimateLandedCost(car).totalUsd<normal);
    const before=changes;chooseDecreePricing(true);assert.equal(changes,before);
    chooseQuotaPricing(true);assert.equal(getPricingState().quotaOver,false);
    assert.equal(estimateLandedCost(car).dutyUsd,0);
    assert.deepEqual(getServerPricingState(),{quotaOver:true,refund50:false});
    restorePricingChoice();assert.deepEqual(getPricingState(),{quotaOver:false,refund50:true});
    Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});
    assert.doesNotThrow(()=>chooseDecreePricing(false));assert.equal(getPricingState().refund50,false);
  } finally { stop();delete globalThis.window;restorePricingChoice();if(previous!==undefined)globalThis.window=previous; }
});
