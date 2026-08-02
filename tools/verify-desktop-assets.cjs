const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
	"apps/web/tools/ffmpeg/bin/ffmpeg.exe",
	"apps/web/tools/ffmpeg/bin/ffprobe.exe",
	"apps/web/tools/ffmpeg/LICENSE.txt",
];

const missing = requiredFiles.filter(
	(file) => !fs.existsSync(path.join(root, file)),
);

if (missing.length > 0) {
	console.error("桌面安装包缺少本地运行组件：");
	for (const file of missing) console.error(`- ${file}`);
	console.error("请按 docs/RELEASE.md 准备 FFmpeg 后重新执行打包命令。");
	process.exit(1);
}

console.log("桌面打包运行组件检查通过。");
