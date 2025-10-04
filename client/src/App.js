// ===== CandL — App.js (drop-in) =====
import React, { useEffect, useRef, useState } from "react";
import "./App.css";

/** ENV (Create React App) */
const FINN = process.env.REACT_APP_FINNHUB_KEY;               // .env value
const API = "https://candl-api.vercel.app";                   // your serverless API

const defaultTickers = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA"];

/** Util */
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  return { theme, setTheme };
}

function Pill({ type, children }) {
  const cls = type === "pos" ? "pill pill-pos" : type === "neg" ? "pill pill-neg" : "pill pill-mid";
  return <span className={cls}>{children}</span>;
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState("snapshot");
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);

  const [quote, setQuote] = useState(null);
  const [profile, setProfile] = useState(null);
  const [companyNews, setCompanyNews] = useState([]);
  const [marketNews, setMarketNews] = useState([]);
  const [consensus, setConsensus] = useState(null);

  const [showAbout, setShowAbout] = useState(false);
  const [showContact, setShowContact] = useState(false);

  /** Ticker tape */
  const tvRef = useRef(null);
  useEffect(() => {
    if (!tvRef.current) return;
    // clear old
    tvRef.current.innerHTML = "";
    // inject TradingView script
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    s.async = true;
    s.innerHTML = JSON.stringify({
      symbols: defaultTickers.map((t) => ({ proName: `NASDAQ:${t}`, title: t })),
      showSymbolLogo: true,
      colorTheme: theme === "dark" ? "dark" : "light",
      isTransparent: false,
      displayMode: "adaptive",
      locale: "en",
    });
    tvRef.current.appendChild(s);
  }, [theme]);

  /** Boot: global news */
  useEffect(() => {
    if (!FINN) return;
    (async () => {
      try {
        const url = `https://finnhub.io/api/v1/news?category=general&token=${FINN}`;
        const r = await fetch(url);
        const j = await r.json();
        setMarketNews(Array.isArray(j) ? j.slice(0, 10) : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  /** Analyze */
  async function handleAnalyze() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    if (!FINN) {
      alert("Add REACT_APP_FINNHUB_KEY in .env to analyze companies.");
      return;
    }
    setLoading(true);
    setTab("snapshot");
    try {
      const [q, p] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINN}`).then((r) => r.json()),
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINN}`).then((r) => r.json()),
      ]);
      setQuote(q && q.c ? q : null);
      setProfile(p && p.name ? p : null);

      // company news (last 7 days)
      const from = daysAgo(7);
      const to = today();
      const news = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${from}&to=${to}&token=${FINN}`
      ).then((r) => r.json());
      setCompanyNews(Array.isArray(news) ? news.slice(0, 14) : []);

      // analyst consensus from your API
      const cons = await fetch(`${API}/api/consensus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      }).then((r) => r.json());
      setConsensus(cons || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function clearSnapshot() {
    setQuote(null);
    setProfile(null);
    setCompanyNews([]);
    setConsensus(null);
    setSymbol("");
  }

  function consensusLabel(s) {
    if (!s) return "—";
    const { strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0 } = s;
    if (strongBuy + buy > sell + strongSell + hold) return strongBuy > 0 ? "Strong Buy" : "Buy";
    if (sell + strongSell > strongBuy + buy + hold) return strongSell > 0 ? "Strong Sell" : "Sell";
    return "Hold";
  }

  return (
    <div className="app-wrap">
      {/* HEADER */}
      <header className="header">
        <div className="header-row container">
          <div className="brand">
            <div className="logo">C</div>
            CandL <span style={{ opacity: 0.55, fontWeight: 700 }}>Stock Analyser</span>
          </div>
          <div className="header-spacer" />
          <div className="header-actions">
            <button className="btn pill ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? "☀︎ Light" : "🌙 Dark"}
            </button>
            <button className="btn pill ghost" onClick={() => setShowAbout(true)}>About</button>
            <button className="btn pill" onClick={() => setShowContact(true)}>Contact developer</button>
          </div>
        </div>
      </header>

      {/* TRADINGVIEW TICKER */}
      <div className="ticker-wrap">
        <div className="ticker-inner" style={{ padding: "4px 8px" }}>
          <div className="tradingview-widget-container" ref={tvRef} />
        </div>
      </div>

      {/* MAIN */}
      <main className="container stack">
        {/* HERO */}
        <section className="panel hero">
          <h1 className="hero-title">Market Intelligence</h1>
          <div className="hero-sub">Live snapshot, social sentiment, and curated headlines.</div>

          <div className="stack" style={{ gap: 12 }}>
            <div className="search-row">
              <input
                className="input"
                placeholder="Search by symbol or name (e.g., AAPL)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              />
              <button className="btn primary" onClick={handleAnalyze} disabled={loading}>
                {loading ? "Analyzing…" : "Analyze"}
              </button>
            </div>

            <div className="stack" style={{ gap: 8 }}>
              <div className="tabs">
                {["snapshot", "news", "sentiment", "events"].map((t) => (
                  <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button className="btn ghost" onClick={clearSnapshot}>Clear Snapshot</button>
              </div>
            </div>
          </div>
        </section>

        {/* SNAPSHOT */}
        {tab === "snapshot" && (
          <section className="grid">
            <div className="panel" style={{ gridColumn: "span 7" }}>
              <div className="card-title">Company Overview</div>
              {!profile ? (
                <div className="muted">Search a symbol above to begin your analysis.</div>
              ) : (
                <div className="stack">
                  <div style={{ fontWeight: 800, fontSize: 20 }}>{profile.name}</div>
                  <div className="muted">{profile.exchange} • {profile.currency}</div>
                  {quote && (
                    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                      <div style={{ fontSize: 32, fontWeight: 900 }}>${quote.c?.toFixed(2)}</div>
                      <div className={quote.d >= 0 ? "pill pill-pos" : "pill pill-neg"}>
                        {quote.d >= 0 ? "▲" : "▼"} {quote.dp?.toFixed(2)}%
                      </div>
                    </div>
                  )}
                  <div className="stack" style={{ gap: 8 }}>
                    <div className="pill pill-mid">Market Cap: {profile.marketCapitalization ? `$${profile.marketCapitalization.toLocaleString()}M` : "—"}</div>
                    <div className="pill pill-mid">IPO: {profile.ipo || "—"}</div>
                    <div className="pill pill-mid">Country: {profile.country || "—"}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="panel" style={{ gridColumn: "span 5" }}>
              <div className="card-title">Analyst Consensus</div>
              {!consensus || !consensus.summary ? (
                <div className="muted">Run Analyze to fetch consensus.</div>
              ) : (
                <div className="stack">
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{consensusLabel(consensus.summary)}</div>
                  <div>
                    <Pill type="pos">Strong Buy {consensus.summary.strongBuy || 0}</Pill>
                    <Pill type="pos">Buy {consensus.summary.buy || 0}</Pill>
                    <Pill type="mid">Hold {consensus.summary.hold || 0}</Pill>
                    <Pill type="neg">Sell {consensus.summary.sell || 0}</Pill>
                    <Pill type="neg">Strong Sell {consensus.summary.strongSell || 0}</Pill>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {consensus.latest?.period ? `Period: ${consensus.latest.period}` : null} • Data via Finnhub
                  </div>
                </div>
              )}
            </div>

            {/* Top Market News */}
            <div className="panel" style={{ gridColumn: "span 12" }}>
              <div className="card-title">Top Market News — Global</div>
              <div className="newslist">
                {marketNews.map((n) => (
                  <div key={`${n.id || n.datetime}-${n.headline}`} className="news-item">
                    <div className="news-head">
                      <span>{n.source}</span>
                      <span>•</span>
                      <span>{new Date((n.datetime || 0) * 1000).toLocaleString()}</span>
                    </div>
                    <div className="news-title">{n.headline}</div>
                    <a className="news-link" href={n.url} target="_blank" rel="noreferrer">Read ➔</a>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* NEWS */}
        {tab === "news" && (
          <section className="panel">
            <div className="card-title">Company News</div>
            {companyNews.length === 0 ? (
              <div className="muted">Search a symbol, then open News.</div>
            ) : (
              <div className="newslist">
                {companyNews.map((n) => (
                  <div key={`${n.id || n.datetime}-${n.headline}`} className="news-item">
                    <div className="news-head">
                      <span>{n.source}</span>
                      <span>•</span>
                      <span>{new Date((n.datetime || 0) * 1000).toLocaleString()}</span>
                    </div>
                    <div className="news-title">{n.headline}</div>
                    <a className="news-link" href={n.url} target="_blank" rel="noreferrer">Open ➔</a>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* SENTIMENT (consensus again – place for future social sentiment) */}
        {tab === "sentiment" && (
          <section className="panel">
            <div className="card-title">Analyst Consensus</div>
            {!consensus || !consensus.summary ? (
              <div className="muted">Run Analyze to fetch consensus.</div>
            ) : (
              <div className="stack">
                <div style={{ fontSize: 22, fontWeight: 900 }}>{consensusLabel(consensus.summary)}</div>
                <div>
                  <Pill type="pos">Strong Buy {consensus.summary.strongBuy || 0}</Pill>
                  <Pill type="pos">Buy {consensus.summary.buy || 0}</Pill>
                  <Pill type="mid">Hold {consensus.summary.hold || 0}</Pill>
                  <Pill type="neg">Sell {consensus.summary.sell || 0}</Pill>
                  <Pill type="neg">Strong Sell {consensus.summary.strongSell || 0}</Pill>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {consensus.latest?.period ? `Period: ${consensus.latest.period}` : null} • Data via Finnhub
                </div>
              </div>
            )}
          </section>
        )}

        {/* EVENTS placeholder (room for earnings/dividends etc.) */}
        {tab === "events" && (
          <section className="panel">
            <div className="card-title">Events</div>
            <div className="muted">Coming soon: earnings, dividends & economic calendar.</div>
          </section>
        )}

        <footer className="footer">
          CandL — a William Popoola project • © {new Date().getFullYear()}
        </footer>
      </main>

      {/* ABOUT MODAL */}
      {showAbout && (
        <div className="modal-backdrop" onClick={() => setShowAbout(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ fontWeight: 900, fontSize: 18 }}>About CandL</div>
              <button className="close" onClick={() => setShowAbout(false)}>Close</button>
            </div>
            <div className="stack">
              <p><strong>CandL</strong> is a lightweight stock analyser with a premium feel: frosted-glass UI, fast interactions, and clean data presentation.</p>
              <p>Key features include: live quotes, company profile, curated market headlines, and analyst consensus (via serverless API).</p>
              <p>Built by William Popoola. PWA install, dark/light mode, and accessibility baked in.</p>
            </div>
          </div>
        </div>
      )}

      {/* CONTACT MODAL */}
      {showContact && (
        <div className="modal-backdrop" onClick={() => setShowContact(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ fontWeight: 900, fontSize: 18 }}>Contact the Developer</div>
              <button className="close" onClick={() => setShowContact(false)}>Close</button>
            </div>
            <div className="stack">
              <div className="card">
                <div>Email: <a className="news-link" href="mailto:itzarishe@gmail.com">itzarishe@gmail.com</a></div>
                <div>Phone: <a className="news-link" href="tel:+2347071703030">+234 707 170 3030</a></div>
                <div>Instagram: <a className="news-link" target="_blank" rel="noreferrer" href="https://instagram.com/arisheoluwa">@arisheoluwa</a></div>
                <div>X: <a className="news-link" target="_blank" rel="noreferrer" href="https://x.com/arisheoluwa">@arisheoluwa</a></div>
                <div>LinkedIn: <a className="news-link" target="_blank" rel="noreferrer" href="https://www.linkedin.com/in/william-popoola/">/in/william-popoola/</a></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
