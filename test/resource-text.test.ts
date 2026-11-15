import assert from "node:assert/strict";
import test from "node:test";

import { extractResourceText } from "../src/resource-text.js";

const encode = (value: string) => new TextEncoder().encode(value);

test("extractResourceText converts bounded HTML and marks it untrusted", async () => {
  const result = await extractResourceText(
    encode("<h1>Campus</h1><p>Hello <strong>world</strong>.</p><script>bad()</script>"),
    { filename: "page.html", mediaType: "text/html", maxChars: 20, maxPdfPages: 5 },
  );
  assert.equal(result.readable, true);
  assert.equal(result.contentIsUntrusted, true);
  assert.match(result.text ?? "", /Campus/i);
  assert.doesNotMatch(result.text ?? "", /bad/);
});

test("extractResourceText handles plain text limits and unsupported binaries", async () => {
  const text = await extractResourceText(
    encode("one two three"),
    { filename: "notes.txt", mediaType: "text/plain", maxChars: 7, maxPdfPages: 5 },
  );
  assert.equal(text.text, "one two");
  assert.equal(text.truncated, true);

  const binary = await extractResourceText(
    new Uint8Array([0, 1, 2]),
    { filename: "archive.zip", mediaType: "application/zip", maxChars: 100, maxPdfPages: 5 },
  );
  assert.equal(binary.readable, false);
  assert.match(binary.reason ?? "", /not supported/);
});
