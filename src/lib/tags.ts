const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

/** Pulls #hashtags out of text, returning the cleaned text and the tags found. */
export function extractTags(text: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const cleaned = text.replace(TAG_RE, (_m, lead: string, tag: string) => {
    tags.push(normalizeTag(tag));
    return lead;
  });
  return { text: cleaned.replace(/\s{2,}/g, ' ').trim(), tags: uniqueTags(tags) };
}

export function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

/** Tags sorted by how often they're used, most common first. */
export function tagCounts(lists: string[][]): [string, number][] {
  const counts = new Map<string, number>();
  for (const list of lists) for (const t of list) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** The partial #tag being typed at the end of the text, if any. */
export function partialTagAtEnd(text: string): string | null {
  const m = /(?:^|\s)#([\p{L}\p{N}_-]*)$/u.exec(text);
  return m ? m[1].toLowerCase() : null;
}
