const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const { spawn, execFile } = require("node:child_process");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const { promisify } = require("node:util");

let webServer;
let desktopRecognizer;
const conversionSources = new Set();
const DEFAULT_WEB_PORT = 43337;
const WEB_PORT_CONFIG_NAME = "desktop-web-port.json";
const UPDATE_REPOSITORY = { owner: "iszkq", repo: "opencut" };
const execFileAsync = promisify(execFile);

function integer(value, min, max) {
	return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function compareVersions(left, right) {
	const parse = (value) => String(value).replace(/^v/, "").split(".").map((part) => {
		const number = Number.parseInt(part, 10);
		return Number.isInteger(number) && number >= 0 ? number : null;
	});
	const leftParts = parse(left);
	const rightParts = parse(right);
	if (leftParts.some((part) => part === null) || rightParts.some((part) => part === null)) return null;
	const length = Math.max(leftParts.length, rightParts.length);
	for (let index = 0; index < length; index += 1) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference !== 0) return Math.sign(difference);
	}
	return 0;
}

function requestUrl(url, redirects = 0) {
	return new Promise((resolve, reject) => {
		const request = https.get(url, {
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": `${app.getName()}-${app.getVersion()}`,
			},
		}, (response) => {
			const status = response.statusCode ?? 0;
			if ([301, 302, 303, 307, 308].includes(status) && response.headers.location && redirects < 5) {
				response.resume();
				resolve(requestUrl(new URL(response.headers.location, url), redirects + 1));
				return;
			}
			resolve(response);
		});
		request.once("error", reject);
	});
}

