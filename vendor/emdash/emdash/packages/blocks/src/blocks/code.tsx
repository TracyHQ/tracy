import { CodeBlock as KumoCodeBlock } from "@cloudflare/kumo";

import type { CodeBlock } from "../types.js";

export function CodeBlockComponent({ block }: { block: CodeBlock }) {
	return <KumoCodeBlock code={block.code} lang={block.language} />;
}
