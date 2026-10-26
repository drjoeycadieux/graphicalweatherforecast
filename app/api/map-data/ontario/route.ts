import { fetchJsonCached } from "@/lib/map-data-cache";

const SOURCE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson";

type Admin1Collection = {
  features: { properties?: { admin?: string; name_en?: string } }[];
};

export async function GET() {
  try {
    const data = await fetchJsonCached<Admin1Collection>(SOURCE_URL);
    const features = data.features.filter(
      (feature) => feature.properties?.admin === "Canada" && feature.properties?.name_en === "Ontario",
    );
    return Response.json(
      { type: "FeatureCollection", features },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  } catch {
    return new Response("Unable to load Ontario boundary", { status: 502 });
  }
}
