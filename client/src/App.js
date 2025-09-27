import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/* ---------------- utils ---------------- */
const read = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const usd = (n) => (typeof n === "number" ? n.toLocaleString(undefined, { style: "currency", currency: "USD" }) : "—");
const pad2 = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const FINN = process.env.REACT_APP_FINNHUB_KEY || "";

/* ---- tiny sentiment lexicon (fallback) ---- */
const POS = new Set([
  "beat","beats","beating","growth","surge","surges","surging","jump","jumps","jumping",
  "rally","rallies","bull","bullish","buy","buys","upgrade","upgrades","record","profit",
  "profits","profitable","strong","strength","gain","gains","gaining","outperform","top","tops",
  "positive","optimistic","recover","recovery","recovering","expand","expands","expansion"
]);
const NEG = new Set([
  "miss","misses","missed","fall","falls","falling","drop","drops","dropped","plunge","plunges",
  "bear","bearish","sell","sells","downgrade","downgrades","loss","losses","weak","weakness",
  "decline","declines","declining","cut","cuts","cutting","lawsuit","probe","investigation",
  "risk","risks","negative","warning","halt","halts","recall","restructuring","bankrupt","bankruptcy"
]);

function scoreText(s="") {
  const words = s.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/);
  let pos=0, neg=0;
  for (const w of words){ if (POS.has(w)) pos++; if (NEG.has(w)) neg++; }
  return pos - neg;
}

function fallbackSentimentFromNews(rows) {
  if (!rows || !rows.length) return null;
  let posCount=0, negCount=0, neuCount=0;
  for (const n of rows) {
    const text = `${n.headline||""} ${n.summary||""}`;
    const sc = scoreText(text);
    if (sc > 0) posCount++; else if (sc < 0) negCount++; else neuCount++;
  }
  const total = posCount + negCount + neuCount || 1;
  const bullishPercent = (posCount / total) * 100;
  const bearishPercent = (negCount / total) * 100;
  const articlesInLastWeek = rows.length;
  const weeklyAverage = 20; // simple baseline so Buzz has context
  const buzz = Math.min(3, articlesInLastWeek / weeklyAverage) * 100 / 3 * 100 / 100; // scaled 0–100
  return {
    buzz: { articlesInLastWeek, weeklyAverage, buzz },
    sentiment: { bullishPercent, bearishPercent }
  };
}

/* ---------------- TradingView (scaled + opaque) ---------------- */
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
        { proName: "NASDAQ:GOOGL", title: "GOOGL" }
      ],
      showSymbolLogo: true,
      colorTheme: dark ? "dark" : "light",
      isTransparent: false,
      displayMode: "adaptive",
      locale: "en"
    });
    ref.current.appendChild(s);
    return () => { if (ref.current) ref.current.innerHTML = ""; };
  }, [dark]);

  return (
    <div className="fixed-tape">
      <div className="tv-wrap">
        <div className="tradingview-widget-container tv-opaque">
          <div className="tradingview-widget-container__widget" ref={ref} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Modal (glass + body scroll lock) ---------------- */
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

/* ---------------- Header (tidy, responsive) ---------------- */
function Header({ dark, setDark, openTips, openAbout, openContact }) {
  return (
    <header className="fixed-header">
      <div className="header-inner">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div className="brand-text">
            <div className="brand-big">CandL</div>
            <div className="brand-small">Stock Analyser</div>
          </div>
        </div>
        <nav className="header-actions" aria-label="primary">
          <button className="btn ghost icon" onClick={() => setDark(d => !d)} aria-label="Toggle theme">
            {dark ? "🌙" : "☀️"}
          </button>
          <button className="btn ghost icon" onClick={openTips} aria-label="Open tips">💡</button>
          <button className="btn ghost hide-xs" onClick={openAbout}>About</button>
          <button className="btn primary contact-cta" onClick={openContact}>Contact developer</button>
        </nav>
      </div>
    </header>
  );
}

/* ---------------- Snapshot cards ---------------- */
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

/* ---------------- News grid ---------------- */
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

/* ---------------- Social Sentiment UI ---------------- */
function SentimentBar({ label, value }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="sent-row">
      <div className="sent-label">{label}</div>
      <div className="sent-bar">
        <div className="sent-fill" style={{ width: `${v}%` }} />
        <div className="sent-val">{v.toFixed(0)}%</div>
      </div>
    </div>
  );
}
function SentimentPanel({ data }) {
  if (!data) return <p className="muted">No sentiment yet. Search a symbol first.</p>;
  const bull = data?.sentiment?.bullishPercent ?? null;
  const bear = data?.sentiment?.bearishPercent ?? null;
  const buzz = data?.buzz?.buzz ?? null;
  const artW = data?.buzz?.articlesInLastWeek ?? null;
  const avgW = data?.buzz?.weeklyAverage ?? null;
  return (
    <div className="sent-grid">
      <div className="sent-card">
        <h3 className="sent-title">Market Buzz</h3>
        <div className="muted sm">Articles this week</div>
        <div className="value">{artW ?? "—"}</div>
        <div className="muted sm">Vs weekly avg: <strong>{avgW ?? "—"}</strong></div>
        <div className="muted sm">Buzz factor</div>
        <div className="value">{Number.isFinite(buzz) ? buzz.toFixed(2) : "—"}</div>
      </div>
      <div className="sent-card">
        <h3 className="sent-title">Sentiment Mix</h3>
        <SentimentBar label="Bullish" value={bull} />
        <SentimentBar label="Bearish" value={bear} />
        <div className="muted sm">Source: Finnhub news-sentiment (fallback to headlines)</div>
      </div>
    </div>
  );
}

