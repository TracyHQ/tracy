import { Input, InputArea } from "@cloudflare/kumo";
import { useCallback } from "react";

import type { BlockInteraction, TextInputElement } from "../types.js";

export function TextInputElementComponent({
	element,
	onAction,
	onChange,
}: {
	element: TextInputElement;
	onAction: (interaction: BlockInteraction) => void;
	onChange?: (actionId: string, value: unknown) => void;
}) {
	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			if (onChange) {
				onChange(element.action_id, e.target.value);
			}
		},
		[onChange, element.action_id],
	);

	const handleBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			if (!onChange) {
				onAction({
					type: "block_action",
					action_id: element.action_id,
					value: e.target.value,
				});
			}
		},
		[onChange, onAction, element.action_id],
	);

	if (element.multiline) {
		return (
			<InputArea
				label={element.label}
				placeholder={element.placeholder}
				defaultValue={element.initial_value}
				onChange={handleChange}
				onBlur={handleBlur}
			/>
		);
	}

	return (
		<Input
			label={element.label}
			placeholder={element.placeholder}
			defaultValue={element.initial_value}
			onChange={handleChange}
			onBlur={handleBlur}
		/>
	);
}
