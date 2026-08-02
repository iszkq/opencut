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

function getExtension(file: File): string {
	const extension = path.extname(file.name);
	return extension || ".bin";
}

export async function GET() {
	return NextResponse.json({ available: Boolean(await findFfmpeg()) });
}

export async function POST(request: Request) {
	const ffmpeg = await findFfmpeg();
	if (!ffmpeg) {
		return NextResponse.json(
			{ error: "Native export is unavailable" },
			{ status: 503 },
		);
	}

	const formData = await request.formData();
	const video = formData.get("video");
	const audio = formData.get("audio");
	if (!(video instanceof File) || (audio && !(audio instanceof File))) {
		return NextResponse.json({ error: "Invalid media files" }, { status: 400 });
	}

	const workingDirectory = await mkdtemp(path.join(tmpdir(), "opencut-export-"));
	try {
		const videoPath = path.join(workingDirectory, `video${getExtension(video)}`);
		const audioPath =
			audio instanceof File
				? path.join(workingDirectory, `audio${getExtension(audio)}`)
				: null;
		const outputPath = path.join(workingDirectory, "export.mp4");

		await writeFile(videoPath, Buffer.from(await video.arrayBuffer()));
		if (audio instanceof File && audioPath) {
			await writeFile(audioPath, Buffer.from(await audio.arrayBuffer()));
		}

		const argumentsList = ["-hide_banner", "-y", "-i", videoPath];
		if (audioPath) argumentsList.push("-i", audioPath);
		argumentsList.push("-map", "0:v:0");
		if (audioPath) argumentsList.push("-map", "1:a:0");
		argumentsList.push(
			"-c:v",
			"copy",
			"-c:a",
			"copy",
			"-shortest",
			"-movflags",
			"+faststart",
			outputPath,
		);

		await execFileAsync(ffmpeg, argumentsList, { windowsHide: true });
		const output = await readFile(outputPath);
		return new NextResponse(output, {
			headers: {
				"Content-Type": "video/mp4",
				"X-OpenCut-Native-Export": "stream-copy",
			},
		});
	} catch (error) {
		console.warn("Native export failed; browser export remains available.", error);
		return NextResponse.json({ error: "Native export failed" }, { status: 500 });
	} finally {
		await rm(workingDirectory, { recursive: true, force: true });
	}
}
