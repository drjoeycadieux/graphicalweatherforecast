import shp from "shpjs";

const SOURCE_URL = "https://www2.census.gov/geo/tiger/TIGER2025/STATE/tl_2025_us_state.zip";

export async function GET() {
  const response = await fetch(SOURCE_URL, { next: { revalidate: 86400 } });
  if (!response.ok) return new Response("Unable to load state boundaries", { status: 502 });
  return Response.json(await shp(await response.arrayBuffer()), { headers: { "Cache-Control": "public, max-age=86400" } });
}
