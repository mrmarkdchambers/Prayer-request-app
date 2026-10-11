import { extractTags, partialTagAtEnd, tagCounts } from './tags';
import { parseBulk } from './bulk';
import { createPrayer, filterPrayers } from './prayers';
import { buildSession, followUpsDue, isScheduledFor } from './session';
import { reducer } from './reducer';
import { emptyData, type Prayer } from './types';
import { computeStats, answeredByMonth } from './stats';
import { dailyReminderIcs, mergeData, normalizeData, parseCsv, prayersFromCsv, toCsv, toJson } from './exportImport';

const day = (s: string) => new Date(`${s}T12:00:00`);

function prayer(overrides: Partial<Prayer> = {}): Prayer {
  return { ...createPrayer({ title: 'x' }, day('2026-01-01')), ...overrides };
}

describe('tags', () => {
  it('extracts and normalizes hashtags', () => {
    expect(extractTags('Healing for Mom #Family #health #family')).toEqual({ text: 'Healing for Mom', tags: ['family', 'health'] });
  });
  it('ignores # inside words', () => {
    expect(extractTags('Issue C#sharp').tags).toEqual([]);
  });
  it('detects a tag being typed', () => {
    expect(partialTagAtEnd('Job search #wo')).toBe('wo');
    expect(partialTagAtEnd('Job search #')).toBe('');
    expect(partialTagAtEnd('Job search')).toBeNull();
  });
  it('counts tags by frequency', () => {
    expect(tagCounts([['a', 'b'], ['b']])).toEqual([['b', 2], ['a', 1]]);
  });
});

describe('bulk add', () => {
  it('parses one request per line with people, tags, bullets', () => {
    const drafts = parseBulk('- Sarah: surgery recovery #family\n\n2. New job for Tom\n• Peace #church', ['group']);
    expect(drafts).toEqual([
      { title: 'Surgery recovery', person: 'Sarah', tags: ['family', 'group'] },
      { title: 'New job for Tom', person: '', tags: ['group'] },
      { title: 'Peace', person: '', tags: ['church', 'group'] },
    ]);
  });
});

describe('filterPrayers', () => {
  const list = [
    prayer({ title: 'Healing', person: 'Sarah', tags: ['family'] }),
    prayer({ title: 'Job', person: 'Tom', tags: ['work'], status: 'answered' }),
  ];
  it('searches across fields and tags', () => {
    expect(filterPrayers(list, { query: 'sarah heal', status: 'all', tag: null, person: null })).toHaveLength(1);
    expect(filterPrayers(list, { query: '#work', status: 'all', tag: null, person: null })[0].title).toBe('Job');
  });
  it('filters by status and tag', () => {
    expect(filterPrayers(list, { query: '', status: 'active', tag: null, person: null })).toHaveLength(1);
    expect(filterPrayers(list, { query: '', status: 'all', tag: 'work', person: null })).toHaveLength(1);
  });
});

describe('session', () => {
  const today = day('2026-10-11'); // a Sunday

  it('matches schedules', () => {
    expect(isScheduledFor(prayer({ schedule: { kind: 'weekly', days: [0] } }), today)).toBe(true);
    expect(isScheduledFor(prayer({ schedule: { kind: 'weekly', days: [1] } }), today)).toBe(false);
    expect(isScheduledFor(prayer({ schedule: { kind: 'monthly', day: 31 } }), day('2026-02-28'))).toBe(true);
    expect(isScheduledFor(prayer({ schedule: { kind: 'monthly', day: 11 } }), today)).toBe(true);
  });

  it('includes scheduled items, then the stalest rotation items', () => {
    const daily = prayer({ title: 'daily', schedule: { kind: 'daily' } });
    const fresh = prayer({ title: 'fresh', lastPrayedAt: day('2026-10-10').toISOString() });
    const stale = prayer({ title: 'stale', lastPrayedAt: day('2026-09-01').toISOString() });
    const never = prayer({ title: 'never' });
    const titles = buildSession([fresh, stale, daily, never], today, 3).map((p) => p.title);
    expect(titles).toEqual(['daily', 'never', 'stale']);
  });

  it('skips answered and already-prayed-today items', () => {
    const done = prayer({ title: 'done', lastPrayedAt: today.toISOString() });
    const answered = prayer({ title: 'answered', status: 'answered' });
    expect(buildSession([done, answered], today, 5)).toEqual([]);
  });

  it('rotates across categories', () => {
    const fam = [1, 2, 3].map((i) => prayer({ title: `fam${i}`, tags: ['family'], lastPrayedAt: day(`2026-01-0${i}`).toISOString() }));
    const work = prayer({ title: 'work1', tags: ['work'], lastPrayedAt: day('2026-05-01').toISOString() });
    const titles = buildSession([...fam, work], today, 2).map((p) => p.title);
    expect(titles).toEqual(['fam1', 'work1']);
  });

  it('lists due follow-ups', () => {
    const due = prayer({ followUpOn: '2026-10-10' });
    const later = prayer({ followUpOn: '2026-10-20' });
    expect(followUpsDue([due, later], today)).toEqual([due]);
  });
});

