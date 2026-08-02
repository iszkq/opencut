import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { buildTextElement } from "@/timeline/element-utils";
import type { ParamValues } from "@/params";
import type { MediaTime } from "@/wasm";

type TextTemplate = {
	id: string;
	name: string;
	content: string;
	preview: string;
	className: string;
	params: Partial<ParamValues>;
};

const templates: TextTemplate[] = [
	{ id: "title", name: "主标题", content: "主标题", preview: "主标题", className: "text-white text-xl font-bold", params: { fontSize: 22, fontWeight: "bold", color: "#ffffff", textAlign: "center" } },
	{ id: "subtitle", name: "副标题", content: "副标题说明文字", preview: "副标题", className: "text-white text-sm", params: { fontSize: 10, color: "#ffffff", textAlign: "center" } },
	{ id: "yellow", name: "醒目黄字", content: "醒目标题", preview: "醒目黄字", className: "text-yellow-300 text-lg font-bold", params: { fontSize: 18, fontWeight: "bold", color: "#FDE047", textAlign: "center" } },
	{ id: "black-card", name: "黑底白字", content: "重点信息", preview: "黑底白字", className: "rounded bg-black/80 px-2 py-1 text-white text-sm font-bold", params: { fontSize: 12, fontWeight: "bold", color: "#ffffff", "background.enabled": true, "background.color": "#000000D9", "background.cornerRadius": 18, "background.paddingX": 34, "background.paddingY": 20 } },
	{ id: "white-card", name: "白底黑字", content: "重点信息", preview: "白底黑字", className: "rounded bg-white px-2 py-1 text-black text-sm font-bold", params: { fontSize: 12, fontWeight: "bold", color: "#111827", "background.enabled": true, "background.color": "#FFFFFFFF", "background.cornerRadius": 18, "background.paddingX": 34, "background.paddingY": 20 } },
	{ id: "quote", name: "引用文字", content: "“一句值得记住的话”", preview: "“引用文字”", className: "text-white text-sm italic", params: { fontSize: 11, fontStyle: "italic", color: "#ffffff", textAlign: "center", letterSpacing: 0.6 } },
	{ id: "label", name: "角标标签", content: "小标签", preview: "角标标签", className: "rounded bg-sky-500 px-2 py-1 text-white text-xs font-bold", params: { fontSize: 9, fontWeight: "bold", color: "#ffffff", "background.enabled": true, "background.color": "#0EA5E9", "background.cornerRadius": 12, "background.paddingX": 26, "background.paddingY": 14, "transform.positionX": -330, "transform.positionY": -190 } },
	{ id: "number", name: "数字强调", content: "01", preview: "01", className: "text-sky-300 text-2xl font-bold", params: { fontSize: 28, fontWeight: "bold", color: "#7DD3FC", textAlign: "center" } },
	{ id: "end", name: "片尾署名", content: "感谢观看", preview: "感谢观看", className: "text-white text-base font-bold", params: { fontSize: 16, fontWeight: "bold", color: "#ffffff", textAlign: "center", letterSpacing: 1.2 } },
];

export function TextView() {
	const editor = useEditor();
	const handleAddToTimeline = ({ template, currentTime }: { template: TextTemplate; currentTime: MediaTime }) => {
		if (!editor.scenes.getActiveScene()) return;
		editor.timeline.insertElement({
			element: buildTextElement({ raw: { name: template.name, params: { content: template.content, ...template.params } }, startTime: currentTime }),
			placement: { mode: "auto" },
		});
	};

	return (
		<PanelView title="文字">
			<div className="grid grid-cols-2 gap-2">
				{templates.map((template) => (
					<DraggableItem
						key={template.id}
						name={template.name}
						preview={<div className="flex size-full items-center justify-center bg-linear-to-br from-slate-700 to-slate-950 p-2 text-center"><span className={template.className}>{template.preview}</span></div>}
						dragData={{ id: `text-${template.id}`, type: "text", name: template.name, content: template.content, params: template.params }}
						onAddToTimeline={({ currentTime }) => handleAddToTimeline({ template, currentTime })}
						aspectRatio={16 / 9}
						containerClassName="w-full"
					/>
				))}
			</div>
		</PanelView>
	);
}
