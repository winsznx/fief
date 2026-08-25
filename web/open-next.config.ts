import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext config for Cloudflare Workers.
 *
 * Static export is not an option here: the app uses dynamic routes without
 * generateStaticParams (`/agents/[tokenId]`) and intercepting routes for the
 * entry sheet, both of which Next lists as unsupported for `output: export`.
 *
 * No incremental cache is configured on purpose. Every page reads live 0G
 * mainnet state through a public RPC, and a stale cached completeness number
 * is precisely the failure this product exists to prevent.
 */
export default defineCloudflareConfig();
