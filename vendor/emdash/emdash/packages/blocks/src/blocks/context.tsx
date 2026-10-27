import type { ContextBlock } from "../types.js";

export function ContextBlockComponent({ block }: { block: ContextBlock }) {
	return <p className="text-sm text-kumo-subtle">{block.text}</p>;
}