async function fetchLatestRelease() {
	const url = `https://api.github.com/repos/${UPDATE_REPOSITORY.owner}/${UPDATE_REPOSITORY.repo}/releases/latest`;
	const response = await requestUrl(url);
	if ((response.statusCode ?? 0) !== 200) {
		response.resume();
		throw new Error(`更新检查失败（HTTP ${response.statusCode ?? "未知"}）`);
	}
	const chunks = [];
	let length = 0;
	for await (const chunk of response) {
		length += chunk.length;
		if (length > 1024 * 1024) throw new Error("更新信息过大");
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function downloadInstaller({ url, version }) {
	const directory = path.join(app.getPath("temp"), "opencut-updates");
	await fsp.mkdir(directory, { recursive: true });
	const destination = path.join(directory, `OpenCut-Setup-${version}-x64.exe`);
	const temporaryPath = `${destination}.download`;
	await fsp.rm(temporaryPath, { force: true });
	const response = await requestUrl(url);
	if ((response.statusCode ?? 0) !== 200) {
		response.resume();
		throw new Error(`更新下载失败（HTTP ${response.statusCode ?? "未知"}）`);
	}
	await new Promise((resolve, reject) => {
		const output = fs.createWriteStream(temporaryPath);
		const fail = (error) => {
			response.destroy();
			output.destroy();
			reject(error);
		};
		response.once("error", fail);
		output.once("error", fail);
		output.once("finish", () => output.close(resolve));
		response.pipe(output);
	});
	await fsp.rename(temporaryPath, destination);
	return destination;
}

async function checkForUpdates({ parentWindow }) {
	if (!app.isPackaged || process.platform !== "win32") return;
	try {
		const release = await fetchLatestRelease();
		const version = String(release.tag_name || "").replace(/^v/, "");
		if (release.draft || release.prerelease || compareVersions(version, app.getVersion()) !== 1) return;
		const installer = Array.isArray(release.assets)
			? release.assets.find((asset) => /^OpenCut-Setup-.+-x64\.exe$/i.test(String(asset.name || "")))
			: null;
		if (!installer?.browser_download_url) return;

		const choice = await dialog.showMessageBox(parentWindow, {
			type: "info",
			title: "发现新版本",
			message: `OpenCut ${version} 已发布。`,
			detail: "现在下载更新包。下载完成后可立即安装，或下次自行安装。",
			buttons: ["下载更新", "暂不更新"],
			defaultId: 0,
			cancelId: 1,
		});
		if (choice.response !== 0) return;

		const installerPath = await downloadInstaller({ url: installer.browser_download_url, version });
		const installChoice = await dialog.showMessageBox(parentWindow, {
			type: "info",
			title: "更新已下载",
			message: "更新包已下载完成。",
			detail: "选择“立即安装”会关闭 OpenCut 并启动安装程序。",
			buttons: ["立即安装", "稍后安装"],
			defaultId: 0,
			cancelId: 1,
		});
		if (installChoice.response !== 0) return;
		const installerProcess = spawn(installerPath, [], { detached: true, stdio: "ignore" });
		installerProcess.unref();
		app.quit();
	} catch (error) {
		console.warn("Update check failed", error);
	}
}

function toFilterPath(filePath) {
	return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function createMask({ width, height, x, y, maskWidth, maskHeight }) {
	const pixels = Buffer.alloc(width * height);
	const endX = Math.min(width, x + maskWidth);
	const endY = Math.min(height, y + maskHeight);
	for (let row = y; row < endY; row += 1) {
		pixels.fill(255, row * width + x, row * width + endX);
	}
	return Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`, "ascii"), pixels]);
}

async function selectEncoder(ffmpeg) {
	try {
		const { stdout, stderr } = await execFileAsync(ffmpeg, ["-hide_banner", "-encoders"], {
			windowsHide: true,
			maxBuffer: 4 * 1024 * 1024,
		});
		const available = `${stdout}\n${stderr}`;
		if (/\bh264_nvenc\b/.test(available)) return ["h264_nvenc", "-preset", "p5", "-cq", "21"];
		if (/\bh264_qsv\b/.test(available)) return ["h264_qsv", "-preset", "medium", "-global_quality", "21"];
		if (/\bh264_amf\b/.test(available)) return ["h264_amf", "-quality", "balanced", "-qp_i", "21"];
	} catch {
		// A portable CPU fallback is always present in the embedded FFmpeg build.
	}
	return ["libx264", "-preset", "medium", "-crf", "18"];
}

async function runWatermarkRemoval(payload) {
	const width = integer(payload?.width, 16, 16384);
	const height = integer(payload?.height, 16, 16384);
	const x = integer(payload?.x, 0, 16383);
	const y = integer(payload?.y, 0, 16383);
	const maskWidth = integer(payload?.maskWidth, 2, 16384);
	const maskHeight = integer(payload?.maskHeight, 2, 16384);
	const smart = payload?.mode !== "fast";
	const requestedPadding = integer(payload?.padding, 0, 32);
	const source = payload?.video;
	if (!width || !height || width * height > 100_000_000 || x === null || y === null || !maskWidth || !maskHeight || x + maskWidth > width || y + maskHeight > height || !source) {
		throw new Error("水印区域或视频数据无效。请重新框选后再试。");
	}
	const videoBuffer = Buffer.from(source);
	if (videoBuffer.length === 0 || videoBuffer.length > 1024 * 1024 * 1024) {
		throw new Error("视频文件无效或超过 1GB。");
	}

	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "opencut-watermark-"));
	try {
		const extension = path.extname(String(payload?.fileName || "")).toLowerCase();
		const inputPath = path.join(directory, `input${/^[.][a-z0-9]{1,8}$/.test(extension) ? extension : ".mp4"}`);
		const maskPath = path.join(directory, "mask.pgm");
		const outputPath = path.join(directory, "cleaned.mp4");
		await fsp.writeFile(inputPath, videoBuffer);
		const padding = requestedPadding ?? (smart ? 2 : 0);
		const paddedX = Math.max(0, x - padding);
		const paddedY = Math.max(0, y - padding);
		const paddedWidth = Math.min(width - paddedX, maskWidth + padding * 2);
		const paddedHeight = Math.min(height - paddedY, maskHeight + padding * 2);
		const filter = smart
			? `removelogo=f='${toFilterPath(maskPath)}'`
			: `delogo=x=${paddedX}:y=${paddedY}:w=${paddedWidth}:h=${paddedHeight}:show=0`;
		if (smart) {
			await fsp.writeFile(maskPath, createMask({ width, height, x: paddedX, y: paddedY, maskWidth: paddedWidth, maskHeight: paddedHeight }));
		}
		const ffmpeg = getFfmpegPath();
		let encoder = await selectEncoder(ffmpeg);
		const encode = (settings) => execFileAsync(ffmpeg, [
			"-hide_banner", "-y", "-i", inputPath, "-map", "0:v:0", "-map", "0:a?", "-vf", filter,
			"-c:v", ...settings, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath,
		], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
		try {
			await encode(encoder);
		} catch (error) {
			if (encoder[0] === "libx264") throw error;
			encoder = ["libx264", "-preset", "medium", "-crf", "18"];
			await encode(encoder);
		}
		return { video: await fsp.readFile(outputPath), encoder: encoder[0] };
	} finally {
		await fsp.rm(directory, { recursive: true, force: true });
	}
}

ipcMain.handle("opencut:remove-watermark", async (_event, payload) => runWatermarkRemoval(payload));

function getWebRoot() {
	return app.isPackaged
		? path.join(process.resourcesPath, "web", "apps", "web")
		: path.join(__dirname, "..", "web", ".next", "standalone", "apps", "web");
}

function getFfmpegPath() {
	return app.isPackaged
		? path.join(process.resourcesPath, "ffmpeg", "ffmpeg.exe")
		: path.join(__dirname, "..", "web", "tools", "ffmpeg", "bin", "ffmpeg.exe");
}

function getFfprobePath() {
	return app.isPackaged
		? path.join(process.resourcesPath, "ffmpeg", "ffprobe.exe")
		: path.join(__dirname, "..", "web", "tools", "ffmpeg", "bin", "ffprobe.exe");
}

function getDesktopRecognizer() {
	if (desktopRecognizer) return desktopRecognizer;
	// Keep transcription in Electron's native process. This avoids sending a
	// potentially large WAV through Next's multipart parser before inference.
	const sherpa = require(path.join(getWebRoot(), "node_modules", "sherpa-onnx"));
	const modelDirectory = path.join(getWebRoot(), "public", "models", "sensevoice");
	desktopRecognizer = sherpa.createOfflineRecognizer({
		modelConfig: {
			senseVoice: {
				model: path.join(modelDirectory, "model.int8.onnx"),
				language: "zh",
				useInverseTextNormalization: 1,
			},
			tokens: path.join(modelDirectory, "tokens.txt"),
		},
	});
	return desktopRecognizer;
}

function findDesktopSpeechRanges(samples, sampleRate) {
	const frameSize = Math.max(1, Math.floor(sampleRate / 10));
	const levels = [];
	for (let start = 0; start < samples.length; start += frameSize) {
		let energy = 0;
		const end = Math.min(samples.length, start + frameSize);
		for (let index = start; index < end; index += 1) energy += samples[index] ** 2;
		levels.push(Math.sqrt(energy / Math.max(1, end - start)));
	}
	const sorted = [...levels].sort((a, b) => a - b);
	const noiseFloor = sorted[Math.floor(sorted.length * 0.1)] || 0;
	const speechLevel = sorted[Math.floor(sorted.length * 0.9)] || 0;
	if (speechLevel < 0.004) return [];
	const threshold = Math.max(0.0035, noiseFloor + (speechLevel - noiseFloor) * 0.2);
	const ranges = [];
	let speechStart = -1;
	let silenceStart = -1;
	const addRange = (start, end) => {
		const maxRangeSize = sampleRate * 7;
		for (let offset = start; offset < end; offset += maxRangeSize) {
			const rangeEnd = Math.min(end, offset + maxRangeSize);
			if (rangeEnd - offset >= sampleRate * 0.35) ranges.push({ start: offset, end: rangeEnd });
		}
	};
	for (let frame = 0; frame < levels.length; frame += 1) {
		if (levels[frame] >= threshold) {
			if (speechStart < 0) speechStart = Math.max(0, (frame - 1) * frameSize);
			silenceStart = -1;
			continue;
		}
		if (speechStart < 0) continue;
		if (silenceStart < 0) silenceStart = frame;
		if (frame - silenceStart + 1 >= 4) {
			addRange(speechStart, Math.min(samples.length, (silenceStart + 5) * frameSize));
			speechStart = -1;
			silenceStart = -1;
		}
	}
	if (speechStart >= 0) addRange(speechStart, samples.length);
	return ranges;
}

async function transcribeDesktopAudio(payload) {
	const audio = payload?.audio;
	const bytes = audio instanceof ArrayBuffer ? Buffer.from(audio) : Buffer.from(audio || []);
	if (bytes.length === 0 || bytes.length > 512 * 1024 * 1024) {
		throw new Error("音频无效或过大。请先裁剪素材，或把项目分段生成字幕。");
	}
	const sherpa = require(path.join(getWebRoot(), "node_modules", "sherpa-onnx"));
	const wave = sherpa.readWaveFromBinaryData(new Uint8Array(bytes));
	const recognizer = getDesktopRecognizer();
	const segments = [];
	for (const range of findDesktopSpeechRanges(wave.samples, wave.sampleRate)) {
		const stream = recognizer.createStream();
		stream.acceptWaveform(wave.sampleRate, wave.samples.slice(range.start, range.end));
		recognizer.decode(stream);
		const result = recognizer.getResult(stream);
		stream.free();
		const text = String(result.text || "").replace(/<\|[^|]+\|>/g, "").trim();
		if (text) segments.push({ text, start: range.start / wave.sampleRate, end: range.end / wave.sampleRate });
	}
	return { text: segments.map((segment) => segment.text).join(" "), segments, language: payload?.language || "zh" };
}

ipcMain.handle("opencut:transcribe-audio", async (_event, payload) => transcribeDesktopAudio(payload));

const CONVERSION_PROFILES = {
	mp4_h264: { extension: "mp4", kind: "video", video: "libx264", audio: "aac" },
	mp4_hevc: { extension: "mp4", kind: "video", video: "libx265", audio: "aac" },
	mkv_h264: { extension: "mkv", kind: "video", video: "libx264", audio: "aac" },
	mkv_hevc: { extension: "mkv", kind: "video", video: "libx265", audio: "aac" },
	mov: { extension: "mov", kind: "video", video: "libx264", audio: "aac" },
	avi: { extension: "avi", kind: "video", video: "mpeg4", audio: "libmp3lame" },
	webm_vp9: { extension: "webm", kind: "video", video: "libvpx-vp9", audio: "libopus" },
	webm_av1: { extension: "webm", kind: "video", video: "libsvtav1", audio: "libopus" },
	mpeg: { extension: "mpg", kind: "video", video: "mpeg2video", audio: "mp2" },
	ts: { extension: "ts", kind: "video", video: "libx264", audio: "aac", format: "mpegts" },
	m2ts: { extension: "m2ts", kind: "video", video: "libx264", audio: "aac", format: "mpegts" },
	flv: { extension: "flv", kind: "video", video: "flv", audio: "aac" },
	wmv: { extension: "wmv", kind: "video", video: "wmv2", audio: "wmav2" },
	ogv: { extension: "ogv", kind: "video", video: "libtheora", audio: "libvorbis" },
	threegp: { extension: "3gp", kind: "video", video: "libx264", audio: "aac" },
	vob: { extension: "vob", kind: "video", video: "mpeg2video", audio: "mp2", format: "vob" },
	gif: { extension: "gif", kind: "animation", video: "gif" },
	webp_anim: { extension: "webp", kind: "animation", video: "libwebp_anim" },
	mp3: { extension: "mp3", kind: "audio", audio: "libmp3lame" },
	wav: { extension: "wav", kind: "audio", audio: "pcm_s16le" },
	flac: { extension: "flac", kind: "audio", audio: "flac" },
	m4a: { extension: "m4a", kind: "audio", audio: "aac" },
	aac: { extension: "aac", kind: "audio", audio: "aac" },
	ogg: { extension: "ogg", kind: "audio", audio: "libvorbis" },
	opus: { extension: "opus", kind: "audio", audio: "libopus" },
	wma: { extension: "wma", kind: "audio", audio: "wmav2" },
	ac3: { extension: "ac3", kind: "audio", audio: "ac3" },
	aiff: { extension: "aiff", kind: "audio", audio: "pcm_s16be" },
	alac: { extension: "m4a", kind: "audio", audio: "alac" },
	png: { extension: "png", kind: "image", video: "png" },
	jpg: { extension: "jpg", kind: "image", video: "mjpeg" },
	webp: { extension: "webp", kind: "image", video: "libwebp" },
	bmp: { extension: "bmp", kind: "image", video: "bmp" },
	tiff: { extension: "tiff", kind: "image", video: "tiff" },
	tga: { extension: "tga", kind: "image", video: "targa" },
	avif: { extension: "avif", kind: "image", video: "libaom-av1" },
	jxl: { extension: "jxl", kind: "image", video: "libjxl" },
};

function conversionScaleFilter(width, height, mode) {
	if (!width && !height) return null;
	if (width && !height) return `scale=${width}:-2`;
	if (!width && height) return `scale=-2:${height}`;
	if (mode === "pad") return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
	if (mode === "crop") return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
	if (mode === "stretch") return `scale=${width}:${height}`;
	return `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
}

function uniqueConvertedPath(inputPath, extension) {
	const directory = path.dirname(inputPath);
	const baseName = path.basename(inputPath, path.extname(inputPath));
	let count = 1;
	let output = path.join(directory, `${baseName}_转换.${extension}`);
	while (fs.existsSync(output)) {
		count += 1;
		output = path.join(directory, `${baseName}_转换_${count}.${extension}`);
	}
	return output;
}

async function probeDuration(inputPath) {
	try {
		const { stdout } = await execFileAsync(getFfprobePath(), ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputPath], { windowsHide: true });
		const duration = Number.parseFloat(stdout.trim());
		return Number.isFinite(duration) && duration > 0 ? duration : null;
	} catch {
		return null;
	}
}

async function convertNativeMedia({ inputPath, profileId, quality = "balanced", width = 0, height = 0, scaleMode = "fit", fps = 0, targetMb = 0 }) {
	if (!conversionSources.has(inputPath) || !fs.existsSync(inputPath)) throw new Error("请选择要转换的本地文件。");
	const profile = CONVERSION_PROFILES[profileId];
	if (!profile) throw new Error("不支持的输出格式。");
	const outputPath = uniqueConvertedPath(inputPath, profile.extension);
	const qualityConfig = { high: 18, balanced: 23, small: 28 }[quality] ?? 23;
	const args = ["-hide_banner", "-y", "-i", inputPath];
	const safeWidth = integer(width, 0, 16384) ?? 0;
	const safeHeight = integer(height, 0, 16384) ?? 0;
	const filter = profile.kind !== "audio" ? conversionScaleFilter(safeWidth, safeHeight, scaleMode) : null;
	if (filter) args.push("-vf", filter);
	if (profile.kind === "video" && integer(fps, 1, 240)) args.push("-r", String(fps));
	if (profile.kind === "audio") {
		args.push("-vn", "-c:a", profile.audio);
	} else if (profile.kind === "image") {
		args.push("-an", "-frames:v", "1", "-c:v", profile.video);
	} else if (profile.kind === "animation") {
		args.push("-an", "-loop", "0", "-c:v", profile.video);
		if (profileId === "webp_anim") args.push("-quality", quality === "high" ? "90" : quality === "small" ? "65" : "78");
	} else {
		args.push("-c:v", profile.video, "-c:a", profile.audio);
		if (profile.video === "libx264" || profile.video === "libx265") args.push("-preset", "medium", "-crf", String(qualityConfig));
		if (profile.video === "libvpx-vp9") args.push("-crf", String(qualityConfig + 7), "-b:v", "0", "-row-mt", "1");
		if (profile.video === "libsvtav1") args.push("-crf", String(qualityConfig + 9), "-preset", "8");
		if (["libx264", "libx265"].includes(profile.video)) args.push("-pix_fmt", "yuv420p");
		args.push("-b:a", quality === "small" ? "128k" : quality === "high" ? "256k" : "192k");
	}
	const requestedSize = Number(targetMb);
	const duration = Number.isFinite(requestedSize) && requestedSize > 0
		? await probeDuration(inputPath)
		: null;
	if (profile.kind === "video" && duration) {
		const totalKbps = Math.max(64, Math.floor((requestedSize * 8192 * 0.98) / duration));
		const audioKbps = Math.min(192, Math.max(48, Math.floor(totalKbps * 0.14)));
		args.push("-b:v", `${Math.max(16, totalKbps - audioKbps)}k`, "-maxrate", `${Math.max(24, Math.floor((totalKbps - audioKbps) * 1.35))}k`, "-bufsize", `${Math.max(32, (totalKbps - audioKbps) * 2)}k`, "-b:a", `${audioKbps}k`);
	}
	if (profile.kind === "audio" && duration) {
		const losslessCodecs = new Set(["pcm_s16le", "pcm_s16be", "flac", "alac"]);
		if (!losslessCodecs.has(profile.audio)) {
			const targetKbps = Math.floor((requestedSize * 8192 * 0.98) / duration);
			const minKbps = profile.audio === "libopus" ? 16 : 32;
			const maxKbps = profile.audio === "libopus" ? 510 : 320;
			const audioKbps = Math.max(minKbps, Math.min(maxKbps, targetKbps));
			args.push("-b:a", `${audioKbps}k`);
		}
	}
	if (profile.format) args.push("-f", profile.format);
	if (["mp4", "mov", "m4a"].includes(profile.extension)) args.push("-movflags", "+faststart");
	args.push(outputPath);
	await execFileAsync(getFfmpegPath(), args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
	return { outputPath, name: path.basename(outputPath), size: (await fsp.stat(outputPath)).size };
}

ipcMain.handle("opencut:select-conversion-files", async () => {
	const selection = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], filters: [{ name: "媒体文件", extensions: ["mp4", "mov", "mkv", "avi", "webm", "mp3", "wav", "flac", "m4a", "aac", "ogg", "opus", "png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "avif"] }, { name: "所有文件", extensions: ["*"] }] });
	selection.filePaths.forEach((filePath) => conversionSources.add(filePath));
	return selection.filePaths;
});

ipcMain.handle("opencut:convert-media", async (_event, payload) => convertNativeMedia(payload));

function quoteConcatPath(filePath) {
	return path.resolve(filePath).replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function safeExportName(value) {
	const cleaned = String(value || "OpenCut 视频")
		.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
		.trim();
	return cleaned || "OpenCut 视频";
}

function validNativeClip(clip) {
	return (
		clip &&
		typeof clip.sourcePath === "string" &&
		fs.existsSync(clip.sourcePath) &&
		Number.isFinite(clip.trimStartSeconds) &&
		Number.isFinite(clip.durationSeconds) &&
		clip.trimStartSeconds >= 0 &&
		clip.durationSeconds > 0
	);
}

async function probeNativeClip(filePath) {
	const { stdout } = await execFileAsync(getFfprobePath(), [
		"-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", filePath,
	], { windowsHide: true, maxBuffer: 1024 * 1024 });
	const streams = JSON.parse(stdout).streams || [];
	const video = streams.find((stream) => stream.codec_type === "video");
	if (!video?.width || !video?.height) throw new Error("素材中没有可用的视频轨道。");
	return { width: video.width, height: video.height, hasAudio: streams.some((stream) => stream.codec_type === "audio") };
}

async function exportNativeVideo(payload) {
	const clips = Array.isArray(payload?.clips) ? payload.clips : [];
	if (clips.length === 0 || !clips.every(validNativeClip)) {
		throw new Error("找不到原始视频文件。请重新导入素材后再使用本地快速导出。");
	}

	const save = await dialog.showSaveDialog({
		title: "导出视频",
		defaultPath: `${safeExportName(payload?.projectName)}.mp4`,
		filters: [{ name: "MP4 视频", extensions: ["mp4"] }],
	});
	if (save.canceled || !save.filePath) return { cancelled: true };

	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "opencut-native-export-"));
	try {
		const ffmpeg = getFfmpegPath();
		const metadata = await Promise.all(clips.map((clip) => probeNativeClip(clip.sourcePath)));
		const outputWidth = metadata[0].width;
		const outputHeight = metadata[0].height;
		const inputArgs = clips.flatMap((clip) => [
			"-ss", String(clip.trimStartSeconds), "-t", String(clip.durationSeconds), "-i", clip.sourcePath,
		]);
		const videoFilters = clips.map((_, index) =>
			`[${index}:v:0]setpts=PTS-STARTPTS,scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`,
		);
		const audioFilters = payload?.includeAudio
			? clips.map((clip, index) => metadata[index].hasAudio
				? `[${index}:a:0]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${clip.durationSeconds},asetpts=N/SR/TB[a${index}]`
				: `anullsrc=r=48000:cl=stereo,atrim=duration=${clip.durationSeconds},asetpts=N/SR/TB[a${index}]`)
			: [];
		const concatInputs = clips.map((_, index) => payload?.includeAudio ? `[v${index}][a${index}]` : `[v${index}]`).join("");
		const filter = [
			...videoFilters,
			...audioFilters,
			`${concatInputs}concat=n=${clips.length}:v=1:a=${payload?.includeAudio ? 1 : 0}[video${payload?.includeAudio ? "[audio]" : ""}]`,
		].join(";");
		let encoder = await selectEncoder(ffmpeg);
		const encode = (settings) => execFileAsync(ffmpeg, [
			"-hide_banner", "-y", ...inputArgs, "-filter_complex", filter,
			"-map", "[video]",
			...(payload?.includeAudio ? ["-map", "[audio]"] : ["-an"]),
			"-c:v", ...settings,
			...(payload?.includeAudio ? ["-c:a", "aac", "-b:a", "192k"] : []),
			"-pix_fmt", "yuv420p", "-movflags", "+faststart", save.filePath,
		], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
		try {
			await encode(encoder);
		} catch (error) {
			if (encoder[0] === "libx264") throw error;
			encoder = ["libx264", "-preset", "medium", "-crf", "18"];
			await encode(encoder);
		}

		return { outputPath: save.filePath, encoder: encoder[0] };
	} finally {
		await fsp.rm(directory, { recursive: true, force: true });
	}
}

ipcMain.handle("opencut:export-native-video", async (_event, payload) => exportNativeVideo(payload));

async function exportRenderedVideo(payload) {
	const source = payload?.video;
	const video = source instanceof ArrayBuffer ? Buffer.from(source) : Buffer.from(source || []);
	if (video.length < 1024 || video.length > 2 * 1024 * 1024 * 1024) {
		throw new Error("工程画面数据无效或过大，无法进行本地编码。");
	}
	const save = await dialog.showSaveDialog({
		title: "导出视频",
		defaultPath: `${safeExportName(payload?.projectName)}.mp4`,
		filters: [{ name: "MP4 视频", extensions: ["mp4"] }],
	});
	if (save.canceled || !save.filePath) return { cancelled: true };
	const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "opencut-rendered-export-"));
	try {
		const inputPath = path.join(directory, "rendered-project.mp4");
		await fsp.writeFile(inputPath, video);
		const ffmpeg = getFfmpegPath();
		let encoder = await selectEncoder(ffmpeg);
		const encode = (settings) => execFileAsync(ffmpeg, [
			"-hide_banner", "-y", "-i", inputPath, "-map", "0:v:0",
			...(payload?.includeAudio ? ["-map", "0:a?"] : ["-an"]),
			"-c:v", ...settings,
			...(payload?.includeAudio ? ["-c:a", "aac", "-b:a", "192k"] : []),
			"-pix_fmt", "yuv420p", "-movflags", "+faststart", save.filePath,
		], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
		try {
			await encode(encoder);
		} catch (error) {
			if (encoder[0] === "libx264") throw error;
			encoder = ["libx264", "-preset", "medium", "-crf", "18"];
			await encode(encoder);
		}
		return { outputPath: save.filePath, encoder: encoder[0] };
	} finally {
		await fsp.rm(directory, { recursive: true, force: true });
	}
}

ipcMain.handle("opencut:export-rendered-video", async (_event, payload) => exportRenderedVideo(payload));
ipcMain.handle("opencut:show-in-folder", async (_event, filePath) => {
	if (typeof filePath === "string" && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
});

function isValidPort(port) {
	return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

function getPortConfigPath() {
	return path.join(app.getPath("userData"), WEB_PORT_CONFIG_NAME);
}

function findLatestLegacyPort() {
	const indexedDbPath = path.join(app.getPath("userData"), "IndexedDB");
	try {
		const matches = fs
			.readdirSync(indexedDbPath, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => {
				const match = /^http_127\.0\.0\.1_(\d+)\.indexeddb\.leveldb$/.exec(
					entry.name,
				);
				if (!match) return null;
				const port = Number(match[1]);
				if (!isValidPort(port)) return null;
				return {
					port,
					modifiedAt: fs.statSync(path.join(indexedDbPath, entry.name)).mtimeMs,
				};
			})
			.filter(Boolean)
			.sort((a, b) => b.modifiedAt - a.modifiedAt);
		return matches[0]?.port ?? null;
	} catch {
		return null;
	}
}

function getPersistentWebPort() {
	try {
		const saved = JSON.parse(fs.readFileSync(getPortConfigPath(), "utf8"));
		if (isValidPort(saved?.port)) return saved.port;
	} catch {
		// First desktop launch, or a damaged settings file.
	}

	// Older desktop builds used a new random port on every launch. Reusing the
	// newest existing origin keeps the user's most recent IndexedDB projects.
	const port = findLatestLegacyPort() ?? DEFAULT_WEB_PORT;
	try {
		fs.writeFileSync(getPortConfigPath(), JSON.stringify({ port }), "utf8");
	} catch {
		// Electron will still run; persistence uses the default user-data folder.
	}
	return port;
}

function waitForServer(url, timeoutMs = 30000) {
	const started = Date.now();
	return new Promise((resolve, reject) => {
		const attempt = () => {
			fetch(url)
				.then(() => resolve())
				.catch(() => {
					if (Date.now() - started > timeoutMs) {
						reject(new Error("OpenCut service did not start in time."));
						return;
					}
					setTimeout(attempt, 250);
				});
		};
		attempt();
	});
}

async function createWindow() {
	const port = getPersistentWebPort();
	const webRoot = getWebRoot();
	webServer = spawn(process.execPath, [path.join(webRoot, "server.js")], {
		cwd: webRoot,
		windowsHide: true,
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			HOSTNAME: "127.0.0.1",
			PORT: String(port),
			NODE_ENV: "production",
			OPENCUT_DESKTOP: "1",
			OPENCUT_FFMPEG_PATH: getFfmpegPath(),
		},
	});
	// Keep server-side rendering failures visible in the desktop diagnostic log.
	// Without this, a Next.js render error only appears as a blank window.
	const serverLog = path.join(app.getPath("userData"), "opencut-server.log");
	const appendServerLog = (chunk) => {
		try {
			fs.appendFileSync(
				serverLog,
				`[${new Date().toISOString()}] ${String(chunk)}`,
			);
		} catch {
			// Diagnostics must never prevent the editor from starting.
		}
	};
	webServer.stdout?.on("data", appendServerLog);
	webServer.stderr?.on("data", appendServerLog);
	webServer.once("error", (error) =>
		dialog.showErrorBox("OpenCut 启动失败", error.message),
	);
	const url = `http://127.0.0.1:${port}`;
	await waitForServer(url);

	const mainWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 1100,
		minHeight: 700,
		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			preload: path.join(__dirname, "preload.cjs"),
		},
	});
	// Keep a small diagnostic log in development builds.  It is intentionally
	// not enabled for normal packaged runs, but makes renderer errors visible
	// while validating the desktop shell.
	if (!app.isPackaged || process.env.OPENCUT_DEBUG === "1") {
		const debugLog = path.join(app.getPath("userData"), "opencut-debug.log");
		const writeDebug = (message) =>
			fs.appendFileSync(debugLog, `[${new Date().toISOString()}] ${message}\n`);
		mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
			writeDebug(`console(${level}) ${message} (${sourceId}:${line})`);
		});
		mainWindow.webContents.on("render-process-gone", (_event, details) => {
			writeDebug(`renderer gone: ${JSON.stringify(details)}`);
		});
	}
	mainWindow.once("ready-to-show", () => mainWindow.show());
	if (!app.isPackaged || process.env.OPENCUT_DEBUG === "1") {
		mainWindow.webContents.openDevTools({ mode: "detach" });
	}
	mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
		shell.openExternal(target);
		return { action: "deny" };
	});
	await mainWindow.loadURL(url);
	return mainWindow;
}

app
	.whenReady()
	.then(async () => {
		const mainWindow = await createWindow();
		setTimeout(() => void checkForUpdates({ parentWindow: mainWindow }), 5_000);
	})
	.catch((error) => {
		dialog.showErrorBox("OpenCut 启动失败", error.stack || error.message);
		app.quit();
	});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => webServer?.kill());
