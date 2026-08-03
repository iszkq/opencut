"use client";

import { useState } from "react";
import type { EffectElement } from "@/timeline";
import { useEditor } from "@/editor/use-editor";
import { usePreviewViewport } from "@/preview/components/preview-viewport";
import {
	parseHandDrawRegions,
	serializeHandDrawRegions,
	type HandDrawDirection,
} from "@/effects/hand-draw-regions";

type CanvasPoint = { x: number; y: number };

function directionFromOrder({ value }: { value: unknown }): HandDrawDirection {
	return value === "right-to-left" ||
		value === "top-to-bottom" ||
		value === "bottom-to-top"
		? value
		: "left-to-right";
}

export function HandDrawRegionOverlay({
	trackId,
	element,
}: {
	trackId: string;
	element: EffectElement;
}) {
	const editor = useEditor();
	const viewport = usePreviewViewport();
	const canvasSize = useEditor((e) => e.project.getActive().settings.canvasSize);
	const [dragStart, setDragStart] = useState<CanvasPoint | null>(null);
	const [dragCurrent, setDragCurrent] = useState<CanvasPoint | null>(null);
	const regions = parseHandDrawRegions({ value: element.params.drawRegions });

	const pointFromEvent = (event: React.PointerEvent): CanvasPoint | null => {
		const point = viewport.screenToCanvas({
			clientX: event.clientX,
			clientY: event.clientY,
		});
		if (!point) return null;
		return {
			x: Math.min(canvasSize.width, Math.max(0, point.x)),
			y: Math.min(canvasSize.height, Math.max(0, point.y)),
		};
	};

	const updateRegions = (nextValue: string) => {
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: {
						params: { ...element.params, drawRegions: nextValue },
					},
				},
			],
		});
	};

	const handlePointerDown = (event: React.PointerEvent) => {
		if (event.button !== 0 || viewport.handlePanPointerDown({ event })) return;
		const point = pointFromEvent(event);
		if (!point) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		setDragStart(point);
		setDragCurrent(point);
	};

	const handlePointerMove = (event: React.PointerEvent) => {
		if (viewport.handlePanPointerMove({ event })) return;
		if (!dragStart) return;
		const point = pointFromEvent(event);
		if (point) setDragCurrent(point);
	};

	const handlePointerUp = (event: React.PointerEvent) => {
		if (viewport.handlePanPointerUp({ event })) return;
		const start = dragStart;
		const end = pointFromEvent(event);
		setDragStart(null);
		setDragCurrent(null);
		if (!start || !end) return;
		const left = Math.min(start.x, end.x);
		const top = Math.min(start.y, end.y);
		const width = Math.abs(end.x - start.x);
		const height = Math.abs(end.y - start.y);
		if (width < 12 || height < 12) return;
		const nextRegions = [
			...regions,
			{
				id: globalThis.crypto.randomUUID(),
				order: regions.length + 1,
				x: left / canvasSize.width,
				y: top / canvasSize.height,
				width: width / canvasSize.width,
				height: height / canvasSize.height,
				direction: directionFromOrder({ value: element.params.drawOrder }),
			},
		];
		updateRegions(serializeHandDrawRegions({ regions: nextRegions }));
	};

	const renderRegions = [
		...regions,
		...(dragStart && dragCurrent
			? [
				{
					id: "draft",
					order: regions.length + 1,
					x: Math.min(dragStart.x, dragCurrent.x) / canvasSize.width,
					y: Math.min(dragStart.y, dragCurrent.y) / canvasSize.height,
					width: Math.abs(dragStart.x - dragCurrent.x) / canvasSize.width,
					height: Math.abs(dragStart.y - dragCurrent.y) / canvasSize.height,
				}
			]
			: []),
	];

	return (
		<div
			className="absolute inset-0 z-20 cursor-crosshair touch-none"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
		>
			{renderRegions.map((region) => {
				const topLeft = viewport.canvasToOverlay({
					canvasX: region.x * canvasSize.width,
					canvasY: region.y * canvasSize.height,
				});
				const scale = viewport.getDisplayScale();
				return (
					<div
						key={region.id}
						className="pointer-events-none absolute border-2 border-primary bg-primary/10"
						style={{
							left: topLeft.x,
							top: topLeft.y,
							width: region.width * canvasSize.width * scale.x,
							height: region.height * canvasSize.height * scale.y,
						}}
					>
						<span className="absolute -left-2 -top-3 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
							{region.order}
						</span>
					</div>
				);
			})}
		</div>
	);
}
