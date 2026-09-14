import { describe, expect, it } from 'vitest';
import type { TakeRecord } from '../../types/recording';
import { selectBestTakes } from './stitch';

function take(partial: Partial<TakeRecord>): TakeRecord {
  return {
    id: 'take',
    scriptId: 'script',
    title: 'take',
    createdAt: 1,
    status: 'complete',
    starred: false,
    mimeType: 'video/webm',
    bytes: 10,
    duration: 1,
    chunks: 1,
    startWord: 0,
    endWord: 2,
    scriptSnapshot: {
      id: 'script', title: 'script', text: 'one two three four', createdAt: 1, updatedAt: 1,
      cursor: 0, bookmarks: [], settings: {} as never,
    },
    settings: {} as never,
    actualSettings: {},
    ...partial,
  };
}

describe('selectBestTakes', () => {
  it('prefers a starred take, then newest, and removes overlapping ranges deterministically', () => {
    const chosen = selectBestTakes([
      take({ id: 'old', startWord: 0, endWord: 3, createdAt: 10 }),
      take({ id: 'starred', startWord: 0, endWord: 3, createdAt: 1, starred: true }),
      take({ id: 'overlap', startWord: 2, endWord: 5, createdAt: 99, starred: false }),
      take({ id: 'next', startWord: 5, endWord: 7, createdAt: 3 }),
    ]);
    expect(chosen.map((item) => item.id)).toEqual(['starred', 'next']);
  });

  it('does not invent quality for incomplete or zero-byte takes', () => {
    expect(selectBestTakes([
      take({ id: 'recording', status: 'recording' }),
      take({ id: 'empty', bytes: 0 }),
      take({ id: 'bad-range', startWord: 3, endWord: 3 }),
    ])).toEqual([]);
  });
});

