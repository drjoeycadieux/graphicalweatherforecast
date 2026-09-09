const SOURCE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";

export async function GET() {
  const response = await fetch(SOURCE_URL, { next: { revalidate: 86400 } });
  if (!response.ok) return new Response("Unable to load Quebec boundary", { status: 502 });
  const data = await response.json();
  const features = data.features.filter((feature: { properties?: { admin?: string; name_en?: string } }) => feature.properties?.admin === "Canada" && feature.properties?.name_en === "Quebec");
  return Response.json({ type: "FeatureCollection", features }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
