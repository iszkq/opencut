# OpenCut 角色配音 Worker

这个 Worker 只负责在服务端保存 AIHUBMIX 密钥并转发配音请求。桌面应用不会收到、保存或公开该密钥。

Cloudflare 控制台默认创建的是 `worker.js`，直接粘贴 `src/worker.js`；使用 Wrangler 命令部署时则使用 `src/index.ts`。

## 首次部署

1. 在此目录执行 `bun install`。
2. 登录 Cloudflare：`bunx wrangler login`。
3. 设置密钥：`bunx wrangler secret put AIHUBMIX_API_KEY`，按提示粘贴 AIHUBMIX Key。
4. 部署：`bun run deploy`。
5. Cloudflare 会显示 Worker 地址，例如 `https://opencut-tts.<你的账号>.workers.dev`。
6. 编辑仓库根目录的 `config/cloud-tts.json`：

```json
{
	"enabled": true,
	"endpoint": "https://opencut-tts.<你的账号>.workers.dev/v1/audio/speech"
}
```

提交该配置后，已更新到支持 Worker 的桌面应用会在最多 5 分钟内读取新地址；之后换密钥、模型、限额或禁用服务，都不需要重新构建桌面应用。

## 运维配置

- `AIHUBMIX_API_KEY`：只通过 Cloudflare Secret 设置，绝不要写入仓库或 `wrangler.toml`。
- `MAX_INPUT_CHARS`：单次生成的最大字符数，默认 `500`，最大 `2000`。
- `RATE_LIMIT_PER_MINUTE`：单 IP 每分钟最大请求次数，默认 `8`。这是基础保护；正式运营建议再在 Cloudflare 控制台增加 WAF 速率限制规则。
- 停止共享服务时，将 `config/cloud-tts.json` 的 `enabled` 改为 `false`；用户仍可使用自己保存在本机的 API Key。
