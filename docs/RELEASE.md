# Windows 发布说明

Windows 安装包由 GitHub Actions 构建，不需要在本地打包。

## 日常验证

提交代码后，GitHub 的 **Build verification** 工作流会安装依赖并构建 Web 应用。

## 构建 Windows 包

在 GitHub 仓库的 **Actions** 页面选择 **Build Windows desktop app**，点击 **Run workflow**。构建完成后可在该次运行的 Artifacts 下载 Windows 安装包和便携版。

若推送以 `v` 开头的标签（例如 `v0.4.1`），工作流会自动：

1. 下载 FFmpeg 与离线 SenseVoice 字幕模型；
2. 构建 Windows 安装包和便携版；
3. 创建 GitHub Release，并上传生成的 EXE。

## 不提交的大文件

以下内容只在 GitHub Actions 构建时下载或生成，不提交到 Git：

- FFmpeg 可执行文件；
- 离线字幕模型；
- `release/` 与 `win-unpacked/` 发布包；
- `.next/`、依赖目录、日志和本机缓存。

这样源码仓库保持轻量，发布版仍然是带本地导出和离线字幕功能的独立桌面应用。
