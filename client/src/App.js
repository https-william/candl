import React, { useEffect, useMemo, useRef, useState } from "react";

// ------------------------------
// helpers
// ------------------------------
const read = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const fmtUSD = (n) =>
  typeof n === "number"
    ? n.toLocaleString(undefined, { style: "currency", currency: "USD" })
    : "—";

const FinnKey = process.env.REACT_APP_FINNHUB_KEY || "";

// ------------------------------
// TradingView Ticker Tape (remounts on theme toggle)
// ------------------------------
const TradingViewTape = ({ dark }) => {
  const ref = useRef(null);

  useEffect(() => {
    // Clean container
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
      isTransparent: true,
      displayMode: "adaptive",
      locale: "en"
    });
    ref.current.appendChild(s);

    return () => {
      // best-effort cleanup
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [dark]);

  return (
    <div className="fixed-tape">
      <div
        className="tradingview-widget-container"
        style={{ width: "100%", minHeight: "28px" }}
      >
        <div className="tradingview-widget-container__widget" ref={ref} />
      </div>
    </div>
  );
};

// ------------------------------
// Modals (About / Contact / Tips)
// ------------------------------
const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <>
      <div className="modal-dim" onClick={onClose} />
      <div className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="button button--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>
  );
};

// ------------------------------
// App
// ------------------------------
export default function App() {
  // theme
  const [dark, setDark] = useState(() => read("ui:dark", true));
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    write("ui:dark", dark);
  }, [dark]);

  // modals
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(() => read("tips:open", false)); // <— default closed
  useEffect(() => write("tips:open", tipsOpen), [tipsOpen]);

  // search + data
  const [q, setQ] = useState("");
  const [activeTab, setActiveTab] = useState("snapshot"); // snapshot | news | events
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [profile, setProfile] = useState(null);
  const [news, setNews] = useState([]);

  // Allowed tickers list (to avoid 403 on free plan)
  const ALLOW = useMemo(
    () => ["AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "GOOGL", "AVGO"],
    []
  );

  const analyze = async () => {
    const sym = (q || "").toUpperCase().trim();
    if (!sym || !ALLOW.includes(sym)) {
      alert(
        "Please enter a supported symbol (e.g., AAPL, MSFT, NVDA, AMZN, META, TSLA, GOOGL, AVGO)."
      );
      return;
    }
    setLoading(true);
    try {
      // Price snapshot
      const [qRes, pRes] = await Promise.all([
        fetch(
          `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FinnKey}`
        ).then((r) => r.json()),
        fetch(
          `https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FinnKey}`
        ).then((r) => r.json())
      ]);
      setQuote(qRes || null);
      setProfile(pRes || null);

      // News (last 7 days, dedup by headline)
      const to = new Date();
      const from = new Date(Date.now() - 7 * 864e5);
      const pad = (n) => String(n).padStart(2, "0");
      const iso = (d) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const nRes = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${iso(
          from
        )}&to=${iso(to)}&token=${FinnKey}`
      ).then((r) => r.json());
      const seen = new Set();
      const rows = (nRes || []).filter((n) => {
        const h = (n.headline || "").trim();
        if (!h || seen.has(h)) return false;
        seen.add(h);
        return true;
      });
      setNews(rows.slice(0, 12));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setQuote(null);
    setProfile(null);
    setNews([]);
    setQ("");
  };

  // derived
  const change = quote ? quote.c - quote.pc : 0;
  const pct = quote && quote.pc ? (change / quote.pc) * 100 : 0;

  // ---------------- render
  return (
    <>
      {/* Fixed header */}
      <header className="fixed-header">
        <div className="header-inner">
          <div className="logo-text">CandL Stock Analyser</div>

          <div className="header-actions">
            <button
              className="button button--ghost"
              aria-label="Toggle theme"
              onClick={() => setDark((d) => !d)}
              title="Toggle theme"
            >
              {/* simple sun/moon */}
              {dark ? "🌙" : "☀️"}
            </button>

            <button
              className="button tip-bulb"
              onClick={() => setTipsOpen(true)}
              aria-label="Show tips"
              title="Quick tips"
            >
              💡 <span>Tips</span>
            </button>

            <button
              className="button header-link"
              onClick={() => setAboutOpen(true)}
            >
              About
            </button>

            <button
              className="button button--primary contact-cta"
              onClick={() => setContactOpen(true)}
            >
              Contact developer
            </button>
          </div>
        </div>
      </header>

      {/* TradingView tape (remount on theme) */}
      <TradingViewTape dark={dark} />

      {/* Body under fixed bars */}
      <main className="page-under-fixed">
        {/* Hero / Search */}
        <section className="panel panel--glass">
          <h1 className="display">Market Intelligence</h1>
          <p className="subtitle">
            Live snapshot, curated headlines, dividends &amp; earnings.
          </p>

          <div className="input-group">
            <input
              className="input-field"
              placeholder="Search by symbol or name (e.g., AAPL)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="actions-row">
            <button
              className="button button--primary"
              onClick={analyze}
              disabled={loading}
            >
              {loading ? "Analyzing…" : "Analyze"}
            </button>
            <button className="button" onClick={clearAll}>
              Clear Snapshot
            </button>
          </div>

          <div className="seg-tabs seg-tabs--prominent">
            {["snapshot", "news", "events"].map((id) => (
              <button
                key={id}
                className={`seg seg--lg ${
                  activeTab === id ? "is-active" : ""
                }`}
                onClick={() => setActiveTab(id)}
              >
                {id === "snapshot" ? "Snapshot" : id === "news" ? "News" : "Events"}
              </button>
            ))}
          </div>

          {/* Snapshot */}
          {activeTab === "snapshot" && (
            <>
              {!quote && (
                <p className="muted">
                  Search a symbol above to begin your analysis.
                </p>
              )}
              {quote && (
                <div className="market-grid">
                  <div className="card">
                    <div className="label">Company</div>
                    <div className="value">
                      {profile?.name || profile?.ticker || "—"}
                    </div>
                    <div className="muted small">
                      {(profile?.exchange || "").toUpperCase()} ·{" "}
                      {(profile?.currency || "USD").toUpperCase()}
                    </div>
                  </div>

                  <div className="card">
                    <div className="label">Price</div>
                    <div className="value mono">
                      {fmtUSD(quote.c)}{" "}
                      <span className={change >= 0 ? "up" : "down"}>
                        {change >= 0 ? "▲" : "▼"} {pct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="muted small">
                      Prev close {fmtUSD(quote.pc)}
                    </div>
                  </div>

                  <div className="card">
                    <div className="label">Day High / Low</div>
                    <div className="value mono">
                      {fmtUSD(quote.h)} / {fmtUSD(quote.l)}
                    </div>
                    <div className="muted small">Today</div>
                  </div>

                  <div className="card">
                    <div className="label">Open</div>
                    <div className="value mono">{fmtUSD(quote.o)}</div>
                    <div className="muted small">Today</div>
                  </div>
                </div>
              )}
              <div className="muted small" style={{ marginTop: 10 }}>
                <span className="dot" /> Data via Finnhub
              </div>
            </>
          )}

          {/* News */}
          {activeTab === "news" && (
            <>
              {!news?.length ? (
                <p className="muted">No recent headlines yet.</p>
              ) : (
                <div className="news-grid-5x2">
                  {news.map((n) => (
                    <a
                      key={n.id || n.url}
                      className="news-card"
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="news-source">
                        {n.source || "Source"} ·{" "}
                        {new Date((n.datetime || 0) * 1000).toLocaleString()}
                      </div>
                      <div className="news-title">{n.headline}</div>
                      <div className="news-snippet">{n.summary}</div>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Events (placeholder) */}
          {activeTab === "events" && (
            <div className="empty-state">
              <div className="emoji">📅</div>
              <div className="title">Events coming soon</div>
              <div className="muted">
                Earnings and dividends will appear here.
              </div>
            </div>
          )}
        </section>

        {/* Global news (sample section) */}
        <section className="section">
          <h2>Top Market News — Global</h2>
          <p className="muted">Ten stories · curated.</p>
          {/* If you have your global feed, render it here */}
        </section>
      </main>

      {/* Footer */}
      <footer className="footer-outer">
        <div className="site-footer">
          <div className="muted small">
            CandL — a William Popoola project · © {new Date().getFullYear()}
          </div>
          <div className="footer-actions">
            <button className="button" onClick={() => setAboutOpen(true)}>
              About
            </button>
            <button className="button" onClick={() => setContactOpen(true)}>
              Contact
            </button>
            <a
              className="button"
              href="https://finnhub.io/"
              target="_blank"
              rel="noreferrer"
            >
              Data via Finnhub
            </a>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title="About CandL">
        <p>
          <strong>CandL</strong> is a lightweight stock analyser focused on speed,
          clarity and great defaults. Search a ticker to see a live snapshot,
          price context, and curated headlines. Your API key is stored on the
          server and never exposed in public builds.
        </p>
        <p className="muted">
          Tip: add <code>?s=AAPL</code> to the URL to deep-link a symbol.
        </p>
      </Modal>

      <Modal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title="Contact the Developer"
      >
        <ul className="contact-list">
          <li>
            📧{" "}
            <a href="mailto:itzarishe@gmail.com">itzarishe@gmail.com</a>
          </li>
          <li>
            📞 <a href="tel:+2347071703030">+234 707 170 3030</a>
          </li>
          <li>
            📷 <a href="https://instagram.com/arisheoluwa">Instagram @arisheoluwa</a>
          </li>
          <li>
            𝕏 <a href="https://x.com/arisheoluwa">X @arisheoluwa</a>
          </li>
          <li>
            💼{" "}
            <a
              href="https://www.linkedin.com/in/william-popoola/"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn — William Popoola
            </a>
          </li>
        </ul>
      </Modal>

      <Modal open={tipsOpen} onClose={() => setTipsOpen(false)} title="Quick Tips">
        <ul className="tips-list">
          <li>Type a ticker (e.g., AAPL) and tap Analyze.</li>
          <li>Use the tabs to switch between Snapshot / News / Events.</li>
          <li>Toggle the theme with the ☀️/🌙 in the header.</li>
          <li>
            Add <code>?s=AAPL</code> to the URL to open a ticker directly.
          </li>
        </ul>
      </Modal>
    </>
  );
}
