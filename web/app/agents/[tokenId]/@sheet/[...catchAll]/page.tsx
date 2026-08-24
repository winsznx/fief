/**
 * Closes the sheet when navigating to any other sub-route of this agent —
 * /agents/[tokenId]/rent in particular.
 *
 * The more specific `(.)entries/[txHash]` interceptor takes precedence over this
 * catch-all, so opening an entry still renders the sheet.
 */
export default function CatchAll() {
  return null;
}
