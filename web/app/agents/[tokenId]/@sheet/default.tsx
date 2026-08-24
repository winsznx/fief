/**
 * Fallback for the `sheet` slot on hard navigation / full reload.
 *
 * Without this, loading /agents/1/entries/0x… directly would 404 the unmatched
 * slot instead of rendering the standalone page.
 */
export default function Default() {
  return null;
}
