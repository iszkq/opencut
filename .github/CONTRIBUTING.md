# 贡献指南

感谢你愿意帮助改进 OpenCut 中文版。欢迎提交 Bug、界面体验改进、文档和功能建议。

## 开始前

1. 先搜索已有 Issue，避免重复。
2. 较大的功能请先创建 Issue 说明使用场景和方案。
3. 每个 Pull Request 尽量只解决一个问题，并附上截图或录屏。

## 本地开发

```powershell
bun install
bun run dev:web
```

如果要制作 Windows 桌面包，请阅读 [发布流程](../docs/RELEASE.md)。FFmpeg 二进制和本地模型不应提交到仓库。

## 提交要求

- 使用中文或英文都可以，但描述要清晰。
- 不要提交 `release/`、`node_modules/`、`.next/`、`.env.local`、模型文件或 FFmpeg 二进制。
- 修改剪辑、字幕、转场、导出等功能时，请说明使用的测试素材类型和实际结果。
- 修改用户界面时，请确认深色和浅色主题都没有明显问题。
- 提交前至少运行 `bun run build:web`；桌面包改动还需运行 `bun run verify:desktop-assets`。

## 当前代码质量状态

仓库保留了严格 ESLint 规则，历史代码仍有待逐步清理的检查项。请不要为了消除警告而大范围重写无关模块；新增代码应尽可能遵循现有 TypeScript、React 与 Prettier 风格。

## 安全问题

请不要在公开 Issue 中披露可利用的安全漏洞，详见 [安全策略](SECURITY.md)。
