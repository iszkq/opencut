export interface Env {
	AIHUBMIX_API_KEY: string;
	UPSTREAM_URL?: string;
	MAX_INPUT_CHARS?: string;
	RATE_LIMIT_PER_MINUTE?: string;
}

const ALLOWED_MODELS = new Set([
	"qwen-audio-3.0-tts-flash",
	"qwen-audio-3.0-tts-plus",
	"gemini-2.5-flash-preview-tts",
	"gemini-2.5-pro-preview-tts",
	"gpt-4o-mini-tts",
]);

const corsHeaders = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-headers": "content-type",
	"cache-control": "no-store",
};

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...corsHeaders,
			"content-type": "application/json; charset=utf-8",
		},
	});
}

function limit(
	value: string | undefined,
	fallback: number,
	min: number,
	max: number,
) {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isInteger(parsed)
		? Math.max(min, Math.min(max, parsed))
		: fallback;
}

async function enforceRateLimit(request: Request, env: Env) {
	const maxRequests = limit(env.RATE_LIMIT_PER_MINUTE, 8, 1, 60);
	const minute = Math.floor(Date.now() / 60_000);
	const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
	const cacheKey = new Request(
		`https://opencut-rate-limit.invalid/${encodeURIComponent(ip)}/${minute}`,
	);
	const previous = await caches.default.match(cacheKey);
	const used = previous ? Number.parseInt(await previous.text(), 10) || 0 : 0;
	if (used >= maxRequests) return false;
	await caches.default.put(
		cacheKey,
		new Response(String(used + 1), {
			headers: { "cache-control": "max-age=70" },
		}),
	);
	return true;
}

function audioResponse(source: Response) {
	const headers = new Headers(corsHeaders);
	headers.set(
		"content-type",
		source.headers.get("content-type") || "audio/mpeg",
	);
	headers.set("content-disposition", "inline; filename=opencut-dubbing.mp3");
	return new Response(source.body, { status: 200, headers });
}

async function proxySpeech(request: Request, env: Env) {
	if (!env.AIHUBMIX_API_KEY)
		return json({ error: "服务端尚未设置 AIHUBMIX_API_KEY。" }, 503);
	if (!(await enforceRateLimit(request, env)))
		return json({ error: "请求过于频繁，请稍后再试。" }, 429);

	let payload: {
		model?: unknown;
		input?: unknown;
		voice?: unknown;
		response_format?: unknown;
	};
	try {
		payload = await request.json();
	} catch {
		return json({ error: "请求内容必须是 JSON。" }, 400);
	}
	const model = typeof payload.model === "string" ? payload.model : "";
	const input = typeof payload.input === "string" ? payload.input.trim() : "";
	const voice = typeof payload.voice === "string" ? payload.voice.trim() : "";
	const maxInputChars = limit(env.MAX_INPUT_CHARS, 500, 1, 2000);
	if (!ALLOWED_MODELS.has(model))
		return json({ error: "不支持的配音模型。" }, 400);
	if (!input || input.length > maxInputChars)
		return json({ error: `单次配音最多 ${maxInputChars} 个字符。` }, 400);
	if (!voice || voice.length > 100)
		return json({ error: "无效的角色音色。" }, 400);

	const upstream = await fetch(
		env.UPSTREAM_URL || "https://aihubmix.com/v1/audio/speech",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.AIHUBMIX_API_KEY}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model,
				input,
				voice,
				...(typeof payload.response_format === "string"
					? { response_format: payload.response_format }
					: {}),
			}),
		},
	);
	if (!upstream.ok)
		return json(
			{ error: "配音服务暂时不可用，请稍后重试。" },
			upstream.status >= 500 ? 502 : upstream.status,
		);

	const type = upstream.headers.get("content-type") || "";
	if (!type.includes("application/json")) return audioResponse(upstream);
	let audioUrl = "";
	try {
		const data = (await upstream.json()) as {
			output?: { audio?: { url?: unknown } };
		};
		audioUrl =
			typeof data.output?.audio?.url === "string" ? data.output.audio.url : "";
		const url = new URL(audioUrl);
		if (url.protocol !== "https:") throw new Error("Invalid audio URL");
	} catch {
		return json({ error: "上游没有返回可下载的音频。" }, 502);
	}
	const audio = await fetch(audioUrl);
	if (!audio.ok) return json({ error: "生成成功，但音频下载失败。" }, 502);
	return audioResponse(audio);
}

export default {
	async fetch(request, env): Promise<Response> {
		if (request.method === "OPTIONS")
			return new Response(null, { status: 204, headers: corsHeaders });
		const url = new URL(request.url);
		if (request.method === "GET" && url.pathname === "/health")
			return json({ ok: true });
		if (request.method !== "POST" || url.pathname !== "/v1/audio/speech")
			return json({ error: "Not found" }, 404);
		return proxySpeech(request, env);
	},
} satisfies ExportedHandler<Env>;
