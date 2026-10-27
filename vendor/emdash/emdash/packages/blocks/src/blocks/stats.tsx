import { ArrowDown, ArrowUp, Minus } from "@phosphor-icons/react";

import type { StatItem, StatsBlock } from "../types.js";
import { cn } from "../utils.js";

const trendConfig = {
	up: { icon: ArrowUp, color: "text-green-600" },
	down: { icon: ArrowDown, color: "text-red-600" },
	neutral: { icon: Minus, color: "text-kumo-subtle" },
} as const;

function StatCard({ item }: { item: StatItem }) {
	const trend = item.trend ? trendConfig[item.trend] : null;
	const TrendIcon = trend?.icon;

	return (
		<div className="flex-1 rounded-lg border border-kumo-line p-4">
			<div className="text-sm text-kumo-subtle">{item.label}</div>
			<div className="mt-1 flex items-baseline gap-2">
				<span className="text-2xl font-bold text-kumo-default">{item.value}</span>
				{TrendIcon && (
					<span className={cn("flex items-center", trend.color)}>
						<TrendIcon size={16} />
					</span>
				)}
			</div>
			{item.description && <div className="mt-1 text-sm text-kumo-subtle">{item.description}</div>}
		</div>
	);
}

export function StatsBlockComponent({ block }: { block: StatsBlock }) {
	return (
		<div className="flex gap-4">
			{block.items.map((item, i) => (
				<StatCard key={i} item={item} />
			))}
		</div>
	);
}