/* ---------------- Footer ---------------- */
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

/* ---------------- App ---------------- */
export default function App() {
  // theme
  const [dark, setDark] = useState(() => read("ui:dark", true));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    write("ui:dark", dark);
  }, [dark]);

  // modals
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(() => read("tips:open", false));
  useEffect(() => write("tips:open", tipsOpen), [tipsOpen]);

  // search/data
  const initialS = new URLSearchParams(window.location.search).get("s") || "";
  const [q, setQ] = useState(initialS);
  const [tab, setTab] = useState("snapshot");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [profile, setProfile] = useState(null);
  const [news, setNews] = useState([]);

  // sentiment
  const [sentiment, setSentiment] = useState(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [sentimentError, setSentimentError] = useState(null);

  // global news
  const [globalNews, setGlobalNews] = useState([]);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${FINN}`);
        const rows = await res.json();
        setGlobalNews((rows || []).slice(0, 8));
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  // free-plan allowlist
  const ALLOW = useMemo(() => ["AAPL","MSFT","NVDA","AMZN","META","TSLA","GOOGL","AVGO"], []);

  const analyze = async () => {
    const sym = (q || "").toUpperCase().trim();
    if (!sym || !ALLOW.includes(sym)) {
      alert("Use a supported symbol: AAPL, MSFT, NVDA, AMZN, META, TSLA, GOOGL, AVGO.");
      return;
    }
    setLoading(true);
    setSentimentLoading(true);
    setSentimentError(null);
    try {
      // Snapshot + profile
      const [qr, pr] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINN}`).then(r => r.json()),
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINN}`).then(r => r.json())
      ]);
      setQuote(qr); setProfile(pr);

      // Company news (7d) — also used for fallback
      const to = new Date();
      const from = new Date(Date.now() - 7 * 864e5);
      const newsRows = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${isoDate(from)}&to=${isoDate(to)}&token=${FINN}`
      ).then(r => r.json());
      const seen = new Set();
      const dedup = (newsRows || []).filter(n => {
        const h = (n.headline || "").trim();
        if (!h || seen.has(h)) return false;
        seen.add(h); return true;
      });
      setNews(dedup.slice(0, 12));

      // Finnhub sentiment (primary)
      let sentData = null;
      try {
        const resp = await fetch(`https://finnhub.io/api/v1/news-sentiment?symbol=${sym}&token=${FINN}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const js = await resp.json();
        // check if data is meaningful
        const hasBull = Number.isFinite(js?.sentiment?.bullishPercent);
        const hasBear = Number.isFinite(js?.sentiment?.bearishPercent);
        const hasBuzz = Number.isFinite(js?.buzz?.articlesInLastWeek);
        if (hasBull || hasBear || hasBuzz) {
          sentData = js;
        }
      } catch (e) {
        // keep sentData = null; will fallback below
      }

      // Fallback: derive from headlines if Finnhub returns empty/weak
      if (!sentData || (!sentData.sentiment && !sentData.buzz)) {
        const fb = fallbackSentimentFromNews(dedup);
        if (fb) {
          sentData = fb;
        } else {
          setSentimentError("Sentiment unavailable right now. Try again in a minute.");
        }
      }

      setSentiment(sentData || null);
      setTab("sentiment"); // jump user straight to sentiment after analyze
      // deep link
      const p = new URLSearchParams(window.location.search);
      p.set("s", sym); window.history.replaceState({}, "", `?${p.toString()}`);
    } catch (e) {
      console.error(e);
      setSentiment(null);
      setSentimentError("Could not load sentiment. Please retry.");
    } finally {
      setLoading(false);
      setSentimentLoading(false);
    }
  };

  const clearAll = () => {
    setQuote(null); setProfile(null); setNews([]); setSentiment(null);
    setSentimentError(null); setSentimentLoading(false);
    setQ("");
    const p = new URLSearchParams(window.location.search);
    p.delete("s"); window.history.replaceState({}, "", `?${p.toString()}`);
  };

  // auto-load deep link if provided
  useEffect(() => { if (initialS) analyze(); /* eslint-disable-next-line */ }, []);

  return (
    <>
      {/* Frosted animated backdrop */}
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

      {/* Main */}
      <main className="page-under-fixed">
        <section className="panel glass">
          <h1 className="h1">Market Intelligence</h1>
          <p className="muted lead">Live snapshot, social sentiment, and curated headlines.</p>

          {/* Tidy mobile actions */}
          <div className="action-stack">
            <input
              className="input"
              value={q}
              placeholder="Search by symbol or name (e.g., AAPL)"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
            />
            <div className="action-row">
              <button className="btn primary" onClick={analyze} disabled={loading || sentimentLoading}>
                {(loading || sentimentLoading) ? "Analyzing…" : "Analyze"}
              </button>
            </div>
            <div className="action-row">
              <button className="btn" onClick={clearAll}>Clear Snapshot</button>
            </div>
            <div className="tabs">
              {["snapshot", "news", "sentiment", "events"].map((k) => (
                <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                  {k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {tab === "snapshot" && <Snapshot profile={profile} quote={quote} />}
          {tab === "news" && <NewsGrid rows={news} />}

          {tab === "sentiment" && (
            sentimentLoading ? (
              <p className="muted">Loading sentiment…</p>
            ) : sentimentError ? (
              <p className="muted">{sentimentError}</p>
            ) : (
              <SentimentPanel data={sentiment} />
            )
          )}

          {tab === "events" && (
            <div className="empty">
              <div className="emoji">📅</div>
              <div className="title">Events coming soon</div>
              <div className="muted">Earnings and dividends will appear here.</div>
            </div>
          )}
        </section>

        {/* Global News */}
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
        <p>Enter a supported ticker to see a real-time snapshot, sentiment mix from recent news, and curated headlines.
           Use the tabs to switch views. The theme toggle adapts the UI and the market tape.</p>
        <p>Share links like <code>?s=AAPL</code> to open directly. Your API key is stored securely as an environment variable.</p>
        <p className="muted">Design: frosted glass panels over a calm animated canvas; compact controls and readable type for small screens.</p>
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
          <li>Type a ticker (e.g., <code>AAPL</code>) → <strong>Analyze</strong>.</li>
          <li>Tabs: <strong>Snapshot</strong>, <strong>News</strong>, <strong>Sentiment</strong>, <strong>Events</strong>.</li>
          <li>Switch themes with ☀️/🌙 — the market tape follows.</li>
          <li>Share <code>?s=NVDA</code> to open directly.</li>
        </ul>
      </Modal>
    </>
  );
}
