/**
 * Layout for the agent record, hosting the `sheet` parallel-route slot.
 *
 * Deliberately renders NO visual chrome: /agents/[tokenId]/rent also lives
 * under this segment, and wrapping the rent flow in record-page furniture would
 * be wrong. The layout exists purely so the intercepted entry route has a slot
 * to render into.
 *
 * Slot props are inferred from the directory structure by LayoutProps
 * (Next 16 — verified against node_modules/next/dist/docs).
 */
export default function AgentLayout(props: LayoutProps<'/agents/[tokenId]'>) {
  return (
    <>
      {props.children}
      {props.sheet}
    </>
  );
}
