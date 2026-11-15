import assert from "node:assert/strict";
import test from "node:test";

import { validBearerToken } from "../src/http-auth.js";

const secret = "a-secure-test-token-that-is-at-least-32-characters";

test("HTTP bearer authentication accepts only the configured token", () => {
  assert.equal(validBearerToken(`Bearer ${secret}`, secret), true);
  assert.equal(validBearerToken("Bearer wrong", secret), false);
  assert.equal(validBearerToken(undefined, secret), false);
  assert.equal(validBearerToken(`Basic ${secret}`, secret), false);
});
