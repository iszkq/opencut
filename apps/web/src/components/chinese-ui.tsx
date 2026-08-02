"use client";

import { useEffect } from "react";

// Fallback for labels supplied by third-party components. Core editor labels are
// translated in their own source files so screen readers and tooltips also work.
const translations: Record<string, string> = {
	"New project": "\u65b0\u5efa\u9879\u76ee",
	Text: "\u6587\u5b57",
	Stickers: "\u8d34\u7eb8",
	Transitions: "\u8f6c\u573a",
	Adjustment: "\u8c03\u6574",
	"Search...": "\u641c\u7d22...",
	All: "\u5168\u90e8",
	Flags: "\u65d7\u5e1c",
	Shapes: "\u5f62\u72b6",
	"New Project": "\u65b0\u5efa\u9879\u76ee",
	"Untitled Project": "\u672a\u547d\u540d\u9879\u76ee",
	Assets: "\u7d20\u6750",
	Media: "\u5a92\u4f53",
	Effects: "\u6548\u679c",
	Sound: "\u97f3\u6548",
	Sounds: "\u97f3\u6548",
	"Search sound effects": "\u641c\u7d22\u97f3\u6548",
	"Loading sounds...": "\u6b63\u5728\u52a0\u8f7d\u97f3\u6548...",
	"No sounds found": "\u6ca1\u6709\u627e\u5230\u97f3\u6548",
	"No sounds available": "\u6682\u65e0\u53ef\u7528\u97f3\u6548",
	Import: "\u5bfc\u5165",
	"Export clips": "\u5bfc\u51fa\u7247\u6bb5",
	"Main scene": "\u4e3b\u573a\u666f",
	Scenes: "\u573a\u666f",
	"Add scene": "\u6dfb\u52a0\u573a\u666f",
	"Delete Scenes": "\u5220\u9664\u573a\u666f",
	"Project info": "\u9879\u76ee\u4fe1\u606f",
	Background: "\u80cc\u666f",
	Name: "\u540d\u79f0",
	"Frame rate": "\u5e27\u7387",
	"Aspect ratio": "\u753b\u9762\u6bd4\u4f8b",
	Blur: "\u6a21\u7cca",
	Color: "\u989c\u8272",
	Settings: "\u8bbe\u7f6e",
	Properties: "\u5c5e\u6027",
	"It's empty here": "\u8fd9\u91cc\u662f\u7a7a\u7684",
	"Select an item on the timeline to edit its properties":
		"\u5728\u65f6\u95f4\u7ebf\u4e0a\u9009\u62e9\u5143\u7d20\u4ee5\u7f16\u8f91\u5c5e\u6027",
	"Drag and drop videos, images, and audio files here":
		"\u5c06\u89c6\u9891\u3001\u56fe\u7247\u6216\u97f3\u9891\u6587\u4ef6\u62d6\u5230\u8fd9\u91cc",
	"Drop files here": "\u5c06\u6587\u4ef6\u62d6\u5230\u8fd9\u91cc",
	"No media assets": "\u6682\u65e0\u7d20\u6750",
	"No projects yet": "\u8fd8\u6ca1\u6709\u9879\u76ee",
	"Create project": "\u521b\u5efa\u9879\u76ee",
	"Delete project": "\u5220\u9664\u9879\u76ee",
	Delete: "\u5220\u9664",
	Cancel: "\u53d6\u6d88",
	Confirm: "\u786e\u8ba4",
	Save: "\u4fdd\u5b58",
	Close: "\u5173\u95ed",
	Done: "\u5b8c\u6210",
	Next: "\u4e0b\u4e00\u6b65",
	Finish: "\u5b8c\u6210",
	Back: "\u8fd4\u56de",
	"Search assets": "\u641c\u7d22\u7d20\u6750",
	Search: "\u641c\u7d22",
	"Sort by": "\u6392\u5e8f\u65b9\u5f0f",
	"Grid view": "\u7f51\u683c\u89c6\u56fe",
	"List view": "\u5217\u8868\u89c6\u56fe",
	Timeline: "\u65f6\u95f4\u7ebf",
	Play: "\u64ad\u653e",
	Pause: "\u6682\u505c",
	Mute: "\u9759\u97f3",
	Unmute: "\u53d6\u6d88\u9759\u97f3",
	Volume: "\u97f3\u91cf",
	Opacity: "\u4e0d\u900f\u660e\u5ea6",
	Position: "\u4f4d\u7f6e",
	Size: "\u5927\u5c0f",
	Rotation: "\u65cb\u8f6c",
	Transform: "\u53d8\u6362",
	Animations: "\u52a8\u753b",
	Masks: "\u8499\u7248",
	"Add effect": "\u6dfb\u52a0\u6548\u679c",
	"Add animation": "\u6dfb\u52a0\u52a8\u753b",
	"Add mask": "\u6dfb\u52a0\u8499\u7248",
	Copy: "\u590d\u5236",
	Paste: "\u7c98\u8d34",
	Cut: "\u526a\u5207",
	Duplicate: "\u590d\u5236\u4e00\u4efd",
	Split: "\u5206\u5272",
	Remove: "\u79fb\u9664",
	Undo: "\u64a4\u9500",
	Redo: "\u91cd\u505a",
	Fit: "\u9002\u5e94",
	Fill: "\u586b\u5145",
	"Original size": "\u539f\u59cb\u5927\u5c0f",
	"Loading...": "\u6b63\u5728\u52a0\u8f7d...",
	"Saving...": "\u6b63\u5728\u4fdd\u5b58...",
	Saved: "\u5df2\u4fdd\u5b58",
	"Uploading...": "\u6b63\u5728\u5bfc\u5165...",
	"Failed to upload": "\u5bfc\u5165\u5931\u8d25",
	"Split element": "\u5206\u5272\u5143\u7d20",
	"Split left": "\u4ece\u5de6\u4fa7\u5206\u5272",
	"Split right": "\u4ece\u53f3\u4fa7\u5206\u5272",
	"Duplicate element": "\u590d\u5236\u5143\u7d20",
	"Delete element": "\u5220\u9664\u5143\u7d20",
	"Add bookmark": "\u6dfb\u52a0\u4e66\u7b7e",
	"Remove bookmark": "\u79fb\u9664\u4e66\u7b7e",
	"Freeze frame (coming soon)": "\u5b9a\u683c\u529f\u80fd\u5373\u5c06\u63a8\u51fa",
	"No Scene": "\u65e0\u573a\u666f",
	"Keyboard shortcuts": "\u5feb\u6377\u952e",
	"Play/Pause": "\u64ad\u653e/\u6682\u505c",
	"Stop playback": "\u505c\u6b62\u64ad\u653e",
	"Seek forward 1 second": "\u524d\u8fdb 1 \u79d2",
	"Seek backward 1 second": "\u540e\u9000 1 \u79d2",
	"Frame step forward": "\u4e0b\u4e00\u5e27",
	"Frame step backward": "\u4e0a\u4e00\u5e27",
	"Jump forward 5 seconds": "\u524d\u8fdb 5 \u79d2",
	"Jump backward 5 seconds": "\u540e\u9000 5 \u79d2",
	"Go to timeline start": "\u8df3\u5230\u65f6\u95f4\u7ebf\u5f00\u5934",
	"Go to timeline end": "\u8df3\u5230\u65f6\u95f4\u7ebf\u7ed3\u5c3e",
	"Split elements at playhead": "\u5728\u64ad\u653e\u5934\u5904\u5206\u5272\u5143\u7d20",
	"Split and remove left": "\u5206\u5272\u5e76\u5220\u9664\u5de6\u4fa7",
	"Split and remove right": "\u5206\u5272\u5e76\u5220\u9664\u53f3\u4fa7",
	"Delete current selection": "\u5220\u9664\u5f53\u524d\u9009\u4e2d\u5185\u5bb9",
	"Copy selected elements": "\u590d\u5236\u9009\u4e2d\u5143\u7d20",
	"Paste elements at playhead": "\u5728\u64ad\u653e\u5934\u5904\u7c98\u8d34\u5143\u7d20",
	"Toggle snapping": "\u5207\u6362\u5438\u9644",
	"Toggle ripple editing": "\u5207\u6362\u6ce2\u7eb9\u7f16\u8f91",
	"Extract or recover source audio": "\u5206\u79bb\u6216\u5408\u5e76\u89c6\u9891\u539f\u58f0",
	"Select all elements": "\u9009\u4e2d\u6240\u6709\u5143\u7d20",
	"Cancel current interaction": "\u53d6\u6d88\u5f53\u524d\u64cd\u4f5c",
	"Deselect all elements": "\u53d6\u6d88\u9009\u4e2d\u6240\u6709\u5143\u7d20",
	"Duplicate selected element": "\u590d\u5236\u9009\u4e2d\u5143\u7d20",
	"Mute/unmute selected elements": "\u9759\u97f3/\u53d6\u6d88\u9759\u97f3\u9009\u4e2d\u5143\u7d20",
	"Show/hide selected elements": "\u663e\u793a/\u9690\u85cf\u9009\u4e2d\u5143\u7d20",
	"Toggle bookmark at playhead": "\u5728\u64ad\u653e\u5934\u5904\u5207\u6362\u4e66\u7b7e",
	"No results found": "\u6ca1\u6709\u627e\u5230\u7ed3\u679c",
	"No effects": "\u6682\u65e0\u6548\u679c",
	"No masks": "\u6682\u65e0\u8499\u7248",
	"Sound effects": "\u97f3\u6548",
	"No saved sounds": "\u6ca1\u6709\u5df2\u4fdd\u5b58\u7684\u97f3\u6548",
	"Clear all saved sounds?": "\u6e05\u7a7a\u6240\u6709\u5df2\u4fdd\u5b58\u7684\u97f3\u6548\uff1f",
	Stroke: "\u63cf\u8fb9",
	Effect: "\u6548\u679c",
	"Rename project": "\u91cd\u547d\u540d\u9879\u76ee",
	"New name": "\u65b0\u540d\u79f0",
	Rename: "\u91cd\u547d\u540d",
	Warning: "\u8b66\u544a",
	Guides: "\u5f15\u5bfc\u7ebf",
	Note: "\u5907\u6ce8",
	Duration: "\u65f6\u957f",
	"Loading project...": "\u6b63\u5728\u52a0\u8f7d\u9879\u76ee...",
	"Exiting project...": "\u6b63\u5728\u9000\u51fa\u9879\u76ee...",
	"Don't lose your projects": "\u4fdd\u7559\u4f60\u7684\u9879\u76ee",
	Allow: "\u5141\u8bb8",
};

