import { Radio } from "@cloudflare/kumo";
import { useCallback, useEffect, useState } from "react";

import type { BlockInteraction, RadioElement } from "../types.js";

export function RadioElementComponent({
	element,
	onAction,
	onChange,
}: {
	element: RadioElement;
	onAction: (interaction: BlockInteraction) => void;
	onChange?: (actionId: string, value: unknown) => void;
}) {
	const [value, setValue] = useState(element.initial_value ?? "");

	useEffect(() => {
		setValue(element.initial_value ?? "");
	}, [element.initial_value]);

	const handleChange = useCallback(
		(newValue: string) => {
			setValue(newValue);
			if (onChange) {
				onChange(element.action_id, newValue);
			} else {
				onAction({
					type: "block_action",
					action_id: element.action_id,
					value: newValue,
				});
			}
		},
		[onChange, onAction, element.action_id],
	);

	return (
		<Radio.Group legend={element.label} value={value} onValueChange={handleChange}>
			{element.options.map((opt) => (
				<Radio.Item key={opt.value} value={opt.value} label={opt.label} />
			))}
		</Radio.Group>
	);
}
