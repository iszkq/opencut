"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadFullFont } from "@/fonts/google-fonts";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import { useFontAtlas } from "@/fonts/use-font-atlas";
import { cn } from "@/utils/ui";
import { ChevronDown, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { TextIcon } from "@hugeicons/core-free-icons";

const FONT_TABS = [
	{ key: "all", label: "全部字体" },
	{ key: "my-fonts", label: "本机字体" },
	{ key: "favorites", label: "收藏" },
] as const;

type FontTab = (typeof FONT_TABS)[number]["key"];

const MAX_LIST_HEIGHT = 288;

interface FontPickerProps {
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
}

export function FontPicker({
	defaultValue,
	onValueChange,
	className,
}: FontPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeTab, setActiveTab] = useState<FontTab>("all");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const { status, fontNames, retry: handleRetry } = useFontAtlas({ open });

	const filteredFonts = useMemo(() => {
		const tabFonts = activeTab === "my-fonts"
			? fontNames.filter((name) => SYSTEM_FONTS.has(name))
			: activeTab === "favorites"
				? []
				: fontNames;
		if (!search) return tabFonts;
		const query = search.toLowerCase();
		return tabFonts.filter((name) => name.toLowerCase().includes(query));
	}, [activeTab, fontNames, search]);

	const handleSelect = useCallback(
		async ({ family }: { family: string }) => {
			if (!SYSTEM_FONTS.has(family)) {
				try {
					await loadFullFont({ family });
				} catch {
					// ignore load failure, font will fall back to system default
				}
			}
			onValueChange?.(family);
			setOpen(false);
		},
		[onValueChange],
	);

	useEffect(() => {
		if (!open) {
			setSearch("");
			setActiveTab("all");
		}
	}, [open]);

	const activeTabLabel =
		FONT_TABS.find((t) => t.key === activeTab)?.label.toLowerCase() ?? "";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				className={cn(
					"border-border bg-accent flex h-7 w-full cursor-pointer items-center justify-between gap-1 rounded-md border px-2.5 text-sm whitespace-nowrap focus-visible:border-primary focus-visible:ring-0 focus:outline-hidden",
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="text-muted-foreground [&_svg]:size-3.5 shrink-0">
						<HugeiconsIcon icon={TextIcon} />
					</span>
					<span className="truncate" style={{ fontFamily: defaultValue }}>
		{defaultValue ?? "选择字体"}
					</span>
				</div>
				<ChevronDown className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent
				className="w-72 p-0 overflow-hidden"
				align="start"
				side="left"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<div className="relative px-3 py-1.5">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 shrink-0 opacity-50" />
					<Input
						ref={searchInputRef}
						placeholder={`搜索${activeTabLabel}...`}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						size="xs"
						className="w-full pl-5 bg-transparent border-none! shadow-none!"
					/>
				</div>
				<div className="flex border-b px-3">
					{FONT_TABS.map((tab) => (
						<button
							key={tab.key}
							type="button"
							className={cn(
								"px-3 py-1.5 text-xs border-b-2 -mb-px",
								activeTab === tab.key
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setActiveTab(tab.key)}
						>
							{tab.label}
						</button>
					))}
				</div>
				{status === "loading" && fontNames.length === 0 && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						正在载入字体…
					</div>
				)}
				{status === "error" && (
					<div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-muted-foreground">
						<p className="text-sm text-muted-foreground text-center">
							在线字体预览载入失败，仍可使用本机字体。
						</p>
						<Button variant="outline" size="sm" onClick={handleRetry}>
							重试
						</Button>
					</div>
				)}
				{fontNames.length > 0 && filteredFonts.length === 0 && (
						<div className="py-6 text-center text-sm text-muted-foreground">
							没有找到字体。
						</div>
					)}
				{filteredFonts.length > 0 && (
					<div className="overflow-y-auto" style={{ maxHeight: MAX_LIST_HEIGHT }}>
						{filteredFonts.map((fontName) => (
							<button
								key={fontName}
								type="button"
								className={cn(
									"flex h-10 w-full cursor-pointer items-center px-3 text-left text-sm hover:bg-popover-hover",
									fontName === defaultValue && "bg-popover-hover",
								)}
								onClick={() => void handleSelect({ family: fontName })}
								style={{ fontFamily: fontName }}
							>
								{fontName}
							</button>
						))}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
