const sensitiveKey = /(token|password|secret|cookie|authorization|sesskey)/i;

// Query parameter names whose values are credentials or session secrets.
// - token, wstoken: Moodle web service tokens (pluginfile/webservice URLs).
// - privatetoken / private_token: Moodle mobile private token.
// - sesskey: Moodle session key (CSRF/session secret in edit/delete URLs).
// - authtoken: Moodle calendar export token.
// - userkey, key, sig, signature: user keys and signed-URL material.
// - access_token, refresh_token, password, secret: generic credentials.
const sensitiveQueryKeys = [
  "token",
  "wstoken",
  "private[_-]?token",
  "sesskey",
  "authtoken",
  "userkey",
  "key",
  "sig",
  "signature",
  "access[_-]?token",
  "refresh[_-]?token",
  "password",
  "secret",
].join("|");

// A query parameter separator, in raw, HTML-escaped, or percent-encoded form:
// `?`, `&`, `&amp;` (possibly double-escaped), `&#38;`, `&#x26;`, `%3F`, `%26`.
const separator = String.raw`(?:[?&](?:amp;)*|&#0*38;|&#x0*26;|%3F|%26)`;
// `=` raw or percent-encoded (for URLs nested inside another parameter).
const equals = String.raw`(?:=|%3D)`;
// The value ends at the next separator, fragment, whitespace, quote, or markup.
const value = String.raw`(?:(?!%26|&)[^#\s"'<>()\\])*`;

const sensitiveParam = new RegExp(
  `(${separator}(?:${sensitiveQueryKeys})${equals})${value}`,
  "gi",
);

export const REDACTED = "[redacted]";

/**
 * Redacts sensitive query parameter values anywhere in a string: whole URLs,
 * URLs embedded in HTML attributes or plain text, `&amp;`-escaped URLs, and
 * percent-encoded URLs nested inside another URL's parameters.
 */
export function sanitizeString(input: string): string {
  return input.replace(sensitiveParam, `$1${REDACTED}`);
}

export function sanitize(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      sensitiveKey.test(key) ? REDACTED : sanitize(child),
    ]),
  );
}
