const SOURCE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

export async function GET() {
  const response = await fetch(SOURCE_URL, { next: { revalidate: 86400 } });
  if (!response.ok) return new Response("Unable to load country boundaries", { status: 502 });
  return Response.json(await response.json(), { headers: { "Cache-Control": "public, max-age=86400" } });
}
