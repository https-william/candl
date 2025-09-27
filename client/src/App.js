import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/* =========================
   Util
========================= */
const read = (k, f) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const usd = (n) => (typeof n === "number" ? n.toLocaleString(undefined, { style: "currency", currency: "USD" }) : "—");
const pad2 = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

const FINNHUB = process.env.REACT_APP_FINNHUB_KEY || "";

/* =========================
   Components
========================= */

/* --- Modal --- */
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <>
      <div className="modal-dim" onClick={onClose} />
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>
  );
}

/* --- TradingView Ticker Tape (rebuilds on theme change) --- */
function TradingViewTape({ dark }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    s.async = true;
    s.innerHTML = JSON.stringify({
      symbols: [
        { proName: "NASDAQ:AAPL", title: "AAPL" },
        { proName: "NASDAQ:MSFT", title: "MSFT" },
        { proName: "NASDAQ:NVDA", title: "NVDA" },
        { proName: "NASDAQ:AMZN", title: "AMZN" },
        { proName: "NASDAQ:META", title: "META" },
        { proName: "NASDAQ:TSLA", title: "TSLA" },
        { proName: "NASDAQ:GOOGL", title: "GOOGL" },
      ],
      showSymbolLogo: true,
      colorTheme: dark ? "dark" : "light",
      isTransparent: true,
      displayMode: "adaptive",
      locale: "en",
    });
    ref.current.appendChild(s);
    return () => { if (ref.current) ref.current.innerHTML = ""; };
  }, [dark]);
  return (
    <div className="fixed-tape">
      <div className="tradingview-widget-container">
        <div className="tradingview-widget-container__widget" ref={ref} />
      </div>
    </div>
  );
}

/* --- Header --- */
function Header({ dark, setDark, onTips, onAbout, onContact }) {
  return (
    <header className="fixed-header">
      <div className="header-inner">
        <div className="brand">
          <span className="brand-big">CandL</span>
          <span className="brand-small">Stock Analyser</span>
        </div>
        <div className="header-actions">
          <button className="btn ghost icon" onClick={() => setDark((d) => !d)} aria-label="Toggle theme">
            {dark ? "🌙" : "☀️"}
          </button>
          <button className="btn" onClick={onTips} title="Quick tips">
            💡 <span>Tips</span>
          </button>
          <button className="btn ghost hide-sm" onClick={onAbout}>About</button>
          <button className="btn primary" onClick={onContact}>Contact developer</button>
        </div>
      </div>
    </header>
  );
}

/* --- Snapshot cards --- */
function Snapshot({ profile, quote }) {
  if (!quote) {
    return <p className="muted">Search a symbol above to begin your analysis.</p>;
  }
  const change = quote.c - quote.pc;
  const pct = quote.pc ? (change / quote.pc) * 100 : 0;
  return (
    <>
      <div className="grid">
        <div className="card">
          <div className="label">Company</div>
          <div className="value">{profile?.name || profile?.ticker || "—"}</div>
          <div className="sub">
            {(profile?.exchange || "").toUpperCase()} · {(profile?.currency || "USD").toUpperCase()}
          </div>
        </div>
        <div className="card">
          <div className="label">Price</div>
          <div className="value mono">
            {usd(quote.c)}{" "}
            <span className={change >= 0 ? "up" : "down"}>
              {change >= 0 ? "▲" : "▼"} {pct.toFixed(2)}%
            </span>
          </div>
          <div className="sub">Prev close {usd(quote.pc)}</div>
        </div>
        <div className="card">
          <div className="label">Day High / Low</div>
          <div className="value mono">
            {usd(quote.h)} / {usd(quote.l)}
          </div>
          <div className="sub">Today</div>
        </div>
        <div className="card">
          <div className="label">Open</div>
          <div className="value mono">{usd(quote.o)}</div>
          <div className="sub">Today</div>
        </div>
      </div>
      <div className="footnote"><span className="dot" /> Data via Finnhub</div>
    </>
  );
}

/* --- News grid --- */
function NewsGrid({ rows }) {
  if (!rows?.length) return <p className="muted">No recent headlines yet.</p>;
  return (
    <div className="news-grid">
      {rows.map((n) => (
        <a key={(n.id || n.url) + n.datetime} href={n.url} className="news" target="_blank" rel="noreferrer">
          <div className="news-meta">
            {n.source || "Source"} · {new Date((n.datetime || 0) * 1000).toLocaleString()}
          </div>
          <div className="news-title">{n.headline}</div>
          <div className="news-snippet">{n.summary}</div>
        </a>
      ))}
    </div>
  );
}

/* --- Footer --- */
function Footer({ onAbout, onContact }) {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="muted sm">CandL — a William Popoola project · © {new Date().getFullYear()}</div>
        <div className="footer-actions">
          <button className="btn" onClick={onAbout}>About</button>
          <button className="btn" onClick={onContact}>Contact</button>
          <a className="btn" href="https://finnhub.io/" target="_blank" rel="noreferrer">Data via Finnhub</a>
        </div>
      </div>
    </footer>
  );
}

