import { convert } from "html-to-text";

const namedEntities: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
};

/** Decode HTML entities in a plain-text Moodle field such as a name or subject. */
export function decodeEntities(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return namedEntities[entity.toLowerCase()] ?? match;
  });
}

/** Convert a Moodle HTML field (intro, message, description) to compact readable text. */
export function htmlToText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = convert(value, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ],
  }).replace(/\n{3,}/g, "\n\n").trim();
  return text || undefined;
}
