"use client";

import { useState } from "react";
import type { ParamValues } from "@/params";
import type { Effect } from "@/effects/types";
import type { EffectElement, VisualElement } from "@/timeline";
import { effectsRegistry } from "@/effects";
import { useEditor } from "@/editor/use-editor";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
	SectionFields,
} from "@/components/section";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Delete02Icon,
	ViewIcon,
	ViewOffSlashIcon,
	MagicWand05Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";
import { Separator } from "@/components/ui/separator";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import {
	HAND_DRAW_DIRECTIONS,
	isHandDrawDirection,
	parseHandDrawRegions,
	serializeHandDrawRegions,
	type HandDrawDirection,
	type HandDrawRegion,
} from "@/effects/hand-draw-regions";

export function StandaloneEffectTab({
	element,
	trackId,
}: {
	element: EffectElement;
	trackId: string;
}) {
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const effect: Effect = {
		id: element.id,
		type: element.effectType,
		params: element.params,
		enabled: true,
	};

	const previewParam = (key: string) => (value: number | string | boolean) => {
		previewUpdates({
			params: { ...(renderElement as EffectElement).params, [key]: value },
		});
	};

	return (
		<div className="flex flex-col h-full">
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center">
				<SectionTitle>效果</SectionTitle>
			</div>
			<EffectSection
				effect={effect}
				renderParams={(renderElement as EffectElement).params}
				previewParam={previewParam}
				onCommit={commit}
			/>
		</div>
	);
}

