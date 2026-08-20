/**
 * Closes the sheet when navigating back to the record page itself.
 *
 * Parallel-route slots keep their active state across client-side navigation,
 * so the slot must resolve to something that renders nothing.
 */
export default function Page() {
  return null;
}
