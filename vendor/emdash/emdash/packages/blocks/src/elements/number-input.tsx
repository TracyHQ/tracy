import { Input } from "@cloudflare/kumo";
import { useCallback } from "react";

import type { BlockInteraction, NumberInputElement } from "../types.js";

export function NumberInputElementComponent({
	element,
	onAction,
	onChange,
}: {
	element: NumberInputElement;
	onAction: (interaction: BlockInteraction) => void;
	onChange?: (actionId: string, value: unknown) => void;
}) {
	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const val = e.target.value === "" ? undefined : Number(e.target.value);
			if (onChange) {
				onChange(element.action_id, val);
			}
		},
		[onChange, element.action_id],
	);

	const handleBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>) => {
			if (!onChange) {
				const val = e.target.value === "" ? undefined : Number(e.target.value);
				onAction({
					type: "block_action",
					action_id: element.action_id,
					value: val,
				});
			}
		},
		[onChange, onAction, element.action_id],
	);

	return (
		<Input
			label={element.label}
			type="number"
			min={element.min}
			max={element.max}
			defaultValue={element.initial_value}
			onChange={handleChange}
			onBlur={handleBlur}
		/>
	);
}
