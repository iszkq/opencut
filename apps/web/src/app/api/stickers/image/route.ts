import { NextResponse } from "next/server";

export const runtime = "nodejs";

const STICKER_HOST = "image.527012.xyz";

function getStickerUrl({ value }: { value: string | null }): URL | null {
	if (!value) {
		return null;
	}

	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname === STICKER_HOST
			? url
			: null;
	} catch {
		return null;
	}
}

export async function GET(request: Request) {
	const stickerUrl = getStickerUrl({
		value: new URL(request.url).searchParams.get("url"),
	});
	if (!stickerUrl) {
		return NextResponse.json({ error: "Invalid sticker URL" }, { status: 400 });
	}

	try {
		const response = await fetch(stickerUrl, {
			redirect: "error",
			next: { revalidate: 86_400 },
		});
		if (!response.ok) {
			return NextResponse.json({ error: "Sticker unavailable" }, { status: 502 });
		}

		return new NextResponse(response.body, {
			headers: {
				"Content-Type": response.headers.get("content-type") ?? "image/*",
				"Cache-Control": "public, max-age=86400",
			},
		});
	} catch {
		return NextResponse.json({ error: "Sticker unavailable" }, { status: 502 });
	}
}
