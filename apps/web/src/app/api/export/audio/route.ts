import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

async function canRun(command: string): Promise<boolean> {
	try {
		await execFileAsync(command, ["-version"], { windowsHide: true });
		return true;
	} catch {
		return false;
	}
}

async function findFfmpeg(): Promise<string | null> {
	const executable = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
	const candidates = [
		process.env.OPENCUT_FFMPEG_PATH,
		process.env.FFMPEG_PATH,
		path.join(process.cwd(), "tools", "ffmpeg", "bin", executable),
		path.join(homedir(), "Desktop", "ffmpeg", "bin", executable),
		executable,
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		if (await canRun(candidate)) return candidate;
	}

	return null;
}

export async function POST(request: Request) {
	const formData = await request.formData();
	const audio = formData.get("audio");
	const format = formData.get("format");
	if (!(audio instanceof File) || (format !== "mp3" && format !== "wav")) {
		return NextResponse.json({ error: "无效的音频导出请求" }, { status: 400 });
	}

	// WAV is already mixed into a standard 44.1 kHz, 16-bit file in the browser.
	// Keeping this path independent from FFmpeg makes WAV export available even if a
	// user runs the web build without the desktop bundle.
	if (format === "wav") {
		return new NextResponse(await audio.arrayBuffer(), {
			headers: { "Content-Type": "audio/wav" },
		});
	}

	const ffmpeg = await findFfmpeg();
	if (!ffmpeg) {
		return NextResponse.json(
			{ error: "未找到内置音频编码组件，无法生成 MP3" },
			{ status: 503 },
		);
	}

	const workingDirectory = await mkdtemp(path.join(tmpdir(), "opencut-audio-"));
	try {
		const inputPath = path.join(workingDirectory, "timeline.wav");
		const outputPath = path.join(workingDirectory, "timeline.mp3");
		await writeFile(inputPath, Buffer.from(await audio.arrayBuffer()));
		await execFileAsync(
			ffmpeg,
			[
				"-hide_banner",
				"-y",
				"-i",
				inputPath,
				"-vn",
				"-c:a",
				"libmp3lame",
				"-b:a",
				"192k",
				outputPath,
			],
			{ windowsHide: true },
		);

		return new NextResponse(await readFile(outputPath), {
			headers: { "Content-Type": "audio/mpeg" },
		});
	} catch (error) {
		console.error("Audio export failed", error);
		return NextResponse.json({ error: "音频编码失败" }, { status: 500 });
	} finally {
		await rm(workingDirectory, { recursive: true, force: true });
	}
}
