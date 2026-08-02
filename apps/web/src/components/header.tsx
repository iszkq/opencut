"use client";

import Link from "next/link";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
	return (
		<header className="bg-background sticky top-0 z-10 border-b">
			<div className="flex h-16 w-full items-center justify-between px-6">
				<Link href="/" className="flex items-center gap-2" aria-label="OpenCut 中文版首页">
					<img
						src="/branding/electron-app-icon.png"
						alt=""
						className="size-8 shrink-0 rounded-md dark:brightness-125"
					/>
					<span className="text-lg font-semibold tracking-tight">OpenCut</span>
				</Link>
				<div className="flex items-center gap-3">
					<Link href="/projects"><Button className="text-sm">项目<ArrowRight className="size-4" /></Button></Link>
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}
