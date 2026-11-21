// Owner policy: each source has an allowance for individual cards.
// This allowance never covers an interrupted walk, a stop or a failed write.
export const CIRCLE_PROBLEM_LIMIT = 100;
export const CHE168_CIRCLE_PROBLEM_LIMIT = 1000;
export const withinCircleProblemLimit = (count, limit = CIRCLE_PROBLEM_LIMIT) => Number.isSafeInteger(count)
  && count >= 0 && count <= limit;

export function canCompleteWithProblems({ problems, problemLimit = CIRCLE_PROBLEM_LIMIT, unattempted = 0, stopped = false, incompleteLists = false, writeFailed = 0 }) {
  return withinCircleProblemLimit(problems, problemLimit) && unattempted === 0
    && !stopped && !incompleteLists && writeFailed === 0;
}

export const encarImportReadFailures = report => Object.entries(report?.rejectedByReason || {})
  .filter(([reason]) => /^(?:detail request failed|detail error:)/.test(reason))
  .reduce((sum, [, count]) => sum + count, 0);
