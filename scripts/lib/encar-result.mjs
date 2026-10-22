// A failed detail load is unavailable by owner policy; transport failures stay unknown.
export function encarOutcome({ status, detail, car, error, unverifiedUnavailable }, policyViolation = () => null) {
  if (error || ![200, 404].includes(status)) return { state: 'unknown', reason: 'unverified' };
  if (status === 404) return { state: 'unavailable', reason: unverifiedUnavailable ? 'source-unavailable' : 'not-found' };
  const state = detail?.advertisement?.status;
  if (state === 'SOLD') return { state: 'sold', reason: 'source-sold' };
  if (state === 'WAIT') return { state: 'hidden', reason: 'source-wait' };
  if (state === 'ADVERTISE') return car && !policyViolation(car)
    ? { state: 'active', reason: 'advertised' } : { state: 'hidden', reason: 'policy' };
  throw Object.assign(new Error(`Encar: неизвестный статус ${state}`), { code: 'ENCAR_INVALID_DETAIL', stage: 'parse' });
}

export function encarEvidence(result, outcome, checkedAt) {
  return { ...outcome, checkedAt, sourceState: result.detail?.advertisement?.status ?? null,
    source: result.availabilitySource || 'api-detail', apiStatus: result.apiStatus ?? result.status,
    publicStatus: result.publicStatus ?? null };
}

export const encarTemporaryStatus = status => Number.isFinite(status)
  && (status === 0 || [407, 408, 429].includes(status) || status >= 500);

export function encarSourceProblem(problems = []) {
  if (!problems.length || !problems.every(item => encarTemporaryStatus(item.status) || item.code === 'ENCAR_LIST_INCOMPLETE')) return {};
  return {
    failureCode: problems.every(item => item.code === 'ENCAR_LIST_INCOMPLETE') ? 'ENCAR_LIST_INCOMPLETE' : 'ENCAR_SOURCE_PARTIAL',
    failureStatus: problems.find(item => encarTemporaryStatus(item.status))?.status,
    failureStage: 'read',
  };
}

export function encarCanRetry(report) {
  if (report?.failureStage === 'parse' || report?.attempt?.parseFailed || report?.attempt?.writeFailed) return false;
  if (report?.failureCode === 'ENCAR_LIST_INCOMPLETE') return true;
  return ['ENCAR_UNAVAILABLE', 'ENCAR_LIST_FAILED', 'ENCAR_SOURCE_PARTIAL'].includes(report?.failureCode)
    && encarTemporaryStatus(report.failureStatus);
}