function translate(value: string): string {
	const trimmed = value.trim();
	const translated = translations[trimmed];
	return translated ? value.replace(trimmed, translated) : value;
}

function isExcluded(element: Element | null): boolean {
	return Boolean(
		element?.closest(
			"script, style, code, pre, textarea, input, [data-no-zh-translate]",
		),
	);
}

function translateNode(node: Node): void {
	if (node instanceof Text) {
		if (!isExcluded(node.parentElement)) {
			const translated = translate(node.data);
			if (translated !== node.data) node.data = translated;
		}
		return;
	}
	if (!(node instanceof HTMLElement) || isExcluded(node)) return;
	for (const attribute of ["aria-label", "title", "placeholder"]) {
		const value = node.getAttribute(attribute);
		if (!value) continue;
		const translated = translate(value);
		if (translated !== value) node.setAttribute(attribute, translated);
	}
	for (const child of Array.from(node.childNodes)) translateNode(child);
}

export function ChineseUi(): null {
	useEffect(() => {
		translateNode(document.body);
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === "characterData") translateNode(mutation.target);
				else for (const node of Array.from(mutation.addedNodes)) translateNode(node);
			}
		});
		observer.observe(document.body, { childList: true, subtree: true, characterData: true });
		return () => observer.disconnect();
	}, []);
	return null;
}
