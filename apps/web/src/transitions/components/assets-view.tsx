"use client";

import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	CircleDot,
	ZoomIn,
	type LucideIcon,
} from "lucide-react";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	TRANSITIONS,
	type TransitionDefinition,
	type TransitionUsage,
} from "@/transitions/definitions";

const previewIcons = {
	fade: CircleDot,
	zoom: ZoomIn,
	"slide-left": ArrowLeft,
	"slide-right": ArrowRight,
	"slide-up": ArrowUp,
	"slide-down": ArrowDown,
	"slide-left-out": ArrowLeft,
	"slide-right-out": ArrowRight,
	"slide-up-out": ArrowUp,
	"slide-down-out": ArrowDown,
} as const;

const sections: Array<{
	usage: TransitionUsage;
	title: string;
	description: string;
}> = [
	{
		usage: "cut",
		title: "转场",
		description: "拖到两个紧挨片段中间的接缝，放开即生效",
	},
	{
		usage: "in",
		title: "入场",
		description: "拖到片段左边缘，只作用于该片段的开始",
	},
	{
		usage: "out",
		title: "出场",
		description: "拖到片段右边缘，只作用于该片段的结束",
	},
];

export function TransitionsView() {
	return (
		<PanelView title="转场与动画" contentClassName="space-y-4 pb-3">
			{sections.map((section) => {
				const transitions = TRANSITIONS.filter((transition) =>
					transition.usages.includes(section.usage),
				);
				return (
					<section key={section.usage} className="space-y-2">
						<div>
							<h3 className="text-xs font-semibold">{section.title}</h3>
							<p className="text-[10px] leading-4 text-muted-foreground">
								{section.description}
							</p>
						</div>
						<div className="grid grid-cols-2 gap-2">
							{transitions.map((transition) => (
								<TransitionCard
									key={`${section.usage}-${transition.id}`}
									transition={transition}
									usage={section.usage}
								/>
							))}
						</div>
					</section>
				);
			})}
		</PanelView>
	);
}

function TransitionCard({
	transition,
	usage,
}: {
	transition: TransitionDefinition;
	usage: TransitionUsage;
}) {
	const Icon = previewIcons[transition.id];
	const seconds = usage === "out" ? transition.defaultOutDuration : transition.defaultInDuration;
	return (
		<div className="overflow-hidden rounded-md border bg-background">
			<DraggableItem
				name={transition.name}
				dragData={{
					id: `${usage}-${transition.id}`,
					name: transition.name,
					type: "transition",
					transitionId: transition.id,
					transitionUsage: usage,
				}}
				preview={
					<TransitionPreview Icon={Icon} transitionId={transition.id} />
				}
				containerClassName="w-full"
				shouldShowLabel={false}
				shouldShowPlusOnDrag={false}
				isRounded={false}
			/>
			<div className="space-y-1.5 p-2">
				<div className="min-w-0">
					<p className="truncate text-xs font-medium">{transition.name}</p>
					<p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
						{transition.description}
					</p>
				</div>
				<p className="text-[10px] text-muted-foreground">默认 {seconds.toFixed(1)} 秒</p>
			</div>
		</div>
	);
}

function TransitionPreview({
	Icon,
	transitionId,
}: {
	Icon: LucideIcon;
	transitionId: TransitionDefinition["id"];
}) {
	const motionClass = transitionId.replaceAll("-", "_");
	return (
		<div
			className={`opencut-transition-preview-card opencut-transition-preview-${motionClass} relative flex size-full items-center justify-center overflow-hidden border-b bg-linear-to-br from-slate-800 to-slate-600`}
			title="效果预览会自动循环播放"
		>
			<div className="absolute inset-y-2 left-2 w-1/2 rounded bg-cyan-400/80" />
			<div className="opencut-transition-preview-layer absolute inset-y-2 right-2 w-1/2 rounded bg-violet-400/90" />
			<div className="relative z-10 flex size-8 items-center justify-center rounded-full bg-black/35 text-white">
				<Icon className="size-4" strokeWidth={1.8} />
			</div>
			<span className="absolute bottom-1 right-1 rounded bg-black/40 px-1 text-[9px] text-white">预览</span>
		</div>
	);
}
