import assert from "node:assert/strict";
import test from "node:test";

import { sanitize, sanitizeString } from "../src/sanitize.js";

test("sanitize redacts sensitive fields and URL query values", () => {
  assert.deepEqual(sanitize({
    token: "abc",
    sesskey: "abc",
    nested: {
      fileurl: "https://e-aules.uab.cat/file.php?id=1&wstoken=abc",
      title: "Course file",
    },
  }), {
    token: "[redacted]",
    sesskey: "[redacted]",
    nested: {
      fileurl: "https://e-aules.uab.cat/file.php?id=1&wstoken=[redacted]",
      title: "Course file",
    },
  });
});

test("redacts sesskey in a whole URL and keeps other params", () => {
  assert.equal(
    sanitizeString("https://e-aules.uab.cat/2026-27/course/mod.php?update=55257&return=1&sesskey=FAKE123abc"),
    "https://e-aules.uab.cat/2026-27/course/mod.php?update=55257&return=1&sesskey=[redacted]",
  );
  assert.equal(
    sanitizeString("https://e-aules.uab.cat/x.php?sesskey=abc123#frag"),
    "https://e-aules.uab.cat/x.php?sesskey=[redacted]#frag",
  );
});

test("redacts URLs embedded in HTML with &amp; separators", () => {
  const html = '<p>See <a href="https://e-aules.uab.cat/webservice/pluginfile.php/1/mod_forum/post/2/a.pdf?forcedownload=1&amp;token=deadbeef">a.pdf</a> and '
    + "<img src='https://e-aules.uab.cat/course/mod.php?update=1&amp;sesskey=XyZ&amp;sr=0'></p>";
  assert.equal(
    sanitizeString(html),
    '<p>See <a href="https://e-aules.uab.cat/webservice/pluginfile.php/1/mod_forum/post/2/a.pdf?forcedownload=1&amp;token=[redacted]">a.pdf</a> and '
      + "<img src='https://e-aules.uab.cat/course/mod.php?update=1&amp;sesskey=[redacted]&amp;sr=0'></p>",
  );
  assert.equal(
    sanitizeString("a?x=1&#38;wstoken=s1 b?x=1&#x26;privatetoken=s2 c?x=1&amp;amp;sesskey=s3"),
    "a?x=1&#38;wstoken=[redacted] b?x=1&#x26;privatetoken=[redacted] c?x=1&amp;amp;sesskey=[redacted]",
  );
});

test("redacts URLs inside plain text", () => {
  assert.equal(
    sanitizeString("Open https://e-aules.uab.cat/calendar/export_execute.php?userid=7&authtoken=abc123 now. Then (https://e-aules.uab.cat/f.php?token=t1)."),
    "Open https://e-aules.uab.cat/calendar/export_execute.php?userid=7&authtoken=[redacted] now. Then (https://e-aules.uab.cat/f.php?token=[redacted]).",
  );
});

test("redacts percent-encoded URLs nested in another parameter", () => {
  assert.equal(
    sanitizeString("https://e-aules.uab.cat/login.php?wantsurl=https%3A%2F%2Fe-aules.uab.cat%2Fmod.php%3Fid%3D1%26sesskey%3Dabc%26x%3D2"),
    "https://e-aules.uab.cat/login.php?wantsurl=https%3A%2F%2Fe-aules.uab.cat%2Fmod.php%3Fid%3D1%26sesskey%3D[redacted]%26x%3D2",
  );
});

test("leaves non-sensitive params and non-URL text untouched", () => {
  const unchanged = [
    "https://e-aules.uab.cat/mod/assign/view.php?id=42&action=view&tokens=3&monkey=1&passkey_hint=x",
    "Tokens and sesskey are words here; key = value, token=abc without separator.",
    "Lliurament: dimarts, 3 de novembre 2026, 23:59 & més",
    "",
  ];
  for (const text of unchanged) assert.equal(sanitizeString(text), text);
  assert.equal(sanitize(42), 42);
  assert.equal(sanitize(null), null);
});
