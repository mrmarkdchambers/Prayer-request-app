import { extractTags } from './tags';

export interface DraftPrayer {
  title: string;
  person: string;
  tags: string[];
}

/**
 * Turns pasted text into prayer drafts, one per line.
 * "Sarah: healing after surgery #family" → person "Sarah", tag "family".
 * Bullets and numbering are stripped; blank lines are skipped.
 */
export function parseBulk(text: string, extraTags: string[] = []): DraftPrayer[] {
  const drafts: DraftPrayer[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
    if (!line) continue;
    const { text: withoutTags, tags } = extractTags(line);
    let person = '';
    let title = withoutTags;
    const m = /^([^:]{1,40}):\s*(.+)$/.exec(withoutTags);
    if (m) {
      person = m[1].trim();
      title = m[2].trim();
    }
    if (!title) continue;
    title = title[0].toUpperCase() + title.slice(1);
    drafts.push({ title, person, tags: [...new Set([...tags, ...extraTags])] });
  }
  return drafts;
}
