export const HAND_DRAW_DIRECTIONS = [
	"left-to-right",
	"right-to-left",
	"top-to-bottom",
	"bottom-to-top",
] as const;

export type HandDrawDirection = (typeof HAND_DRAW_DIRECTIONS)[number];

export type HandDrawRegion = {
	id: string;
	order: number;
	x: number;
	y: number;
	width: number;
	height: number;
	direction: HandDrawDirection;
	/** Seconds allocated to this region in the sequential hand-draw animation. */
	durationSeconds: number;
	/** Seconds to hold this completed region before starting the next one. */
	pauseSeconds: number;
};

export const DEFAULT_HAND_DRAW_REGION_DURATION_SECONDS = 0.5;
export const DEFAULT_HAND_DRAW_REGION_PAUSE_SECONDS = 0;

export const isHandDrawDirection = (
	value: unknown,
): value is HandDrawDirection =>
	typeof value === "string" &&
	HAND_DRAW_DIRECTIONS.some((direction) => direction === value);

const clampUnit = ({
	value,
	fallback,
}: {
	value: unknown;
	fallback: number;
}): number => {
	const number = typeof value === "number" ? value : Number(value);
	return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
};

export function parseHandDrawRegions({
	value,
}: {
	value: unknown;
}): HandDrawRegion[] {
	if (typeof value !== "string") return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((item, index): HandDrawRegion | null => {
				if (!item || typeof item !== "object" || Array.isArray(item))
					return null;
				const region: Record<string, unknown> = item;
				const x = clampUnit({ value: region.x, fallback: 0 });
				const y = clampUnit({ value: region.y, fallback: 0 });
				const width = Math.min(
					1 - x,
					Math.max(0.01, clampUnit({ value: region.width, fallback: 1 })),
				);
				const height = Math.min(
					1 - y,
					Math.max(0.01, clampUnit({ value: region.height, fallback: 1 })),
				);
				return {
					id: typeof region.id === "string" ? region.id : `region-${index + 1}`,
					order:
						typeof region.order === "number" && Number.isFinite(region.order)
							? Math.max(1, Math.round(region.order))
							: index + 1,
					x,
					y,
					width,
					height,
					direction: isHandDrawDirection(region.direction)
						? region.direction
						: "left-to-right",
					durationSeconds: Math.max(
						0.1,
						typeof region.durationSeconds === "number"
							? region.durationSeconds
							: DEFAULT_HAND_DRAW_REGION_DURATION_SECONDS,
					),
					pauseSeconds: Math.max(
						0,
						typeof region.pauseSeconds === "number"
							? region.pauseSeconds
							: DEFAULT_HAND_DRAW_REGION_PAUSE_SECONDS,
					),
				};
			})
			.filter((region): region is HandDrawRegion => region !== null)
			.sort((left, right) => left.order - right.order);
	} catch {
		return [];
	}
}

export function serializeHandDrawRegions({
	regions,
}: {
	regions: HandDrawRegion[];
}): string {
	return JSON.stringify(
		regions
			.map((region, index) => ({ ...region, order: index + 1 }))
			.sort((left, right) => left.order - right.order),
	);
}

export function handDrawDirectionCode({
	direction,
}: {
	direction: HandDrawDirection;
}): number {
	return HAND_DRAW_DIRECTIONS.indexOf(direction);
}
