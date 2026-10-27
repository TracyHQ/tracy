/**
 * Astro components for rendering embed blocks in Portable Text
 *
 * These components are automatically registered with PortableText when
 * the embeds plugin is enabled. Manual wiring is no longer needed!
 *
 * The components are exported with lowercase names matching their block types
 * for auto-registration, plus PascalCase aliases for direct usage.
 *
 * @example Direct usage (if you need to customize)
 * ```astro
 * ---
 * import { YouTube } from "@emdash-cms/plugin-embeds/astro";
 * ---
 * <YouTube value={{ id: "dQw4w9WgXcQ", _type: "youtube", _key: "1" }} />
 * ```
 */

import BlueskyComponent from "./Bluesky.astro";
import GistComponent from "./Gist.astro";
import LinkPreviewComponent from "./LinkPreview.astro";
import MastodonComponent from "./Mastodon.astro";
import TweetComponent from "./Tweet.astro";
import VimeoComponent from "./Vimeo.astro";
// Import all components
import YouTubeComponent from "./YouTube.astro";

// Export with lowercase names (for auto-registration via virtual module)
// These names MUST match the block type names in EMBED_BLOCK_TYPES
export {
	YouTubeComponent as youtube,
	VimeoComponent as vimeo,
	TweetComponent as tweet,
	BlueskyComponent as bluesky,
	MastodonComponent as mastodon,
	LinkPreviewComponent as linkPreview,
	GistComponent as gist,
};

// Also export with PascalCase for direct usage
export {
	YouTubeComponent as YouTube,
	VimeoComponent as Vimeo,
	TweetComponent as Tweet,
	BlueskyComponent as Bluesky,
	MastodonComponent as Mastodon,
	LinkPreviewComponent as LinkPreview,
	GistComponent as Gist,
};

/**
 * All embed components keyed by their Portable Text block type.
 * Exported as `blockComponents` for auto-registration via the virtual module,
 * and as `embedComponents` for direct usage.
 */
export const blockComponents = {
	youtube: YouTubeComponent,
	vimeo: VimeoComponent,
	tweet: TweetComponent,
	bluesky: BlueskyComponent,
	mastodon: MastodonComponent,
	linkPreview: LinkPreviewComponent,
	gist: GistComponent,
} as const;

export { blockComponents as embedComponents };
