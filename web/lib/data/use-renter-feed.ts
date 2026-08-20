'use client';

import { useEffect, useState } from 'react';
import { getDataSource } from '@/lib/data/source';
import type { FeedStatus, RenterFeedMessage } from '@/lib/data/types';

/**
 * Subscribes to a renter feed, keeping a bounded newest-first buffer.
 *
 * Uses `subscribeRenterFeedWithStatus` (v1.1 [8]) so §5.6's feed-loading and
 * reconnecting states are representable — the v1.0 signature reported messages
 * only, with no way to distinguish "connecting" from "connected but idle".
 *
 * The caller is expected to remount this via `key={tokenId}` when switching
 * feeds, rather than the hook clearing its own state inside an effect. That
 * keeps the effect free of synchronous setState, which the React Compiler rules
 * in Next 16 reject.
 */
export function useRenterFeed(tokenId: string | null, limit = 30) {
  const [messages, setMessages] = useState<RenterFeedMessage[]>([]);
  const [status, setStatus] = useState<FeedStatus>(tokenId ? 'connecting' : 'closed');

  useEffect(() => {
    if (!tokenId) return;

    return getDataSource().subscribeRenterFeedWithStatus(
      tokenId,
      (m) => setMessages((prev) => [m, ...prev].slice(0, limit)),
      setStatus,
    );
  }, [tokenId, limit]);

  return { messages, status };
}
