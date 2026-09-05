const SOURCE_URL = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";

export async function GET() {
  const response = await fetch(SOURCE_URL, { next: { revalidate: 86400 } });
  if (!response.ok) return new Response("Unable to load state boundaries", { status: 502 });
  return Response.json(await response.json(), { headers: { "Cache-Control": "public, max-age=86400" } });
}
