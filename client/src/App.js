import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/* -------------------------------------------------------
   Tiny utils
------------------------------------------------------- */
const read = (k, f) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const usd = (n) =>
  typeof n === "number" ? n.toLocaleString(undefined, { style: "currency", currency: "USD" }) : "—";
const pad2 = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const FINN = process.env.REACT_APP_FINNHUB_KEY || "";

/* -------------------------------------------------------
   TradingView tape (remounts on theme, opaque bg)
------------------------------------------------------- */
function TradingViewTape({ dark }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";

    const s = document.createElement("script");
    s.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    s.async = true;
    s.innerHTML = JSON.stringify({
      symbols: [
        { proName: "NASDAQ:AAPL", title: "AAPL" },
        { proName: "NASDAQ:MSFT", title: "MSFT" },
        { proName: "NASDAQ:NVDA", title: "NVDA" },
        { proName: "NASDAQ:AMZN", title: "AMZN" },
        { proName: "NASDAQ:META", title: "META" },
        { proName: "NASDAQ:TSLA", title: "TSLA" },
        { proName: "NASDAQ:GOOGL", title: "GOOGL" }
      ],
      showSymbolLogo: true,
      colorTheme: dark ? "dark" : "light",
      isTransparent: false,                 // <- not transparent anymore
      displayMode: "adaptive",
      locale: "en"
    });

    ref.current.appendChild(s);
    return () => { if (ref.current) ref.current.innerHTML = ""; };
  }, [dark]);

  return (
    <div className="fixed-tape">
      <div className="tradingview-widget-container tv-opaque">
        <div className="tradingview-widget-container__widget" ref={ref} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Modal (glass) with body-scroll lock
------------------------------------------------------- */
function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

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

/* -------------------------------------------------------
   Header (tight + neat on mobile & desktop)
------------------------------------------------------- */
function Header({ dark, setDark, openTips, openAbout, openContact }) {
  return (
    <header className="fixed-header">
      <div className="header-inner">
        <div className="brand">
          <span className="brand-big">CandL</span>
          <span className="brand-small">Stock Analyser</span>
        </div>

        <nav className="header-actions" aria-label="primary">
          <button className="btn ghost icon" onClick={() => setDark(d => !d)} aria-label="Toggle theme">
            {dark ? "🌙" : "☀️"}
          </button>
          <button className="btn" onClick={openTips} title="Tips">
            💡 <span className="hide-xs">Tips</span>
          </button>
          <button className="btn ghost hide-sm" onClick={openAbout}>About</button>
          <button className="btn primary contact-cta" onClick={openContact}>Contact developer</button>
        </nav>
      </div>
    </header>
  );
}

/* -------------------------------------------------------
   Snapshot cards
------------------------------------------------------- */
function Snapshot({ profile, quote }) {
  if (!quote) return <p className="muted">Search a symbol above to begin your analysis.</p>;
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
          <div className="value mono">{usd(quote.h)} / {usd(quote.l)}</div>
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

/* -------------------------------------------------------
   News grid
------------------------------------------------------- */
function NewsGrid({ rows }) {
  if (!rows?.length) return <p className="muted">No recent headlines yet.</p>;
  return (
    <div className="news-grid">
      {rows.map((n) => (
        <a key={(n.id || n.url) + n.datetime} className="news" href={n.url} target="_blank" rel="noreferrer">
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

/* -------------------------------------------------------
   Footer (simpler, removed Finnhub button)
------------------------------------------------------- */
function Footer({ openAbout, openContact }) {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="muted sm">CandL — a William Popoola project · © {new Date().getFullYear()}</div>
        <div className="footer-actions">
          <button className="btn" onClick={openAbout}>About</button>
          <button className="btn" onClick={openContact}>Contact</button>
        </div>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------
   App
------------------------------------------------------- */
export default function App() {
  // theme & page skin
  const [dark, setDark] = useState(() => read("ui:dark", true));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    write("ui:dark", dark);
  }, [dark]);

  // modals
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(() => read("tips:open", false)); // closed by default
  useEffect(() => write("tips:open", tipsOpen), [tipsOpen]);

  // search/data
  const initialS = new URLSearchParams(window.location.search).get("s") || "";
  const [q, setQ] = useState(initialS);
  const [tab, setTab] = useState("snapshot");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [profile, setProfile] = useState(null);
  const [news, setNews] = useState([]);

  // global news
  const [globalNews, setGlobalNews] = useState([]);
  useEffect(() => {
    // Finnhub general market news (free)
    const load = async () => {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${FINN}`);
        const rows = await res.json();
        setGlobalNews((rows || []).slice(0, 10));
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  // free-plan safe list
  const ALLOW = useMemo(
    () => ["AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "GOOGL", "AVGO"],
    []
  );

  const analyze = async () => {
    const sym = (q || "").toUpperCase().trim();
    if (!sym || !ALLOW.includes(sym)) {
      alert("Use a supported symbol: AAPL, MSFT, NVDA, AMZN, META, TSLA, GOOGL, AVGO.");
      return;
    }
    setLoading(true);
    try {
      const [qr, pr] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINN}`).then(r => r.json()),
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINN}`).then(r => r.json())
      ]);
      setQuote(qr); setProfile(pr);

      const to = new Date();
      const from = new Date(Date.now() - 7 * 864e5);
      const rows = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${isoDate(from)}&to=${isoDate(to)}&token=${FINN}`
      ).then(r => r.json());

      const seen = new Set();
      const dedup = (rows || []).filter(n => {
        const h = (n.headline || "").trim();
        if (!h || seen.has(h)) return false;
        seen.add(h); return true;
      });
      setNews(dedup.slice(0, 12));
      setTab("snapshot");

      const p = new URLSearchParams(window.location.search);
      p.set("s", sym); window.history.replaceState({}, "", `?${p.toString()}`);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  const clearAll = () => {
    setQuote(null); setProfile(null); setNews([]); setQ("");
    const p = new URLSearchParams(window.location.search);
    p.delete("s"); window.history.replaceState({}, "", `?${p.toString()}`);
  };

  // auto-load deep link
  useEffect(() => { if (initialS) analyze(); /* eslint-disable-next-line */ }, []);

  return (
    <>
      {/* Background skin */}
      <div className="bg-anim" aria-hidden />

      {/* Header + Tape */}
      <Header
        dark={dark}
        setDark={setDark}
        openTips={() => setTipsOpen(true)}
        openAbout={() => setAboutOpen(true)}
        openContact={() => setContactOpen(true)}
      />
      <TradingViewTape dark={dark} />

      {/* Body */}
      <main className="page-under-fixed">
        <section className="panel glass">
          <h1 className="h1">Market Intelligence</h1>
          <p className="muted lead">Live snapshot, curated headlines, dividends &amp; earnings.</p>

          {/* tidy mobile actions */}
          <div className="action-stack">
            <input
              className="input"
              value={q}
              placeholder="Search by symbol or name (e.g., AAPL)"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
            />
            <div className="action-row">
              <button className="btn primary" onClick={analyze} disabled={loading}>
                {loading ? "Analyzing…" : "Analyze"}
              </button>
              <button className="btn" onClick={clearAll}>Clear Snapshot</button>
            </div>
            <div className="tabs">
              {["snapshot", "news", "events"].map((k) => (
                <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                  {k === "snapshot" ? "Snapshot" : k === "news" ? "News" : "Events"}
                </button>
              ))}
            </div>
          </div>

          {tab === "snapshot" && <Snapshot profile={profile} quote={quote} />}
          {tab === "news" && <NewsGrid rows={news} />}
          {tab === "events" && (
            <div className="empty">
              <div className="emoji">📅</div>
              <div className="title">Events coming soon</div>
              <div className="muted">Earnings and dividends will appear here.</div>
            </div>
          )}
        </section>

        {/* Top Market News — Global (now loads) */}
        <section className="section glass-alt">
          <h2 className="h2">Top Market News — Global</h2>
          {!globalNews.length ? (
            <p className="muted">Fetching headlines…</p>
          ) : (
            <div className="news-grid">
              {globalNews.map((n) => (
                <a key={(n.id || n.url) + n.datetime} className="news" href={n.url} target="_blank" rel="noreferrer">
                  <div className="news-meta">
                    {n.source || "Source"} · {new Date((n.datetime || 0) * 1000).toLocaleString()}
                  </div>
                  <div className="news-title">{n.headline}</div>
                  <div className="news-snippet">{n.summary}</div>
                </a>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer openAbout={() => setAboutOpen(true)} openContact={() => setContactOpen(true)} />

      {/* Modals */}
      <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title="About CandL">
        <p><strong>CandL</strong> is a mobile-first stock analyser focused on clarity, speed, and accessibility.</p>
        <p>Enter a supported ticker to see real-time pricing context, day ranges, and curated company headlines.
           Use the tabs to switch views. The theme toggle adapts both the UI and the market tape.</p>
        <p>Deep-link any symbol with <code>?s=SYMBOL</code> (e.g., <code>?s=AAPL</code>) to share a direct view.
           Your API key lives as an environment variable and is never hard-coded into the client build.</p>
        <p className="muted">Built with React. Design language: glass surfaces, soft shadows, and compact
           touch-targets for a calm, professional feel.</p>
      </Modal>

      <Modal open={contactOpen} onClose={() => setContactOpen(false)} title="Contact the Developer">
        <ul className="list">
          <li>📧 <a href="mailto:itzarishe@gmail.com">itzarishe@gmail.com</a></li>
          <li>📞 <a href="tel:+2347071703030">+234 707 170 3030</a></li>
          <li>📷 <a href="https://instagram.com/arisheoluwa" target="_blank" rel="noreferrer">@arisheoluwa</a></li>
          <li>𝕏 <a href="https://x.com/arisheoluwa" target="_blank" rel="noreferrer">@arisheoluwa</a></li>
          <li>💼 <a href="https://www.linkedin.com/in/william-popoola/" target="_blank" rel="noreferrer">LinkedIn — William Popoola</a></li>
        </ul>
      </Modal>

      <Modal open={tipsOpen} onClose={() => setTipsOpen(false)} title="Quick Tips">
        <ul className="list">
          <li>Type a ticker like <code>AAPL</code> → tap <strong>Analyze</strong>.</li>
          <li>Use tabs for <strong>Snapshot</strong>, <strong>News</strong>, <strong>Events</strong>.</li>
          <li>Switch themes with ☀️/🌙 — the market tape follows suit.</li>
          <li>Share <code>?s=NVDA</code> to deep-link a symbol.</li>
        </ul>
      </Modal>
    </>
  );
}
