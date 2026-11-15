import path from "node:path";

import { convert } from "html-to-text";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const textExtensions = new Set([
  ".csv", ".json", ".md", ".py", ".r", ".rst", ".tex", ".txt", ".xml", ".yaml", ".yml",
  // Source code and scripts commonly attached to programming assignments.
  ".c", ".h", ".cc", ".cpp", ".hpp", ".cu", ".cuh", ".java", ".js", ".ts", ".go", ".rs",
  ".m", ".jl", ".f90", ".sql", ".sh", ".bash", ".ps1", ".bat", ".makefile", ".mk",
  ".cmake", ".toml", ".ini", ".cfg", ".conf", ".log",
]);

function decodeText(content: Uint8Array): string {
  for (const encoding of ["utf-8", "windows-1252", "iso-8859-1"]) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(content);
    } catch {
      // Try the next common Campus document encoding.
    }
  }
  return new TextDecoder("utf-8").decode(content);
}

function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ExtractedResource = {
  readable: boolean;
  text?: string;
  truncated?: boolean;
  pagesRead?: number;
  reason?: string;
  contentIsUntrusted: true;
};

export async function extractResourceText(
  content: Uint8Array,
  options: { filename: string; mediaType: string; maxChars: number; maxPdfPages: number },
): Promise<ExtractedResource> {
  const extension = path.extname(options.filename).toLowerCase();
  const mediaType = options.mediaType.toLowerCase().split(";", 1)[0] ?? "";
  let text: string;
  let pagesRead: number | undefined;

  try {
    if (mediaType === "application/pdf" || extension === ".pdf") {
      const document = await getDocument({ data: content.slice(), useSystemFonts: true }).promise;
      try {
        pagesRead = Math.min(document.numPages, options.maxPdfPages);
        const pages: string[] = [];
        for (let index = 1; index <= pagesRead; index += 1) {
          const page = await document.getPage(index);
          const pageContent = await page.getTextContent();
          pages.push(pageContent.items
            .map((item) => "str" in item ? item.str : "")
            .join(" "));
          page.cleanup();
        }
        text = pages.join("\n\n");
      } finally {
        await document.destroy();
      }
    } else if (
      mediaType === "text/html"
      || mediaType === "application/xhtml+xml"
      || extension === ".html"
      || extension === ".htm"
    ) {
      text = convert(decodeText(content), {
        wordwrap: false,
        selectors: [{ selector: "img", format: "skip" }],
      });
    } else if (mediaType.startsWith("text/") || textExtensions.has(extension)) {
      text = decodeText(content);
    } else {
      return {
        readable: false,
        reason: "Binary format is not supported for text extraction",
        contentIsUntrusted: true,
      };
    }
  } catch (error) {
    return {
      readable: false,
      reason: `Text extraction failed (${error instanceof Error ? error.name : "unknown error"})`,
      contentIsUntrusted: true,
    };
  }

  const cleaned = cleanText(text);
  return {
    readable: true,
    text: cleaned.slice(0, options.maxChars),
    truncated: cleaned.length > options.maxChars,
    ...(pagesRead === undefined ? {} : { pagesRead }),
    contentIsUntrusted: true,
  };
}