/* =========================
   App (full)
========================= */
export default function App() {
  /* theme */
  const [dark, setDark] = useState(() => read("ui:dark", true));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    write("ui:dark", dark);
  }, [dark]);

  /* modals */
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(() => read("tips:open", false)); // default closed
  useEffect(() => write("tips:open", tipsOpen), [tipsOpen]);

  /* search + data */
  const initialS = new URLSearchParams(window.location.search).get("s") || "";
  const [q, setQ] = useState(initialS);
  const [tab, setTab] = useState("snapshot");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [profile, setProfile] = useState(null);
  const [news, setNews] = useState([]);

  // guard for free plan
  const ALLOW = useMemo(() => ["AAPL","MSFT","NVDA","AMZN","META","TSLA","GOOGL","AVGO"], []);

  const analyze = async () => {
    const sym = (q || "").toUpperCase().trim();
    if (!sym || !ALLOW.includes(sym)) {
      alert("Use a supported symbol: AAPL, MSFT, NVDA, AMZN, META, TSLA, GOOGL, AVGO.");
      return;
    }
    setLoading(true);
    try {
      const [qr, pr] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB}`).then(r=>r.json()),
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINNHUB}`).then(r=>r.json()),
      ]);
      setQuote(qr); setProfile(pr);

      const to = new Date(), from = new Date(Date.now()-7*864e5);
      const rows = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${isoDate(from)}&to=${isoDate(to)}&token=${FINNHUB}`
      ).then(r=>r.json());
      const seen = new Set();
      const dedup = (rows||[]).filter(n=>{
        const h=(n.headline||"").trim(); if(!h||seen.has(h)) return false; seen.add(h); return true;
      });
      setNews(dedup.slice(0,12));

      setTab("snapshot");
      const params = new URLSearchParams(window.location.search); params.set("s", sym);
      window.history.replaceState({}, "", `?${params.toString()}`);
    } catch(e){ console.error(e); } finally { setLoading(false); }
  };

  const clearAll = () => {
    setQuote(null); setProfile(null); setNews([]); setQ("");
    const params = new URLSearchParams(window.location.search); params.delete("s");
    window.history.replaceState({}, "", `?${params.toString()}`);
  };

  // Auto-load if URL had ?s=...
  useEffect(() => { if (initialS) analyze(); /* eslint-disable-next-line */ }, []);

  return (
    <>
      <Header
        dark={dark}
        setDark={setDark}
        onTips={() => setTipsOpen(true)}
        onAbout={() => setAboutOpen(true)}
        onContact={() => setContactOpen(true)}
      />

      <TradingViewTape dark={dark} />

      <main className="page-under-fixed">
        {/* Hero */}
        <section className="panel glass">
          <h1 className="h1">Market Intelligence</h1>
          <p className="muted lead">Live snapshot, curated headlines, dividends &amp; earnings.</p>

          <div className="search-row">
            <input
              className="input"
              value={q}
              placeholder="Search by symbol or name (e.g., AAPL)"
              onChange={(e)=>setQ(e.target.value)}
              onKeyDown={(e)=> e.key==='Enter' && analyze()}
            />
            <div className="act">
              <button className="btn primary" onClick={analyze} disabled={loading}>
                {loading ? "Analyzing…" : "Analyze"}
              </button>
              <button className="btn" onClick={clearAll}>Clear Snapshot</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs">
            {["snapshot","news","events"].map(k=>(
              <button key={k} className={`tab ${tab===k?"active":""}`} onClick={()=>setTab(k)}>
                {k==="snapshot"?"Snapshot":k==="news"?"News":"Events"}
              </button>
            ))}
          </div>

          {/* Panels */}
          {tab==="snapshot" && <Snapshot profile={profile} quote={quote} />}
          {tab==="news" && <NewsGrid rows={news} />}
          {tab==="events" && (
            <div className="empty">
              <div className="emoji">📅</div>
              <div className="title">Events coming soon</div>
              <div className="muted">Earnings and dividends will appear here.</div>
            </div>
          )}
        </section>

        {/* Global area placeholder */}
        <section className="section">
          <h2 className="h2">Top Market News — Global</h2>
          <p className="muted">Ten stories · curated.</p>
        </section>
      </main>

      <Footer onAbout={()=>setAboutOpen(true)} onContact={()=>setContactOpen(true)} />

      {/* Modals */}
      <Modal open={aboutOpen} onClose={()=>setAboutOpen(false)} title="About CandL">
        <p><strong>CandL</strong> is a mobile-first stock analyser. Enter a supported ticker to
        view a real-time snapshot and curated headlines. Clean UI, minimal noise.</p>
        <p className="muted">Pro tip: add <code>?s=AAPL</code> to the URL to deep-link a symbol.</p>
      </Modal>

      <Modal open={contactOpen} onClose={()=>setContactOpen(false)} title="Contact the Developer">
        <ul className="list">
          <li>📧 <a href="mailto:itzarishe@gmail.com">itzarishe@gmail.com</a></li>
          <li>📞 <a href="tel:+2347071703030">+234 707 170 3030</a></li>
          <li>📷 <a href="https://instagram.com/arisheoluwa" target="_blank" rel="noreferrer">@arisheoluwa</a></li>
          <li>𝕏 <a href="https://x.com/arisheoluwa" target="_blank" rel="noreferrer">@arisheoluwa</a></li>
          <li>💼 <a href="https://www.linkedin.com/in/william-popoola/" target="_blank" rel="noreferrer">LinkedIn — William Popoola</a></li>
        </ul>
      </Modal>

      <Modal open={tipsOpen} onClose={()=>setTipsOpen(false)} title="Quick Tips">
        <ul className="list">
          <li>Type a ticker like <code>AAPL</code> and tap <strong>Analyze</strong>.</li>
          <li>Use tabs for <strong>Snapshot</strong>, <strong>News</strong>, and <strong>Events</strong>.</li>
          <li>Switch themes with the ☀️/🌙 button; the ticker tape adapts.</li>
          <li>Share links like <code>?s=NVDA</code> to open directly.</li>
        </ul>
      </Modal>
    </>
  );
}
