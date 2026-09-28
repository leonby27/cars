import {pause} from './guazi-pilot-io.mjs';
export function isTransientGuaziError(error){
 if(error?.code==='SOURCE_BLOCKED')return false;
 if(error?.name==='TimeoutError'||['ECONNRESET','ETIMEDOUT','ECONNREFUSED','EAI_AGAIN','EPIPE','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(error?.code||error?.cause?.code))return true;
 const message=String(error?.message||'').split('\n')[0];
 return /\b(?:ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|EPIPE)\b|socket hang up|timed out|Timeout .*exceeded|net::ERR_(?:CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_TIMED_OUT|NETWORK_CHANGED)/i.test(message)||/^(?:Card|List)?\s*HTTP (?:408|500|502|503|504)$/.test(message);
}
export async function withGuaziRetries(operation,{attempts=3,wait=pause,onRetry=async()=>{},isRetryable=isTransientGuaziError,baseDelayMs=2000}={}){
 for(let attempt=1;attempt<=attempts;attempt++){
  try{return await operation();}
  catch(error){if(attempt===attempts||!isRetryable(error))throw error;const delayMs=baseDelayMs*2**(attempt-1);await onRetry({attempt,nextAttempt:attempt+1,delayMs,message:String(error.message).split('\n')[0]});await wait(delayMs);}
 }
}
