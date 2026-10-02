import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import traversePackage from '@babel/traverse';
const traverse = traversePackage.default;

// Moving page code to its own module must also move/import its mutable state.
// An unbound assignment passes the Vite build but throws on a filter transition.
test('deferred pages assign only declared or imported identifiers', () => {
  const ast = parse(readFileSync(new URL('../src/secondary-pages.jsx', import.meta.url), 'utf8'), { sourceType:'module', plugins:['jsx'] });
  const missing = [];
  const check = (path, target) => {
    if (target.isIdentifier() && !path.scope.hasBinding(target.node.name)) missing.push(`${target.node.name}:${target.node.loc.start.line}`);
  };
  traverse(ast, {
    AssignmentExpression(path) { check(path, path.get('left')); },
    UpdateExpression(path) { check(path, path.get('argument')); },
  });
  assert.deepEqual(missing, []);
});
