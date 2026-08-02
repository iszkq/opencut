import { NextResponse } from "next/server";

export const runtime = "nodejs";

const INDEX_URL = "https://image.527012.xyz/index.json";

export async function GET() {
	try {
		const response = await fetch(INDEX_URL, {
			next: { revalidate: 3600 },
		});
		if (!response.ok) {
			return NextResponse.json({ error: "Sticker index unavailable" }, { status: 502 });
		}
		return NextResponse.json(await response.json(), {
			headers: { "Cache-Control": "public, max-age=3600" },
		});
	} catch {
		return NextResponse.json({ error: "Sticker index unavailable" }, { status: 502 });
	}
}
