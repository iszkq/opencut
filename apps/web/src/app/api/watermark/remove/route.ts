import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const MAX_VIDEO_PIXELS = 100_000_000;
const VIDEO_EXTENSIONS = new Set([
	".mp4",
	".mov",
	".m4v",
	".mkv",
	".webm",
	".avi",
	".wmv",
	".mpeg",
	".mpg",
]);

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

function parseInteger(value: FormDataEntryValue | null, minimum: number, maximum: number) {
	if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
		? parsed
		: null;
}

function getExtension(file: File): string {
	const extension = path.extname(file.name).toLowerCase();
	return /^[.][a-z0-9]{1,8}$/.test(extension) ? extension : ".mp4";
}

function isVideoFile(file: File): boolean {
	return file.type.startsWith("video/") || VIDEO_EXTENSIONS.has(path.extname(file.name).toLowerCase());
}

function createMask({ width, height, x, y, maskWidth, maskHeight }: {
	width: number;
	height: number;
	x: number;
	y: number;
	maskWidth: number;
	maskHeight: number;
}): Buffer {
	// PGM is a tiny, dependency-free grayscale mask format. White marks pixels
	// that FFmpeg's local repair filter should reconstruct.
	const pixels = Buffer.alloc(width * height);
	const xEnd = Math.min(width, x + maskWidth);
	const yEnd = Math.min(height, y + maskHeight);
	for (let row = y; row < yEnd; row += 1) {
		pixels.fill(255, row * width + x, row * width + xEnd);
	}
	return Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`, "ascii"), pixels]);
}

function asFilterPath(filePath: string): string {
	// FFmpeg filter options use ':' as a separator, including on Windows.
	return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function chooseVideoEncoder(ffmpeg: string): Promise<string[]> {
	try {
		const { stdout, stderr } = await execFileAsync(ffmpeg, ["-hide_banner", "-encoders"], {
			windowsHide: true,
			maxBuffer: 4 * 1024 * 1024,
		});
		const encoders = `${stdout}\n${stderr}`;
		// Hardware encoders are tested by FFmpeg when encoding begins. NVENC is
		// first because it is the most broadly available discrete GPU option.
		if (/\bh264_nvenc\b/.test(encoders)) return ["h264_nvenc", "-preset", "p5", "-cq", "21"];
		if (/\bh264_qsv\b/.test(encoders)) return ["h264_qsv", "-preset", "medium", "-global_quality", "21"];
		if (/\bh264_amf\b/.test(encoders)) return ["h264_amf", "-quality", "balanced", "-qp_i", "21"];
	} catch {
		// The bundled encoder list should be available; use the compatible path below.
	}
	return ["libx264", "-preset", "medium", "-crf", "18"];
}

async function renderWithEncoder({
	ffmpeg,
	inputPath,
	outputPath,
	filter,
	encoder,
}: {
	ffmpeg: string;
	inputPath: string;
	outputPath: string;
	filter: string;
	encoder: string[];
}) {
	await execFileAsync(
		ffmpeg,
		[
			"-hide_banner",
			"-y",
			"-i",
			inputPath,
			"-map",
			"0:v:0",
			"-map",
			"0:a?",
			"-vf",
			filter,
			"-c:v",
			...encoder,
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			"-movflags",
			"+faststart",
			outputPath,
		],
		{ windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
	);
}

export async function GET() {
	return NextResponse.json({
		available: process.env.OPENCUT_DESKTOP === "1" && Boolean(await findFfmpeg()),
	});
}

export async function POST(request: Request) {
	if (process.env.OPENCUT_DESKTOP !== "1") {
		return NextResponse.json({ error: "此功能仅在桌面版可用。" }, { status: 403 });
	}
	const ffmpeg = await findFfmpeg();
	if (!ffmpeg) {
		return NextResponse.json({ error: "未找到内置视频处理组件。" }, { status: 503 });
	}

	const formData = await request.formData();
	const video = formData.get("video");
	if (!(video instanceof File) || !isVideoFile(video) || video.size > MAX_VIDEO_BYTES) {
		return NextResponse.json({ error: "请选择不超过 1GB 的视频文件。" }, { status: 400 });
	}

	const width = parseInteger(formData.get("videoWidth"), 16, 16384);
	const height = parseInteger(formData.get("videoHeight"), 16, 16384);
	const x = parseInteger(formData.get("x"), 0, 16383);
	const y = parseInteger(formData.get("y"), 0, 16383);
	const maskWidth = parseInteger(formData.get("width"), 2, 16384);
	const maskHeight = parseInteger(formData.get("height"), 2, 16384);
	const mode = formData.get("mode") === "fast" ? "fast" : "smart";
	if (!width || !height || width * height > MAX_VIDEO_PIXELS || x === null || y === null || !maskWidth || !maskHeight || x + maskWidth > width || y + maskHeight > height) {
		return NextResponse.json({ error: "水印区域无效，请重新框选。" }, { status: 400 });
	}

	const workingDirectory = await mkdtemp(path.join(tmpdir(), "opencut-watermark-"));
	try {
		const inputPath = path.join(workingDirectory, `input${getExtension(video)}`);
		const maskPath = path.join(workingDirectory, "watermark-mask.pgm");
		const outputPath = path.join(workingDirectory, "watermark-removed.mp4");
		await writeFile(inputPath, Buffer.from(await video.arrayBuffer()));

		const padding = mode === "smart" ? 2 : 0;
		const paddedX = Math.max(0, x - padding);
		const paddedY = Math.max(0, y - padding);
		const paddedWidth = Math.min(width - paddedX, maskWidth + padding * 2);
		const paddedHeight = Math.min(height - paddedY, maskHeight + padding * 2);
		const filter = mode === "smart"
			? `removelogo=f='${asFilterPath(maskPath)}'`
			: `delogo=x=${paddedX}:y=${paddedY}:w=${paddedWidth}:h=${paddedHeight}:show=0`;

		let encoder = await chooseVideoEncoder(ffmpeg);
		try {
			if (mode === "smart") {
				await writeFile(maskPath, createMask({ width, height, x: paddedX, y: paddedY, maskWidth: paddedWidth, maskHeight: paddedHeight }));
			}
			await renderWithEncoder({ ffmpeg, inputPath, outputPath, filter, encoder });
		} catch (error) {
			// Drivers may expose an encoder without a usable device. Retry once with
			// the bundled software encoder so the feature remains portable.
			if (encoder[0] === "libx264") throw error;
			encoder = ["libx264", "-preset", "medium", "-crf", "18"];
			await renderWithEncoder({ ffmpeg, inputPath, outputPath, filter, encoder });
		}

		const output = await readFile(outputPath);
		return new NextResponse(output, {
			headers: {
				"Content-Type": "video/mp4",
				"Content-Disposition": 'attachment; filename="watermark-removed.mp4"',
				"X-OpenCut-Watermark-Mode": mode,
				"X-OpenCut-Video-Encoder": encoder[0],
			},
		});
	} catch (error) {
		console.error("Local watermark removal failed", error);
		return NextResponse.json({ error: "本地修复失败，请缩小区域后重试。" }, { status: 500 });
	} finally {
		await rm(workingDirectory, { recursive: true, force: true });
	}
}