export function ClipEffectsTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const editor = useEditor();
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const effects: Effect[] = element.effects ?? [];

	const getRenderParams = ({ effectId }: { effectId: string }): ParamValues => {
		return (
			(renderElement as VisualElement).effects?.find((ef) => ef.id === effectId)
				?.params ??
			effects.find((ef) => ef.id === effectId)?.params ??
			{}
		);
	};

	const buildPreviewParam =
		(effectId: string) =>
		(key: string) =>
		(value: number | string | boolean) => {
			const updatedEffects = (
				(renderElement as VisualElement).effects ?? []
			).map((existing) =>
				existing.id !== effectId
					? existing
					: { ...existing, params: { ...existing.params, [key]: value } },
			);
			previewUpdates({ effects: updatedEffects });
		};

	const handleDragStart = ({ index }: { index: number }) => setDragIndex(index);

	const handleDragOver = ({
		event,
		index,
	}: {
		event: React.DragEvent;
		index: number;
	}) => {
		event.preventDefault();
		if (index !== dropIndex) setDropIndex(index);
	};

	const handleDrop = ({ toIndex }: { toIndex: number }) => {
		if (dragIndex !== null && dragIndex !== toIndex) {
			editor.timeline.reorderClipEffects({
				trackId,
				elementId: element.id,
				fromIndex: dragIndex,
				toIndex,
			});
		}
		setDragIndex(null);
		setDropIndex(null);
	};

	const handleDragEnd = () => {
		setDragIndex(null);
		setDropIndex(null);
	};

	return (
		<div className="flex flex-col h-full">
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center">
				<SectionTitle>效果</SectionTitle>
			</div>
			{effects.length === 0 ? (
				<EmptyView />
			) : (
				<ul className="flex flex-col">
					{effects.map((effect, index) => {
						const resolvedDragIndex = dragIndex ?? -1;
						const isDragging = dragIndex === index;
						const isDropTarget =
							dropIndex === index && dragIndex !== null && dragIndex !== index;
						const showTopDropIndicator =
							isDropTarget && index < resolvedDragIndex;
						const showBottomDropIndicator =
							isDropTarget && index > resolvedDragIndex;

						return (
							<li
								key={effect.id}
								draggable
								onDragStart={() => handleDragStart({ index })}
								onDragOver={(event) => handleDragOver({ event, index })}
								onDrop={() => handleDrop({ toIndex: index })}
								onDragEnd={handleDragEnd}
								className={cn(
									"group list-none",
									isDragging && "opacity-40",
									showTopDropIndicator && "border-t-2 border-primary",
									showBottomDropIndicator && "border-b-2 border-primary",
								)}
							>
								<EffectSection
									effect={effect}
									renderParams={getRenderParams({ effectId: effect.id })}
									previewParam={buildPreviewParam(effect.id)}
									onCommit={commit}
									onToggle={() =>
										editor.timeline.toggleClipEffect({
											trackId,
											elementId: element.id,
											effectId: effect.id,
										})
									}
									onRemove={() =>
										editor.timeline.removeClipEffect({
											trackId,
											elementId: element.id,
											effectId: effect.id,
										})
									}
								/>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function EmptyView() {
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);

	return (
		<div className="flex flex-col h-full items-center justify-center gap-4 text-center">
			<HugeiconsIcon
				icon={MagicWand05Icon}
				className="size-10 text-muted-foreground"
				strokeWidth={1}
			/>
			<div className="flex flex-col gap-2">
				<h3 className="font-medium text-foreground">暂无效果</h3>
				<p className="text-muted-foreground text-sm text-balance max-w-44">
					可在左侧素材面板中为此片段添加效果。
				</p>
			</div>
			<Button
				variant="default"
				size="sm"
				onClick={() => setActiveTab("effects")}
			>
				打开效果
			</Button>
		</div>
	);
}

function EffectSection({
	effect,
	renderParams,
	previewParam,
	onCommit,
	onToggle,
	onRemove,
}: {
	effect: Effect;
	renderParams: ParamValues;
	previewParam: (key: string) => (value: number | string | boolean) => void;
	onCommit: () => void;
	onToggle?: () => void;
	onRemove?: () => void;
}) {
	const definition = effectsRegistry.get(effect.type);
	const handDrawRegions =
		effect.type === "hand-draw"
			? parseHandDrawRegions({ value: renderParams.drawRegions })
			: [];
	const updateHandDrawRegions = (regions: HandDrawRegion[]) => {
		previewParam("drawRegions")(serializeHandDrawRegions({ regions }));
		onCommit();
	};

	return (
		<Section
			sectionKey={onToggle ? `clip-effect:${effect.id}` : undefined}
			showTopBorder={false}
		>
			<SectionHeader
				className={cn(onToggle && "cursor-move")}
				trailing={
					onToggle && (
						<div className="flex items-center gap-1">
							<Button
								variant={effect.enabled ? "secondary" : "ghost"}
								size="icon"
								aria-label={`启用或停用${definition.name}`}
								onClick={onToggle}
							>
								<HugeiconsIcon
									icon={effect.enabled ? ViewIcon : ViewOffSlashIcon}
								/>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`移除${definition.name}`}
								onClick={onRemove}
							>
								<HugeiconsIcon icon={Delete02Icon} />
							</Button>
						</div>
					)
				}
			>
				<SectionTitle
					className={cn(onToggle && !effect.enabled && "text-muted-foreground")}
				>
					{definition.name}
				</SectionTitle>
			</SectionHeader>
			<SectionContent
				className={cn("p-0", onToggle && !effect.enabled && "opacity-50")}
			>
				<SectionFields>
					{definition.params
						.filter(
							(param) =>
								!(
									effect.type === "hand-draw" &&
									(param.key === "drawDuration" || param.key === "drawRegions")
								),
						)
						.map((param) => (
							<div key={param.key} className="flex flex-col gap-3.5">
								<div className="px-4">
									<PropertyParamField
											param={param}
											value={renderParams[param.key] ?? param.default}
											onPreview={previewParam(param.key)}
											onCommit={onCommit}
										/>
										{effect.type === "hand-draw" && param.key === "colorDelay" ? (
											<HandDrawParamHint paramKey={param.key} />
										) : effect.type === "hand-draw" ? (
											<HandDrawParamHint paramKey={param.key} />
										) : null}
								</div>
								<Separator />
							</div>
						))}
					{effect.type === "hand-draw" ? (
						<HandDrawRegionsSection
							regions={handDrawRegions}
							onChange={updateHandDrawRegions}
						/>
					) : null}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

function HandDrawParamHint({ paramKey }: { paramKey: string }) {
	const hint =
		paramKey === "lineStrength"
			? "范围：0%–100%。数值越高，线稿越清晰、越浓；建议 55%–80%。"
			: paramKey === "colorDelay"
				? "范围：0%–90%。0% 表示笔尖经过即上色；46% 表示当前分区画到约一半后才渐进上色。分区画完时会自动补全该分区颜色。"
				: paramKey === "roughness"
					? "范围：0%–100%。数值越低线条越平滑；数值越高越有手绘颗粒感；建议 35%–70%。"
					: null;
	return hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null;
}

function HandDrawRegionsSection({
	regions,
	onChange,
}: {
	regions: HandDrawRegion[];
	onChange: (regions: HandDrawRegion[]) => void;
}) {
	const updateDirection = ({ id, direction }: { id: string; direction: HandDrawDirection }) =>
		onChange(
			regions.map((region) =>
				region.id === id ? { ...region, direction } : region,
			),
		);

	return (
		<div className="flex flex-col gap-3 px-4 pb-4">
			<div className="flex items-center justify-between gap-3 text-sm">
				<span className="font-medium">分区绘制</span>
				{regions.length > 0 ? (
					<Button variant="ghost" size="sm" onClick={() => onChange([])}>
						清空分区
					</Button>
				) : null}
			</div>
			<p className="text-xs text-muted-foreground">
				开启“编辑分区”后，直接在预览画面拖拽框选。编号决定绘制先后。
			</p>
			{regions.map((region, index) => (
				<div
					key={region.id}
					className="flex items-center gap-2 rounded-md border bg-muted/30 p-2"
				>
					<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
						{index + 1}
					</span>
					<select
						className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
						value={region.direction}
						onChange={(event) =>
							updateDirection({
								id: region.id,
								direction: isHandDrawDirection(event.target.value)
									? event.target.value
									: "left-to-right",
							})
						}
					>
						{HAND_DRAW_DIRECTIONS.map((direction) => (
							<option key={direction} value={direction}>
								{direction === "left-to-right"
									? "左→右，上→下"
									: direction === "right-to-left"
										? "右→左，上→下"
										: direction === "top-to-bottom"
											? "上→下，左→右"
											: "下→上，左→右"}
							</option>
						))}
					</select>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`删除分区 ${index + 1}`}
						onClick={() => onChange(regions.filter((item) => item.id !== region.id))}
					>
						<HugeiconsIcon icon={Delete02Icon} />
					</Button>
				</div>
			))}
		</div>
	);
}