describe('reducer', () => {
  it('runs the full lifecycle with a timeline', () => {
    let data = reducer(emptyData(), { type: 'add', input: { title: 'Healing', tags: ['#Family'] } });
    const id = data.prayers[0].id;
    expect(data.prayers[0].tags).toEqual(['family']);
    data = reducer(data, { type: 'prayed', id });
    data = reducer(data, { type: 'prayed', id });
    data = reducer(data, { type: 'addUpdate', id, text: 'Surgery moved to Tuesday' });
    data = reducer(data, { type: 'addUpdate', id, text: '   ' });
    data = reducer(data, { type: 'answered', id, note: 'Surgery went well!' });
    const p = data.prayers[0];
    expect(p.prayedCount).toBe(2);
    expect(p.status).toBe('answered');
    expect(p.answerNote).toBe('Surgery went well!');
    expect(p.updates.map((u) => u.kind)).toEqual(['note', 'answered']);
    data = reducer(data, { type: 'reopen', id });
    expect(data.prayers[0].status).toBe('active');
    expect(data.prayers[0].answeredAt).toBeNull();
  });
});

describe('stats', () => {
  it('summarizes answered prayers', () => {
    const now = day('2026-10-11');
    const list = [
      prayer({ status: 'answered', createdAt: day('2026-10-01').toISOString(), answeredAt: day('2026-10-11').toISOString(), prayedCount: 3 }),
      prayer({ status: 'answered', createdAt: day('2025-01-01').toISOString(), answeredAt: day('2025-01-31').toISOString() }),
      prayer({ prayedCount: 2 }),
    ];
    expect(computeStats(list, now)).toEqual({ active: 1, answered: 2, answeredThisYear: 1, totalPrayers: 5, averageDaysToAnswer: 20 });
    expect(answeredByMonth(list)).toHaveLength(2);
  });
});

describe('export / import', () => {
  it('round-trips JSON', () => {
    const data = reducer(emptyData(), { type: 'add', input: { title: 'Hope', schedule: { kind: 'weekly', days: [1, 9] } } });
    const back = normalizeData(JSON.parse(toJson(data)));
    expect(back.prayers[0].title).toBe('Hope');
    expect(back.prayers[0].schedule).toEqual({ kind: 'weekly', days: [1] });
  });

  it('drops invalid records', () => {
    expect(normalizeData({ prayers: [{ title: '' }, null, { title: 'ok', status: 'weird' }] }).prayers.map((p) => p.status)).toEqual(['active']);
    expect(normalizeData('nope').prayers).toEqual([]);
  });

  it('merges by id, newest wins', () => {
    const a = prayer({ title: 'old', updatedAt: '2026-01-01T00:00:00.000Z' });
    const b = { ...a, title: 'new', updatedAt: '2026-02-01T00:00:00.000Z' };
    const c = prayer({ title: 'other' });
    const { data, added, updated } = mergeData({ ...emptyData(), prayers: [a] }, { ...emptyData(), prayers: [b, c] });
    expect([added, updated]).toEqual([1, 1]);
    expect(data.prayers.map((p) => p.title).sort()).toEqual(['new', 'other']);
  });

  it('round-trips CSV including quotes, commas and newlines', () => {
    const p = prayer({ title: 'Say "hi", please', details: 'line1\nline2', tags: ['a', 'b'], status: 'answered', answeredAt: '2026-03-01T00:00:00.000Z' });
    const back = prayersFromCsv(toCsv([p]));
    expect(back[0]).toMatchObject({ title: 'Say "hi", please', details: 'line1\nline2', tags: ['a', 'b'], status: 'answered', answeredAt: '2026-03-01T00:00:00.000Z' });
  });

  it('imports CSVs from other apps with loose headers', () => {
    const list = prayersFromCsv('Request,Name,Category\nNew job,Tom,work\n,,\n');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'New job', person: 'Tom', tags: ['work'] });
    expect(() => prayersFromCsv('foo,bar\n1,2')).toThrow();
    expect(parseCsv('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('builds a daily calendar reminder', () => {
    const ics = dailyReminderIcs('07:30', 'https://example.com', 'Intercede', day('2026-10-11'));
    expect(ics).toContain('DTSTART:20261011T073000');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics).toContain('DESCRIPTION:Open Intercede: https://example.com');
  });
});
