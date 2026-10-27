import type { ImageBlock } from "../types.js";

export function ImageBlockComponent({ block }: { block: ImageBlock }) {
	return (
		<figure>
			<img src={block.url} alt={block.alt} className="max-w-full rounded" />
			{block.title && (
				<figcaption className="mt-1 text-sm text-kumo-subtle">{block.title}</figcaption>
			)}
		</figure>
	);
}
