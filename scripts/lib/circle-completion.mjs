// Owner policy: one source round may defer up to 100 individual cards.
// This allowance never covers an interrupted walk, a stop or a failed write.
export const CIRCLE_PROBLEM_LIMIT = 100;
export const withinCircleProblemLimit = count => Number.isSafeInteger(count)
  && count >= 0 && count <= CIRCLE_PROBLEM_LIMIT;

export function canCompleteWithProblems({ problems, unattempted = 0, stopped = false, incompleteLists = false, writeFailed = 0 }) {
  return withinCircleProblemLimit(problems) && unattempted === 0
    && !stopped && !incompleteLists && writeFailed === 0;
}

export const encarImportReadFailures = report => Object.entries(report?.rejectedByReason || {})
  .filter(([reason]) => /^(?:detail request failed|detail error:)/.test(reason))
  .reduce((sum, [, count]) => sum + count, 0);
