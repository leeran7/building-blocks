import { ImageResponse } from "@vercel/og";

export async function ogPngResponse(
  image: ImageResponse,
  cacheControl: string
): Promise<Response> {
  const headers = new Headers(image.headers);
  headers.set("Cache-Control", cacheControl);
  return new Response(await image.arrayBuffer(), { status: 200, headers });
}
