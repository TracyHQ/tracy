import { Switch } from "@cloudflare/kumo";
import { useCallback, useState } from "react";

import type { BlockInteraction, ToggleElement } from "../types.js";

export function ToggleElementComponent({
	element,
	onAction,
	onChange,
}: {
	element: ToggleElement;
	onAction: (interaction: BlockInteraction) => void;
	onChange?: (actionId: string, value: unknown) => void;
}) {
	const [checked, setChecked] = useState(element.initial_value ?? false);

	const handleChange = useCallback(
		(value: boolean) => {
			setChecked(value);
			if (onChange) {
				onChange(element.action_id, value);
			} else {
				onAction({
					type: "block_action",
					action_id: element.action_id,
					value,
				});
			}
		},
		[onChange, onAction, element.action_id],
	);

	return <Switch label={element.label} checked={checked} onCheckedChange={handleChange} />;
}
