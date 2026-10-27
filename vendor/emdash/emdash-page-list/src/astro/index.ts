import PageListBlockComponent from "./PageListBlock.astro";
import PageListComponent from "./PageList.astro";

export const blockComponents = {
	pageList: PageListBlockComponent,
} as const;

export {
	PageListBlockComponent as pageList,
	PageListBlockComponent as PageListBlock,
	PageListComponent as PageList,
};
