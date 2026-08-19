import { mockDataSource } from './mock';
import type { DataSource } from './types';

export type DataMode = 'mock' | 'live';

export function getDataMode(): DataMode {
  return process.env.NEXT_PUBLIC_DATA_MODE === 'live' ? 'live' : 'mock';
}

/**
 * LiveDataSource is the owner's job. Until it exists, live mode falls back
 * to mock and logs once so a mistaken env var is obvious.
 */
let warnedLive = false;

export function getDataSource(): DataSource {
  if (getDataMode() === 'live') {
    if (!warnedLive) {
      console.warn('[fief] NEXT_PUBLIC_DATA_MODE=live but LiveDataSource is not wired; using mock.');
      warnedLive = true;
    }
  }
  return mockDataSource;
}
