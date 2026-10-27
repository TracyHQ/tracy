import type { HeaderBlock } from "../types.js";

export function HeaderBlockComponent({ block }: { block: HeaderBlock }) {
	return <h2 className="text-xl font-bold text-kumo-default">{block.text}</h2>;
}
