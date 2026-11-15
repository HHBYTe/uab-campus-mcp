import assert from "node:assert/strict";
import test from "node:test";

import { decodeEntities, htmlToText } from "../src/text.js";

test("decodeEntities decodes named and numeric entities", () => {
  assert.equal(decodeEntities("Architecture &amp; Costs &#8211; &#x41;"), "Architecture & Costs – A");
  assert.equal(decodeEntities(undefined), undefined);
});

test("htmlToText produces compact text", () => {
  assert.equal(htmlToText("<p>Hello <strong>world</strong></p><p></p>"), "Hello world");
  assert.equal(htmlToText("<p></p>"), undefined);
});
