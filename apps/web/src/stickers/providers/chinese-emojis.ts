import { buildStickerId, parseStickerId } from "../sticker-id";
import type {
	StickerBrowseResult,
	StickerItem,
	StickerProvider,
	StickerSearchResult,
} from "../types";

const PROVIDER_ID = "chinese-emojis";
const DEFAULT_LIMIT = 80;

type EmojiPack = {
	id: string;
	name: string;
};

type EmojiItem = {
	id: string;
	packId: string;
	packName: string;
	name: string;
	url: string;
	thumbUrl?: string;
	keywords?: string[];
};

type EmojiIndex = {
	packs: EmojiPack[];
	items: EmojiItem[];
};

let indexPromise: Promise<EmojiIndex> | null = null;

function getStickerImageUrl({ url }: { url: string }): string {
	return `/api/stickers/image?url=${encodeURIComponent(url)}`;
}

async function getIndex(): Promise<EmojiIndex> {
	if (!indexPromise) {
		indexPromise = fetch("/api/stickers")
			.then(async (response) => {
				if (!response.ok) throw new Error("Unable to load emoji stickers");
				return (await response.json()) as EmojiIndex;
			})
			.then((index) => ({
				packs: Array.isArray(index.packs) ? index.packs : [],
				items: Array.isArray(index.items) ? index.items : [],
			}));
	}
	return indexPromise;
}

function toStickerItem(item: EmojiItem): StickerItem {
	return {
		id: buildStickerId({
			providerId: PROVIDER_ID,
			providerValue: encodeURIComponent(item.url),
		}),
		provider: PROVIDER_ID,
		name: item.name,
		previewUrl: getStickerImageUrl({ url: item.thumbUrl ?? item.url }),
		metadata: { packId: item.packId, packName: item.packName },
	};
}

function matchesQuery({ item, query }: { item: EmojiItem; query: string }): boolean {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return true;
	return [item.name, item.packName, ...(item.keywords ?? [])].some((value) =>
		value.toLocaleLowerCase().includes(normalizedQuery),
	);
}

function takeItems({ items, limit }: { items: EmojiItem[]; limit?: number }): StickerSearchResult {
	const cappedLimit = Math.max(1, limit ?? DEFAULT_LIMIT);
	return {
		items: items.slice(0, cappedLimit).map(toStickerItem),
		total: items.length,
		hasMore: items.length > cappedLimit,
	};
}

export const chineseEmojisProvider: StickerProvider = {
	id: PROVIDER_ID,
	async search({ query, options }): Promise<StickerSearchResult> {
		const index = await getIndex();
		return takeItems({
			items: index.items.filter((item) => matchesQuery({ item, query })),
			limit: options?.limit,
		});
	},
	async browse({ options }): Promise<StickerBrowseResult> {
		const index = await getIndex();
		const sections = index.packs
			.map((pack) => {
				const result = takeItems({
					items: index.items.filter((item) => item.packId === pack.id),
					limit: options?.limit ?? Number.MAX_SAFE_INTEGER,
				});
				return {
					id: pack.id,
					title: pack.name,
					items: result.items,
					hasMore: result.hasMore,
					layout: "grid" as const,
				};
			})
			.filter((section) => section.items.length > 0);

		return { sections };
	},
	resolveUrl({ stickerId }): string {
		const { providerValue } = parseStickerId({ stickerId });
		return getStickerImageUrl({ url: decodeURIComponent(providerValue) });
	},
};
