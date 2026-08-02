"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateProjectDialog({
	isOpen,
	onOpenChange,
	onConfirm,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (name: string) => Promise<void>;
}) {
	const [name, setName] = useState("新建项目");
	const [isCreating, setIsCreating] = useState(false);

	const create = async () => {
		const nextName = name.trim() || "新建项目";
		setIsCreating(true);
		try {
			await onConfirm(nextName);
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (open) setName("新建项目");
				onOpenChange(open);
			}}
		>
			<DialogContent>
				<DialogHeader><DialogTitle>新建项目</DialogTitle></DialogHeader>
				<DialogBody>
					<Label htmlFor="new-project-name">项目名称</Label>
					<Input
						id="new-project-name"
						autoFocus
						value={name}
						onChange={(event) => setName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") void create();
						}}
					/>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
					<Button onClick={() => void create()} disabled={isCreating}>
						{isCreating ? "正在创建…" : "创建并进入"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
