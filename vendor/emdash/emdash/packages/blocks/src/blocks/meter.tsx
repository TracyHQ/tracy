import { Meter } from "@cloudflare/kumo";

import type { MeterBlock } from "../types.js";

export function MeterBlockComponent({ block }: { block: MeterBlock }) {
	return (
		<Meter
			label={block.label}
			value={block.value}
			max={block.max}
			min={block.min}
			customValue={block.custom_value}
		/>
	);
}
