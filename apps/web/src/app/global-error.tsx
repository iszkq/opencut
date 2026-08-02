"use client";

export const dynamic = "force-dynamic";

export default function GlobalError({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<html lang="zh-CN">
			<body>
				<main>
					<h1>OpenCut 出现问题</h1>
					<button type="button" onClick={() => reset()}>
						重新加载
					</button>
				</main>
			</body>
		</html>
	);
}
