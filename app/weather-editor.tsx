"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import Feature from "ol/Feature.js";
import GeoJSON from "ol/format/GeoJSON.js";
import Map from "ol/Map.js";
import View from "ol/View.js";
import { defaults as defaultControls } from "ol/control/defaults.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import { type User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";

import { auth, db, firebaseConfigMissingKeys } from "@/lib/firebase";

import "ol/ol.css";

type OutlookDay = 1 | 2 | 3;
type MapRegion = "USA" | "Quebec" | "Ontario";
type HazardMode = "Severe" | "Winter";
type Hazard = "Severe Thunderstorms" | "Tornado" | "Wind" | "Hail" | "Snow Storm" | "Ice Storm" | "Blizzard" | "Freezing Rain" | "Heavy Snow" | "Wind Chill";
type RiskCategory = "General Thunder" | "Marginal" | "Slight" | "Enhanced" | "Moderate" | "High";
type OutlookShape = { id?: string; day: OutlookDay; hazard: Hazard; category: RiskCategory; points: [number, number][]; createdAt?: unknown; updatedAt?: unknown };
type GeoJsonCollection = FeatureCollection<Geometry, GeoJsonProperties>;
type DrawMode = "polygon" | "pencil" | "rectangle" | "quick";

const drawModeLabels: Record<DrawMode, string> = {
  polygon: "Polygon",
  pencil: "Pencil",
  rectangle: "Rectangle",
  quick: "Quick area",
};

function getFirestoreStatusMessage(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = String((error as { code?: string }).code ?? "");
    if (code === "failed-precondition") {
      return "Firestore is not enabled for this project. Create the Firestore database in Firebase Console and try again.";
    }
    if (code === "permission-denied") {
      return "Firestore rules are blocking access. Update the rules to allow reads and writes for this app.";
    }
    if (code === "unavailable") {
      return "Firestore is temporarily unavailable. Please try again in a moment.";
    }
  }

  if (error instanceof Error && error.message.toLowerCase().includes("timed out")) {
    return "Firestore request timed out. Enable Firestore and confirm the project is connected correctly.";
  }

  return "Firestore could not load outlooks. Check that the database exists and the rules allow access.";
}

const riskMeta: Record<RiskCategory, { color: string; ink: string; short: string }> = {
  "General Thunder": { color: "#c9c9c9", ink: "#5d636b", short: "T" },
  Marginal: { color: "#7fc97f", ink: "#28633c", short: "MRGL" },
  Slight: { color: "#f5df62", ink: "#7a6500", short: "SLGT" },
  Enhanced: { color: "#f6a257", ink: "#8a4309", short: "ENH" },
  Moderate: { color: "#e86a6a", ink: "#7b2222", short: "MDT" },
  High: { color: "#c14f88", ink: "#68183f", short: "HIGH" },
};

const hazardSets: Record<HazardMode, { value: Hazard; short: string }[]> = {
  Severe: [
    { value: "Severe Thunderstorms", short: "ALL" },
    { value: "Tornado", short: "TOR" },
    { value: "Wind", short: "WND" },
    { value: "Hail", short: "HAIL" },
  ],
  Winter: [
    { value: "Snow Storm", short: "SNOW" },
    { value: "Ice Storm", short: "ICE" },
    { value: "Blizzard", short: "BLZD" },
    { value: "Freezing Rain", short: "FZRN" },
    { value: "Heavy Snow", short: "HEAVY" },
    { value: "Wind Chill", short: "CHILL" },
  ],
};

const regionViews: Record<MapRegion, { longitude: number; latitude: number; zoom: number }> = {
  USA: { longitude: -96, latitude: 38.5, zoom: 4 },
  Quebec: { longitude: -72, latitude: 51.5, zoom: 5 },
  Ontario: { longitude: -85, latitude: 51, zoom: 5 },
};

const US_COUNTRIES_GEOJSON = "/api/map-data/countries";
const US_STATES_GEOJSON = "/api/map-data/states";
const QUEBEC_GEOJSON = "/api/map-data/quebec";
const ONTARIO_GEOJSON = "/api/map-data/ontario";

type PolygonFeature = {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: { fill: string; outline: string; opacity: number };
};

