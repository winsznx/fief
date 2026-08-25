import { liveDataSource } from './live';
import { mockDataSource } from './mock';
import type { DataSource } from './types';

export type DataMode = 'mock' | 'live';

export function getDataMode(): DataMode {
  return process.env.NEXT_PUBLIC_DATA_MODE === 'live' ? 'live' : 'mock';
}

/**
 * Mock by default, live when explicitly asked.
 *
 * Live reads the real record off 0G mainnet through a public RPC: no indexer,
 * no cache, so every number the UI shows can be reproduced with `cast`. Its
 * mutations throw rather than returning an optimistic result, because the
 * console has no wallet writes wired and a data layer that invents a
 * transaction receipt would undermine the one thing this product sells.
 */
export function getDataSource(): DataSource {
  return getDataMode() === 'live' ? liveDataSource : mockDataSource;
}
