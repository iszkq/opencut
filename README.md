# OpenCut 中文版

一款面向 Windows 的本地视频剪辑桌面应用。项目基于 OpenCut 开源代码继续开发，重点是中文界面、离线优先、项目可保存和内置媒体处理能力。

> 当前发布形态为 Windows x64 桌面版。项目文件和媒体默认只在本机处理；字幕识别、转码、导出等功能不需要上传视频到第三方服务。

## 已实现功能

- 中文化桌面剪辑界面，浅色 / 深色主题
- 视频、音频、图片素材导入与右侧预览
- 项目创建、保存和再次打开
- 时间线剪辑、音视频分离、贴纸、文字模板、基础转场
- 可编辑字幕、本地语音转字幕、文字和字幕共用字体选择
- MP4 / WebM 视频导出，以及按时间线混音的 MP3 / WAV 音频导出
- 内置 FFmpeg：格式转换、压缩、音频提取和硬件编码自动回退
- 本地去水印工具和可调节参数

## 下载和使用

在 GitHub 的 **Releases** 页面下载 `OpenCut-中文版-*-x64.exe`：

- `Setup.exe`：推荐，安装后会创建桌面和开始菜单快捷方式。
- `portable.exe`：免安装，解压/运行即可。

首次启动后，新建项目并导入素材即可开始编辑。导出按钮中可选择“导出视频”或“仅导出音频”。

## 从源码运行

### 环境要求

- Windows 10 / 11 x64
- [Bun 1.2.18](https://bun.sh/)
- Node.js 20 或更高版本（Electron 打包需要）
- Rust 仅在修改 `rust/` 或本地构建 WASM 时需要

```powershell
git clone https://github.com/<你的用户名>/opencut-cn-desktop.git
cd opencut-cn-desktop
bun install
bun run dev:web
```

浏览器开发版默认打开在 `http://localhost:3000`。桌面版本请按下方步骤构建。

## 构建 Windows 安装包

为了让仓库保持轻量，内置 FFmpeg 可执行文件不会提交到 Git。准备好以下文件后再构建：

```text
apps/web/tools/ffmpeg/bin/ffmpeg.exe
apps/web/tools/ffmpeg/bin/ffprobe.exe
apps/web/tools/ffmpeg/LICENSE.txt
```

然后运行：

```powershell
bun run dist:win
```

生成的安装版和便携版位于 `release/`。更完整的发布检查请见 [docs/RELEASE.md](docs/RELEASE.md)。

## 开发检查

```powershell
bun run build:web
bun run verify:desktop-assets
```

提交前请不要加入 `release/`、`node_modules/`、本地模型、FFmpeg 二进制文件或 `.env.local`。这些内容已经在 `.gitignore` 中排除。

## 贡献

欢迎提交问题、界面改进和功能建议。请先阅读 [贡献指南](.github/CONTRIBUTING.md)，并使用仓库的 Issue 模板提供清晰的复现步骤或需求说明。

## 许可证与致谢

本项目采用 [MIT License](LICENSE)。它包含并修改了 [OpenCut](https://github.com/OpenCut-app/OpenCut) 的开源代码；原项目的署名和许可说明见 [NOTICE](NOTICE)。内置 FFmpeg 的许可文件会随 Windows 发布包一并提供。

## 当前状态

项目处于持续完善阶段。欢迎先在真实素材上测试导入、保存、字幕、转场和导出，再通过 Issue 反馈问题与复现步骤。
