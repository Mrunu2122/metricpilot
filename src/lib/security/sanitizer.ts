/**
 * Safely encodes untrusted text for inclusion inside prompt data blocks.
 *
 * Prevents delimiter breakout by:
 * 1. Normalizing encoded entities (&lt;, &gt;, &#60;, &#62;, etc.) so hidden tags cannot bypass filters.
 * 2. Neutralizing angle brackets and closing delimiters ('<' -> '[lt]', '>' -> '[gt]').
 * 3. Stripping specific closing boundary tags even if malformed or whitespace-padded.
 * 4. Preserving natural user query readability without breaking legitimate punctuation.
 */
export function sanitizeUntrustedContent(content: string, boundaryTag?: string): string {
  if (typeof content !== 'string') {
    return '';
  }

  let text = content;

  // 1. Normalize common HTML/XML entities that could represent angle brackets
  text = text.replace(/&(?:lt|#60|#x3c);/gi, '<');
  text = text.replace(/&(?:gt|#62|#x3e);/gi, '>');

  // 2. If a specific boundary tag is provided (e.g. 'untrusted_user_query'), explicitly neutralize any closing variations
  if (boundaryTag) {
    const escapedTag = boundaryTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const closingTagRegex = new RegExp(`</?\\s*${escapedTag}\\s*>`, 'gi');
    text = text.replace(closingTagRegex, '');
  }

  // Also defensively neutralize any closing tag for untrusted sections
  text = text.replace(/<\/?\s*untrusted_[a-z0-9_]*\s*>/gi, '');

  // 3. Escape literal angle brackets so no custom or malformed tags can form XML boundaries
  text = text.replace(/</g, '‹'); // Unicode single left-pointing angle quotation mark
  text = text.replace(/>/g, '›'); // Unicode single right-pointing angle quotation mark

  return text.trim();
}
