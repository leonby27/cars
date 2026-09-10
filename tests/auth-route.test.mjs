import test from "node:test";
import assert from "node:assert/strict";
import { isAuthEntryPath, preservesAuthScroll, resolveAuthRoute } from "../src/auth-route.js";

test("guest account entry keeps the vehicle behind sign-in", () => {
  for (const path of ["/account", "/favorites", "/searches", "/login", "/register"]) {
    const route = resolveAuthRoute(path, "/cars/12345", null, false);
    assert.equal(route.authModalOpen, true);
    assert.equal(route.contentPath, "/cars/12345");
    assert.equal(isAuthEntryPath(path), true);
  }
});
test("authenticated account entry renders the account", () => {
  const route = resolveAuthRoute("/account", "/cars/12345", { id: 1 }, false);
  assert.equal(route.contentPath, "/account");
  assert.equal(route.authModalOpen, false);
});
test("direct sign-in uses home and session loading does not open the modal", () => {
  for (const from of [undefined, "/account", "/login", "/orders/draft/123", "//external.test"]) {
    assert.equal(resolveAuthRoute("/login", from, null, false).contentPath, "/");
  }
  assert.equal(resolveAuthRoute("/account", "/cars/123", null, true).authModalOpen, false);
});


test("guest protected destinations preserve the page scroll behind sign-in", () => {
  for (const path of ["/account", "/favorites", "/searches"]) {
    assert.equal(preservesAuthScroll(path, null), true);
    assert.equal(preservesAuthScroll(path, { id: 1 }), false);
  }
});

test("sign-in tabs preserve scroll while ordinary page navigation resets it", () => {
  for (const user of [null, { id: 1 }]) {
    for (const path of ["/login", "/register"]) assert.equal(preservesAuthScroll(path, user), true);
    for (const path of ["/", "/cars/12345", "/catalog"]) assert.equal(preservesAuthScroll(path, user), false);
  }
});
