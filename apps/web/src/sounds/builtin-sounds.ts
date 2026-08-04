import type { SoundEffect } from "@/sounds/types";

/**
 * These WAV files are part of the desktop application, rather than an online
 * catalogue. Keep their ids negative so they can never collide with Freesound.
 */
export const BUILTIN_SOUND_EFFECTS: SoundEffect[] = [
	{
		id: -1,
		name: "提示·叮",
		description: "简短、清晰的提示音",
		previewUrl: "/sounds/builtin/notification-ding.wav",
		downloadUrl: "/sounds/builtin/notification-ding.wav",
		duration: 0.55,
		filename: "notification-ding.wav",
		tags: ["提示", "通知", "叮"],
	},
	{
		id: -2,
		name: "完成提示",
		description: "适合操作完成与成功反馈",
		previewUrl: "/sounds/builtin/completion.wav",
		downloadUrl: "/sounds/builtin/completion.wav",
		duration: 0.8,
		filename: "completion.wav",
		tags: ["完成", "成功", "提示"],
	},
	{
		id: -3,
		name: "纸笔划过",
		description: "适合手绘、书写和标注",
		previewUrl: "/sounds/builtin/pencil-stroke.wav",
		downloadUrl: "/sounds/builtin/pencil-stroke.wav",
		duration: 0.75,
		filename: "pencil-stroke.wav",
		tags: ["纸笔", "手绘", "书写"],
	},
	{
		id: -4,
		name: "翻页沙沙",
		description: "轻柔的翻页质感",
		previewUrl: "/sounds/builtin/page-rustle.wav",
		downloadUrl: "/sounds/builtin/page-rustle.wav",
		duration: 0.48,
		filename: "page-rustle.wav",
		tags: ["翻页", "纸张", "轻柔"],
	},
	{
		id: -5,
		name: "转场轻扫",
		description: "适合画面切换",
		previewUrl: "/sounds/builtin/swoosh.wav",
		downloadUrl: "/sounds/builtin/swoosh.wav",
		duration: 0.7,
		filename: "swoosh.wav",
		tags: ["转场", "轻扫", "切换"],
	},
	{
		id: -6,
		name: "轻按·咚",
		description: "低调的按钮与点击反馈",
		previewUrl: "/sounds/builtin/soft-tap.wav",
		downloadUrl: "/sounds/builtin/soft-tap.wav",
		duration: 0.28,
		filename: "soft-tap.wav",
		tags: ["点击", "按钮", "轻按"],
	},
];

export function matchesBuiltinSound({
	sound,
	query,
}: {
	sound: SoundEffect;
	query: string;
}): boolean {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return true;
	return [sound.name, sound.description, ...sound.tags]
		.join(" ")
		.toLocaleLowerCase()
		.includes(normalizedQuery);
}
