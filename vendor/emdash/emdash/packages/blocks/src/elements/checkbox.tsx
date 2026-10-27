import { Checkbox } from "@cloudflare/kumo";
import { useCallback, useEffect, useState } from "react";

import type { BlockInteraction, CheckboxElement } from "../types.js";

export function CheckboxElementComponent({
	element,
	onAction,
	onChange,
}: {
	element: CheckboxElement;
	onAction: (interaction: BlockInteraction) => void;
	onChange?: (actionId: string, value: unknown) => void;
}) {
	const [values, setValues] = useState<string[]>(element.initial_value ?? []);

	useEffect(() => {
		setValues(element.initial_value ?? []);
	}, [element.initial_value]);

	const handleChange = useCallback(
		(newValues: string[]) => {
			setValues(newValues);
			if (onChange) {
				onChange(element.action_id, newValues);
			} else {
				onAction({
					type: "block_action",
					action_id: element.action_id,
					value: newValues,
				});
			}
		},
		[onChange, onAction, element.action_id],
	);

	return (
		<Checkbox.Group legend={element.label} value={values} onValueChange={handleChange}>
			{element.options.map((opt) => (
				<Checkbox.Item key={opt.value} value={opt.value} label={opt.label} />
			))}
		</Checkbox.Group>
	);
}
