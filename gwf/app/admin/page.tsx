"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";

import { db } from "@/lib/firebase";

type Region = "Both" | "USA" | "Canada";

type Source = {
  country: "USA" | "Canada";
  agency: string;
  name: string;
  status: string;
  detail: string;
  href: string;
  tone: string;
};

const sources: Source[] = [
  {
    country: "USA",
    agency: "NWS",
    name: "National Weather Service",
    status: "Operational",
    detail: "Forecasts, warnings, watches, and observations",
    href: "https://www.weather.gov/",
    tone: "usa",
  },
  {
    country: "Canada",
    agency: "ECCC",
    name: "Environment and Climate Change Canada",
    status: "Operational",
    detail: "Public forecasts, alerts, radar, and satellite",
    href: "https://weather.gc.ca/",
    tone: "canada",
  },
];

type ForecastArea = { id?: string; name: string; country: Region; detail: string; updated?: string; createdAt?: unknown };

export default function AdminPage() {
  const [region, setRegion] = useState<Region>("Both");
  const [locations, setLocations] = useState<ForecastArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const visibleSources = useMemo(() => sources.filter((source) => region === "Both" || source.country === region), [region]);

  useEffect(() => {
    const loadAreas = async () => {
      if (!db) { setDataError("Connect Firebase to load forecast areas."); setLoading(false); return; }
      try {
        const snapshot = await getDocs(query(collection(db, "forecast-areas"), orderBy("createdAt", "desc")));
        setLocations(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as ForecastArea) })));
      } catch (error) { console.error("Could not load forecast areas:", error); setDataError("Firestore could not load forecast areas."); }
      finally { setLoading(false); }
    };
    void loadAreas();
  }, []);

  const addLocation = async () => {
    const name = window.prompt("Forecast area name");
    if (!name?.trim()) return;
    if (!db) { setDataError("Connect Firebase before adding forecast areas."); return; }
    const area = { name: name.trim(), country: region, detail: "New work area", createdAt: serverTimestamp() };
    try {
      const ref = await addDoc(collection(db, "forecast-areas"), area);
      setLocations((current) => [{ ...area, id: ref.id, updated: "Just now" }, ...current]);
    } catch (error) { console.error("Could not save forecast area:", error); setDataError("Firestore could not save this forecast area."); }
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Forecast administration</p>
          <h1>North American Desk</h1>
          <p className="admin-subtitle">One operational view for Canada and the United States.</p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-status"><span className="live-dot" /> Desk online</span>
          <Link className="admin-link" href="/">Open drawing desk</Link>
        </div>
      </header>

      <section className="admin-toolbar" aria-label="Forecast region">
        <div><span className="section-kicker">Coverage</span><strong>Active region</strong></div>
        <div className="region-tabs">
          {(["Both", "USA", "Canada"] as Region[]).map((item) => (
            <button key={item} type="button" className={region === item ? "region-tab active" : "region-tab"} onClick={() => setRegion(item)}>{item === "Both" ? "Canada + USA" : item}</button>
          ))}
        </div>
        <span className="toolbar-updated">Last checked 2 min ago</span>
      </section>

      <section className="source-grid">
        {visibleSources.map((source) => (
          <article className={`source-card ${source.tone}`} key={source.agency}>
            <div className="source-topline"><span className="source-code">{source.agency}</span><span className="source-operational"><span />{source.status}</span></div>
            <h2>{source.name}</h2>
            <p>{source.detail}</p>
            <a href={source.href} target="_blank" rel="noreferrer">Open official source <span aria-hidden="true">↗</span></a>
          </article>
        ))}
      </section>

      <section className="admin-content-grid">
        <div className="admin-panel">
          <div className="panel-heading"><div><span className="section-kicker">Monitoring list</span><h2>Forecast areas</h2></div><button type="button" className="add-button" onClick={addLocation}>+ Add area</button></div>
          <div className="location-list">
            {loading ? <div className="admin-empty">Loading forecast areas...</div> : locations.filter((location) => region === "Both" || location.country === region || location.country === "Both").map((location) => (
              <div className="location-row" key={location.name}><span className="location-pin" /><div><strong>{location.name}</strong><small>{location.detail}</small></div><time>{location.updated}</time><span className="row-chevron">›</span></div>
            ))}
            {!loading && !locations.filter((location) => region === "Both" || location.country === region || location.country === "Both").length ? <div className="admin-empty">No forecast areas configured.</div> : null}
          </div>
        </div>
        <aside className="admin-panel readiness-panel">
          <div className="panel-heading"><div><span className="section-kicker">Shift handoff</span><h2>Desk readiness</h2></div><span className="readiness-score">4 / 4</span></div>
          <div className="readiness-list"><div><span className="checkmark">✓</span><span>National sources connected</span></div><div><span className="checkmark">✓</span><span>Coverage regions selected</span></div><div><span className="checkmark">✓</span><span>SPC outlook desk available</span></div><div><span className="checkmark">✓</span><span>Drawing workspace ready</span></div></div>
          <Link className="desk-link" href="/">Continue to outlook polygons <span aria-hidden="true">→</span></Link>
        </aside>
      </section>

      <footer className="admin-footer"><span>{dataError || "Sources are official links to NWS and ECCC products."}</span><span>Operational console · {region === "Both" ? "North America" : region}</span></footer>
    </main>
  );
}