function polygonFeature(points: [number, number][], fill: string, outline: string, opacity: number): PolygonFeature {
  const coordinates = points.map(([lat, lng]) => [lng, lat]);
  if (coordinates.length > 2) coordinates.push(coordinates[0]);
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coordinates] }, properties: { fill, outline, opacity } };
}

function polygonCollection(features: PolygonFeature[]) {
  return { type: "FeatureCollection" as const, features };
}

function withAlpha(hex: string, alpha: number) {
  const safe = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0");
  return `${hex}${safe}`;
}

function PoliticalMap({
  region,
  selectedDay,
  drawMode,
  drawing,
  isPublicView,
  countryData,
  stateData,
  quebecData,
  ontarioData,
  savedPolygonData,
  draft,
  category,
  onMapClick,
  onFreehandComplete,
}: {
  region: MapRegion;
  selectedDay: OutlookDay;
  drawMode: DrawMode;
  drawing: boolean;
  isPublicView: boolean;
  countryData: GeoJsonCollection | null;
  stateData: GeoJsonCollection | null;
  quebecData: GeoJsonCollection | null;
  ontarioData: GeoJsonCollection | null;
  savedPolygonData: ReturnType<typeof polygonCollection>;
  draft: [number, number][];
  category: RiskCategory;
  onMapClick: (point: [number, number]) => void;
  onFreehandComplete: (points: [number, number][]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const savedSourceRef = useRef<VectorSource | null>(null);
  const draftSourceRef = useRef<VectorSource | null>(null);
  const quebecLayerRef = useRef<VectorLayer | null>(null);
  const ontarioLayerRef = useRef<VectorLayer | null>(null);
  const montrealLayerRef = useRef<VectorLayer | null>(null);
  const interactionRef = useRef({ drawMode, drawing, isPublicView });
  const callbacksRef = useRef({ onMapClick, onFreehandComplete });
  const regionRef = useRef(region);

  useEffect(() => {
    interactionRef.current = { drawMode, drawing, isPublicView };
  }, [drawMode, drawing, isPublicView]);

  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  useEffect(() => {
    callbacksRef.current = { onMapClick, onFreehandComplete };
  }, [onMapClick, onFreehandComplete]);

  useEffect(() => {
    if (!countryData || !stateData || !quebecData || !ontarioData) return;
    const container = containerRef.current;
    if (!container) return;

    const view = regionViews[regionRef.current];
    const geoJson = new GeoJSON();
    const boundaryStyle = (fill: string, stroke: string, width: number) =>
      new Style({ fill: new Fill({ color: fill }), stroke: new Stroke({ color: stroke, width }) });

    const countryLayer = new VectorLayer({
      source: new VectorSource({ features: geoJson.readFeatures(countryData, { featureProjection: "EPSG:3857" }) }),
      style: boundaryStyle("#c9c0b1", "#8e8577", 1),
    });
    const stateLayer = new VectorLayer({
      source: new VectorSource({ features: geoJson.readFeatures(stateData, { featureProjection: "EPSG:3857" }) }),
      style: boundaryStyle("#f6efe3", "#6f675b", 1.1),
    });
    const quebecLayer = new VectorLayer({
      source: new VectorSource({ features: geoJson.readFeatures(quebecData, { featureProjection: "EPSG:3857" }) }),
      visible: regionRef.current === "Quebec",
      style: boundaryStyle("#e8f0ed", "#35605a", 1.5),
    });
    const ontarioLayer = new VectorLayer({
      source: new VectorSource({ features: geoJson.readFeatures(ontarioData, { featureProjection: "EPSG:3857" }) }),
      visible: regionRef.current === "Ontario",
      style: boundaryStyle("#edf4f0", "#2e5b4e", 1.6),
    });

    const savedSource = new VectorSource();
    savedSourceRef.current = savedSource;
    const savedLayer = new VectorLayer({
      source: savedSource,
      style: (feature) => {
        const fill = String(feature.get("fill") ?? "#f5df62");
        const opacity = Number(feature.get("opacity") ?? 0.42);
        return new Style({
          fill: new Fill({ color: withAlpha(fill, opacity) }),
          stroke: new Stroke({ color: String(feature.get("outline") ?? "#7a6500"), width: 2 }),
        });
      },
    });

    const draftSource = new VectorSource();
    draftSourceRef.current = draftSource;
    const draftLayer = new VectorLayer({
      source: draftSource,
      style: (feature) =>
        new Style({
          fill: new Fill({ color: withAlpha(String(feature.get("fill") ?? riskMeta.Slight.color), 0.3) }),
          stroke: new Stroke({ color: String(feature.get("outline") ?? riskMeta.Slight.ink), width: 2, lineDash: [6, 5] }),
        }),
    });

    const montrealLayer = new VectorLayer({
      source: new VectorSource({ features: [new Feature({ geometry: new Point(fromLonLat([-73.5673, 45.5017])) })] }),
      visible: regionRef.current === "Quebec",
      style: new Style({
        image: new CircleStyle({ radius: 4, fill: new Fill({ color: "#193b4a" }), stroke: new Stroke({ color: "#ffffff", width: 2 }) }),
        text: new Text({ text: "Montreal", offsetY: -15, font: "600 12px sans-serif", fill: new Fill({ color: "#193b4a" }), stroke: new Stroke({ color: "#ffffff", width: 3 }) }),
      }),
    });

    quebecLayerRef.current = quebecLayer;
    ontarioLayerRef.current = ontarioLayer;
    montrealLayerRef.current = montrealLayer;

    const map = new Map({
      target: container,
      controls: defaultControls({ attribution: false, rotate: false, zoom: true }),
      layers: [countryLayer, stateLayer, quebecLayer, ontarioLayer, savedLayer, draftLayer, montrealLayer],
      view: new View({
        center: fromLonLat([view.longitude, view.latitude]),
        zoom: view.zoom,
        minZoom: 2.5,
        maxZoom: 9,
      }),
    });
    mapRef.current = map;

    const viewport = map.getViewport();
    let freehandPoints: [number, number][] = [];
    let drawingFreehand = false;

    const resetFreehand = () => {
      drawingFreehand = false;
      freehandPoints = [];
    };

    const handlePointerDown = (event: PointerEvent) => {
      const state = interactionRef.current;
      if (state.isPublicView || !state.drawing || event.button !== 0) return;
      if (state.drawMode === "polygon" || state.drawMode === "quick") return;

      drawingFreehand = true;
      event.preventDefault();
      viewport.setPointerCapture?.(event.pointerId);
      const [longitude, latitude] = toLonLat(map.getEventCoordinate(event));
      freehandPoints = [[latitude, longitude]];
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!drawingFreehand) return;
      const state = interactionRef.current;
      if (state.drawMode !== "pencil") return;
      const [longitude, latitude] = toLonLat(map.getEventCoordinate(event));
      const lastPoint = freehandPoints[freehandPoints.length - 1];
      if (!lastPoint || Math.abs(lastPoint[0] - latitude) + Math.abs(lastPoint[1] - longitude) > 0.01) {
        freehandPoints.push([latitude, longitude]);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!drawingFreehand) return;
      event.preventDefault();
      const state = interactionRef.current;
      const points = freehandPoints;
      resetFreehand();

      if (!state.drawing || state.isPublicView) return;
      if (state.drawMode === "pencil" && points.length > 2) {
        callbacksRef.current.onFreehandComplete(points);
      }
      if (state.drawMode === "rectangle" && points.length > 0) {
        const [startLatitude, startLongitude] = points[0];
        const [endLongitude, endLatitude] = toLonLat(map.getEventCoordinate(event));
        if (Math.abs(endLatitude - startLatitude) > 0.05 && Math.abs(endLongitude - startLongitude) > 0.05) {
          callbacksRef.current.onFreehandComplete([
            [startLatitude, startLongitude],
            [startLatitude, endLongitude],
            [endLatitude, endLongitude],
            [endLatitude, startLongitude],
          ]);
        }
      }
    };

    const handlePointerCancel = () => resetFreehand();

    const handleClick = (event: { coordinate: number[] }) => {
      const state = interactionRef.current;
      if (state.isPublicView || !state.drawing) return;
      const [longitude, latitude] = toLonLat(event.coordinate);
      if (state.drawMode === "polygon") {
        callbacksRef.current.onMapClick([latitude, longitude]);
      }
      if (state.drawMode === "quick") {
        const latitudeSize = 1.2;
        const longitudeSize = 1.8;
        callbacksRef.current.onFreehandComplete([
          [latitude - latitudeSize, longitude - longitudeSize],
          [latitude - latitudeSize, longitude + longitudeSize],
          [latitude + latitudeSize, longitude + longitudeSize],
          [latitude + latitudeSize, longitude - longitudeSize],
        ]);
      }
    };

    viewport.addEventListener("pointerdown", handlePointerDown);
    viewport.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    map.on("click", handleClick);

    const resizeObserver = new ResizeObserver(() => map.updateSize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      viewport.removeEventListener("pointerdown", handlePointerDown);
      viewport.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      map.un("click", handleClick);
      map.setTarget(undefined);
      mapRef.current = null;
      savedSourceRef.current = null;
      draftSourceRef.current = null;
      quebecLayerRef.current = null;
      ontarioLayerRef.current = null;
      montrealLayerRef.current = null;
    };
  }, [countryData, ontarioData, quebecData, stateData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    quebecLayerRef.current?.setVisible(region === "Quebec");
    ontarioLayerRef.current?.setVisible(region === "Ontario");
    montrealLayerRef.current?.setVisible(region === "Quebec");
    const view = regionViews[region];
    map.getView().animate({ center: fromLonLat([view.longitude, view.latitude]), zoom: view.zoom, duration: 350 });
  }, [region]);

  useEffect(() => {
    const source = savedSourceRef.current;
    if (!source) return;
    source.clear();
    const geoJson = new GeoJSON();
    source.addFeatures(geoJson.readFeatures(savedPolygonData, { featureProjection: "EPSG:3857" }));
  }, [savedPolygonData]);

  useEffect(() => {
    const source = draftSourceRef.current;
    if (!source) return;
    source.clear();
    if (draft.length > 2) {
      const ring = draft.map(([lat, lng]) => fromLonLat([lng, lat]));
      ring.push(ring[0]);
      source.addFeature(new Feature({
        geometry: new Polygon([ring]),
        fill: riskMeta[category].color,
        outline: riskMeta[category].ink,
      }));
    } else if (draft.length > 1) {
      source.addFeature(new Feature({
        geometry: new LineString(draft.map(([lat, lng]) => fromLonLat([lng, lat]))),
        outline: riskMeta[category].ink,
      }));
    }
  }, [category, draft]);

  const exportMapAsPng = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.updateSize();
    map.renderSync();
    const size = map.getSize();
    if (!size) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = size[0];
    exportCanvas.height = size[1];
    const context = exportCanvas.getContext("2d");
    if (!context) return;

    context.fillStyle = "#e5e7eb";
    context.fillRect(0, 0, size[0], size[1]);
    map.getViewport().querySelectorAll("canvas").forEach((canvas) => {
      if (canvas.width === 0 || canvas.height === 0) return;
      context.globalAlpha = Number(canvas.parentElement?.style.opacity || 1);
      context.drawImage(canvas, 0, 0);
    });
    context.globalAlpha = 1;

    const link = document.createElement("a");
    link.download = `weather-outlook-${region.toLowerCase()}-day-${selectedDay}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }, [region, selectedDay]);

  return (
    <>
      <div ref={containerRef} className="map-canvas" role="region" aria-label="Interactive outlook map" />
      <button type="button" className="map-export-button" onClick={exportMapAsPng} title="Download the current map as a PNG image">
        <span aria-hidden="true">↓</span> Download PNG
      </button>
    </>
  );
}

function MapNotice({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (!loading && !error) return null;
  return (
    <div className="map-notice" role={error ? "alert" : "status"} aria-live="polite">
      {loading ? <span className="spinner" aria-hidden="true" /> : <span className="map-notice-icon" aria-hidden="true">!</span>}
      <div>
        <strong>{loading ? "Loading map boundaries" : "Map boundaries unavailable"}</strong>
        <p>{loading ? "Fetching the latest regional boundaries…" : error}</p>
      </div>
      {error ? <button type="button" className="tool-button quiet" onClick={onRetry}>Retry</button> : null}
    </div>
  );
}

export default function WeatherEditor({ mode = "editor" }: { mode?: "public" | "editor" }) {
  const isPublicView = mode === "public";
  const [shapes, setShapes] = useState<OutlookShape[]>([]);
  const [selectedDay, setSelectedDay] = useState<OutlookDay>(1);
  const [region, setRegion] = useState<MapRegion>("USA");
  const [hazardMode, setHazardMode] = useState<HazardMode>("Severe");
  const [hazard, setHazard] = useState<Hazard>("Severe Thunderstorms");
  const [category, setCategory] = useState<RiskCategory>("Slight");
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>("polygon");
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapLoading, setMapLoading] = useState(true);
  const [mapRequest, setMapRequest] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [notice, setNotice] = useState("");
  const [countryData, setCountryData] = useState<GeoJsonCollection | null>(null);
  const [stateData, setStateData] = useState<GeoJsonCollection | null>(null);
  const [quebecData, setQuebecData] = useState<GeoJsonCollection | null>(null);
  const [ontarioData, setOntarioData] = useState<GeoJsonCollection | null>(null);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!db) {
        setDataError(isPublicView
          ? "Live outlook data is not connected for this deployment."
          : firebaseConfigMissingKeys.length
            ? `Firebase is missing ${firebaseConfigMissingKeys.join(", ")}. Add them to .env.local and restart the dev server.`
            : "Firebase Firestore is not configured. You can explore the editor, but areas cannot be published.");
        setLoading(false);
        return;
      }

      let timeoutId: number | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("Firestore request timed out.")), 5000);
      });

      try {
        const snapshot = await Promise.race([getDocs(query(collection(db, "spc-outlooks"), orderBy("createdAt", "asc"))), timeout]);
        const results = snapshot.docs.map((doc) => {
          const data = doc.data() as Partial<OutlookShape>;
          return {
            id: doc.id,
            day: data.day ?? 1,
            hazard: data.hazard ?? "Severe Thunderstorms",
            category: data.category ?? "General Thunder",
            points: data.points ?? [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } satisfies OutlookShape;
        });
        setShapes(results);
      } catch (error) {
        console.error("Could not load SPC outlooks:", error);
        setDataError(getFirestoreStatusMessage(error));
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
        setLoading(false);
      }
    };
    void load();
  }, [isPublicView]);

  useEffect(() => {
    const loadMapData = async () => {
      setMapLoading(true);
      setMapError("");
      try {
        const [countriesResponse, statesResponse, quebecResponse, ontarioResponse] = await Promise.all([
          fetch(US_COUNTRIES_GEOJSON),
          fetch(US_STATES_GEOJSON),
          fetch(QUEBEC_GEOJSON),
          fetch(ONTARIO_GEOJSON),
        ]);
        if (!countriesResponse.ok || !statesResponse.ok || !quebecResponse.ok || !ontarioResponse.ok) {
          throw new Error("Map boundary data could not be loaded. Check your connection and try again.");
        }
        const [countries, states, quebec, ontario] = await Promise.all([
          countriesResponse.json(),
          statesResponse.json(),
          quebecResponse.json(),
          ontarioResponse.json(),
        ]) as [GeoJsonCollection, GeoJsonCollection, GeoJsonCollection, GeoJsonCollection];
        setCountryData(countries);
        setStateData(states);
        setQuebecData(quebec);
        setOntarioData(ontario);
      } catch (error) {
        console.error("Could not load map boundaries:", error);
        setMapError(error instanceof Error ? error.message : "Map boundary data could not be loaded.");
      } finally {
        setMapLoading(false);
      }
    };
    void loadMapData();
  }, [mapRequest]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 2600);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawing(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const activeHazards = hazardSets[hazardMode];
  const canEdit = Boolean(db) && (!auth || Boolean(user));
  const mapReady = Boolean(countryData && stateData && quebecData && ontarioData);
  const visibleShapes = useMemo(
    () => shapes.filter((shape) => shape.day === selectedDay && shape.hazard === hazard && shape.points.length > 2),
    [hazard, selectedDay, shapes],
  );
  const summary = `${visibleShapes.length} ${visibleShapes.length === 1 ? "area" : "areas"} plotted`;
  const savedPolygonData = useMemo(
    () => polygonCollection(visibleShapes.map((shape) => polygonFeature(shape.points, riskMeta[shape.category].color, riskMeta[shape.category].ink, 0.4))),
    [visibleShapes],
  );

  const changeHazardMode = (nextMode: HazardMode) => {
    if (nextMode === hazardMode) return;
    setHazardMode(nextMode);
    setHazard(hazardSets[nextMode][0].value);
    setDraft([]);
    setDrawing(false);
  };

  const activateTool = (tool: DrawMode) => {
    if (drawing && drawMode === tool) {
      setDrawing(false);
      return;
    }
    setDrawMode(tool);
    setDrawing(true);
    setDraft([]);
  };

  const saveShape = async () => {
    if (!canEdit || !db || draft.length < 3 || saveState === "saving") return;
    setSaveState("saving");
    setNotice("");
    const clean: OutlookShape = { day: selectedDay, hazard, category, points: draft };
    try {
      const ref = await addDoc(collection(db, "spc-outlooks"), {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShapes((current) => [...current, { ...clean, id: ref.id }]);
      setDraft([]);
      setSaveState("saved");
      setNotice(`Area published to Day ${selectedDay} · ${hazard}.`);
    } catch (error) {
      console.error("Could not save SPC outlook:", error);
      setSaveState("idle");
      setDataError("Firestore could not save this outlook. Please try again.");
    }
  };

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth) return;
    setAuthBusy(true);
    try {
      setAuthError("");
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    if (auth) await signOut(auth);
  };

  if (!isPublicView && auth && !authReady) {
    return (
      <main className="page-shell auth-page-shell">
        <div className="page-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          Checking editor session…
        </div>
      </main>
    );
  }

  if (!isPublicView && auth && !user) {
    return (
      <main className="page-shell auth-page-shell">
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow">Editor access</p>
          <h1 id="auth-title">Sign in to the drawing desk</h1>
          <p className="auth-copy">Use your Firebase editor account to publish outlook areas to the public map.</p>
          <form className="auth-form" onSubmit={login}>
            <label htmlFor="editor-email">Email address</label>
            <input
              id="editor-email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="editor-password">Password</label>
            <input
              id="editor-password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {authError ? <p className="form-error" role="alert">{authError}</p> : null}
            <button type="submit" className="primary-button" disabled={authBusy}>
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <Link className="text-link" href="/">← Back to the public outlook</Link>
        </section>
      </main>
    );
  }

  const toolLabel = drawModeLabels[drawMode];
  const instruction = drawMode === "polygon"
    ? `Click the map to add vertices · ${draft.length} ${draft.length === 1 ? "point" : "points"}`
    : drawMode === "quick"
      ? "Click the map to place a quick area"
      : "Drag on the map to draw";

  return (
    <main className={isPublicView ? "page-shell public-page-shell" : "page-shell editor-page-shell"}>
      <header className="outlook-header">
        <div className="outlook-heading">
          <p className="eyebrow">{isPublicView ? "Public forecast view" : "SPC outlook workstation"}</p>
          <h1>{isPublicView ? "Severe Weather Outlook" : "Severe Weather Drawing Desk"}</h1>
          <p className="outlook-lede">
            {isPublicView
              ? "Day 1–3 severe and winter weather areas for the United States, Quebec, and Ontario."
              : "Draw, compare, and publish regional outlook areas from one shared workspace."}
          </p>
        </div>
        <div className="outlook-meta">
          <span className="forecast-badge">
            <span className="live-dot" aria-hidden="true" />
            {isPublicView ? "Public briefing" : "Editor session"}
          </span>
          {user ? (
            <div className="user-chip">
              <span className="user-chip-label">Signed in</span>
              <strong>{user.email}</strong>
              <button type="button" className="quiet-link" onClick={() => void logout()}>Sign out</button>
            </div>
          ) : null}
        </div>
      </header>

      {notice ? <div className="toast" role="status">{notice}</div> : null}
      {dataError || mapError ? (
        <div className="status-banner" role="alert">
          <span aria-hidden="true">!</span>
          <p>{dataError || mapError}</p>
        </div>
      ) : null}

      <section className={isPublicView ? "workspace public-workspace" : "workspace editor-workspace"} aria-label={isPublicView ? "Public outlook map" : "Outlook editing workspace"}>
        {!isPublicView ? (
          <aside className="editor-rail" aria-label="Outlook controls">
            {user ? (
              <div className="rail-user">
                <span className="rail-user-label">Signed in as</span>
                <strong>{user.email}</strong>
                <button type="button" className="rail-signout" onClick={() => void logout()}>Sign out</button>
              </div>
            ) : null}

            <section className="rail-section">
              <div className="rail-heading">
                <span className="section-kicker">Outlook period</span>
                <strong>Valid forecast</strong>
              </div>
              <div className="day-tabs" role="group" aria-label="Forecast day">
                {([1, 2, 3] as OutlookDay[]).map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={selectedDay === day ? "day-tab active" : "day-tab"}
                    aria-pressed={selectedDay === day}
                    onClick={() => { if (day !== selectedDay) { setSelectedDay(day); setDraft([]); } }}
                  >
                    <span>DAY</span>{day}
                  </button>
                ))}
              </div>
            </section>

            <section className="rail-section">
              <div className="rail-heading">
                <span className="section-kicker">Map region</span>
                <strong>Forecast area</strong>
              </div>
              <div className="region-tabs" role="group" aria-label="Map region">
                {(["USA", "Quebec", "Ontario"] as MapRegion[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={region === item ? "region-tab active" : "region-tab"}
                    aria-pressed={region === item}
                    onClick={() => { if (item !== region) { setRegion(item); setDraft([]); } }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>

            <section className="rail-section">
              <div className="rail-heading">
                <span className="section-kicker">Outlook type</span>
                <strong>Warning mode</strong>
              </div>
              <div className="hazard-tabs" role="group" aria-label="Outlook type">
                {(["Severe", "Winter"] as HazardMode[]).map((hazardOption) => (
                  <button
                    key={hazardOption}
                    type="button"
                    className={hazardMode === hazardOption ? "hazard-tab active" : "hazard-tab"}
                    aria-pressed={hazardMode === hazardOption}
                    onClick={() => changeHazardMode(hazardOption)}
                  >
                    <span>{hazardOption === "Severe" ? "SEV" : "WIN"}</span>{hazardOption}
                  </button>
                ))}
              </div>
            </section>

            <section className="rail-section">
              <div className="rail-heading">
                <span className="section-kicker">Hazard</span>
                <strong>{hazardMode === "Severe" ? "Severe weather" : "Winter weather"}</strong>
              </div>
              <div className="hazard-tabs" role="group" aria-label="Hazard">
                {activeHazards.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={hazard === item.value ? "hazard-tab active" : "hazard-tab"}
                    aria-pressed={hazard === item.value}
                    onClick={() => { if (item.value !== hazard) { setHazard(item.value); setDraft([]); } }}
                  >
                    <span>{item.short}</span>{item.value}
                  </button>
                ))}
              </div>
            </section>

            <section className="rail-section">
              <div className="rail-heading">
                <span className="section-kicker">Risk category</span>
                <strong>{hazardMode === "Winter" ? "Winter risk level" : "Convective probability"}</strong>
              </div>
              <div className="category-list" role="group" aria-label="Risk category">
                {(Object.keys(riskMeta) as RiskCategory[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={category === item ? "category-button active" : "category-button"}
                    aria-pressed={category === item}
                    style={{ "--category-color": riskMeta[item].color, "--category-ink": riskMeta[item].ink } as React.CSSProperties}
                    onClick={() => setCategory(item)}
                  >
                    <span className="category-swatch" aria-hidden="true" />{item}<small>{riskMeta[item].short}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="rail-section rail-tools">
              <div className="rail-heading">
                <span className="section-kicker">Drawing tools</span>
                <strong>Add outlook areas</strong>
              </div>
              <div className="rail-actions">
                {(["polygon", "pencil", "rectangle", "quick"] as DrawMode[]).map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    className={drawing && drawMode === tool ? "tool-button active" : "tool-button"}
                    aria-pressed={drawing && drawMode === tool}
                    onClick={() => activateTool(tool)}
                  >
                    {drawMode === tool && drawing ? `Stop ${drawModeLabels[tool].toLowerCase()}` : drawModeLabels[tool]}
                  </button>
                ))}
              </div>
              <div className="rail-secondary-actions">
                <button type="button" className="tool-button quiet" onClick={() => setDraft((current) => current.slice(0, -1))} disabled={!draft.length}>
                  Undo point
                </button>
                <button type="button" className="tool-button quiet" onClick={() => setDraft([])} disabled={!draft.length}>
                  Clear draft
                </button>
              </div>
            </section>

            <div className="rail-save">
              <button
                type="button"
                className="save-button"
                onClick={() => void saveShape()}
                disabled={draft.length < 3 || !canEdit || saveState === "saving"}
              >
                {saveState === "saving" ? "Publishing…" : saveState === "saved" ? "Published ✓" : draft.length < 3 ? "Add 3+ points to save" : "Publish outlook area"}
              </button>
              <p className="rail-save-note">
                {canEdit
                  ? `${draft.length} point${draft.length === 1 ? "" : "s"} in the current draft.`
                  : "Read-only preview — connect Firebase and sign in to publish."}
              </p>
            </div>
          </aside>
        ) : null}

        <div className="workspace-body">
          {isPublicView ? (
            <div className="public-controls">
              <div className="control-group" role="group" aria-label="Forecast day">
                <span className="control-label">Day</span>
                <div className="segmented">
                  {([1, 2, 3] as OutlookDay[]).map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={selectedDay === day ? "segment active" : "segment"}
                      aria-pressed={selectedDay === day}
                      onClick={() => setSelectedDay(day)}
                    >
                      Day {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group" role="group" aria-label="Map region">
                <span className="control-label">Region</span>
                <div className="segmented">
                  {(["USA", "Quebec", "Ontario"] as MapRegion[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={region === item ? "segment active" : "segment"}
                      aria-pressed={region === item}
                      onClick={() => setRegion(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group" role="group" aria-label="Outlook type">
                <span className="control-label">Type</span>
                <div className="segmented">
                  {(["Severe", "Winter"] as HazardMode[]).map((modeOption) => (
                    <button
                      key={modeOption}
                      type="button"
                      className={hazardMode === modeOption ? "segment active" : "segment"}
                      aria-pressed={hazardMode === modeOption}
                      onClick={() => changeHazardMode(modeOption)}
                    >
                      {modeOption}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group" role="group" aria-label="Hazard">
                <span className="control-label">Hazard</span>
                <div className="segmented">
                  {activeHazards.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={hazard === item.value ? "segment active" : "segment"}
                      aria-pressed={hazard === item.value}
                      aria-label={item.value}
                      title={item.value}
                      onClick={() => setHazard(item.value)}
                    >
                      {item.short}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="map-frame">
            <div className="map-stage">
              {mapReady ? (
                <PoliticalMap
                  region={region}
                  selectedDay={selectedDay}
                  drawMode={drawMode}
                  drawing={drawing}
                  isPublicView={isPublicView}
                  countryData={countryData}
                  stateData={stateData}
                  quebecData={quebecData}
                  ontarioData={ontarioData}
                  savedPolygonData={savedPolygonData}
                  draft={draft}
                  category={category}
                  onMapClick={(point) => { if (!isPublicView && drawing) setDraft((current) => [...current, point]); }}
                  onFreehandComplete={(points) => { if (!isPublicView && drawing) setDraft(points); }}
                />
              ) : null}
              <MapNotice
                loading={mapLoading}
                error={mapError}
                onRetry={() => setMapRequest((current) => current + 1)}
              />
              {!isPublicView && drawing ? (
                <div className="map-instruction" role="status">
                  <strong>{toolLabel}</strong>
                  <span>{instruction}</span>
                </div>
              ) : null}
              <div className="map-stamp">
                <span>{isPublicView ? "Public outlook" : "SPC drawing desk"}</span>
                <strong>Day {selectedDay} · {hazard}</strong>
              </div>
            </div>
          </div>

          <div className="map-footer">
            <ul className="risk-legend" aria-label="Risk category legend">
              {(Object.keys(riskMeta) as RiskCategory[]).map((item) => (
                <li key={item}>
                  <span className="legend-swatch" style={{ background: riskMeta[item].color, borderColor: riskMeta[item].ink }} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            {!isPublicView && draft.length > 2 ? (
              <div className="draft-footer-actions">
                <span>{draft.length} points</span>
                <button
                  type="button"
                  className="save-button compact"
                  onClick={() => void saveShape()}
                  disabled={!canEdit || saveState === "saving"}
                >
                  {saveState === "saving" ? "Publishing…" : saveState === "saved" ? "Published ✓" : "Publish area"}
                </button>
              </div>
            ) : null}
            <p className="map-status" aria-live="polite">
              {loading
                ? "Loading published outlooks…"
                : visibleShapes.length
                  ? `${summary} for Day ${selectedDay} · ${hazard}`
                  : `No areas published for Day ${selectedDay} · ${hazard}`}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
