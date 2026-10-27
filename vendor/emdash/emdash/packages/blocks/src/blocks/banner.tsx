import { Banner } from "@cloudflare/kumo";
import { Info, Warning, WarningCircle } from "@phosphor-icons/react";
import { useMemo } from "react";

import type { BannerBlock } from "../types.js";

function useVariantIcon(variant: "default" | "alert" | "error") {
	return useMemo(() => {
		switch (variant) {
			case "alert":
				return <Warning weight="fill" size={20} />;
			case "error":
				return <WarningCircle weight="fill" size={20} />;
			default:
				return <Info weight="fill" size={20} />;
		}
	}, [variant]);
}

export function BannerBlockComponent({ block }: { block: BannerBlock }) {
	const variant = block.variant ?? "default";
	const icon = useVariantIcon(variant);
	return (
		<Banner variant={variant} icon={icon} title={block.title} description={block.description} />
	);
}
