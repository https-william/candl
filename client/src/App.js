// src/App.js — CandL
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

/* ================= ENV / API ================= */
const FINNHUB_KEY = process.env.REACT_APP_FINNHUB_KEY;
const API = FINNHUB_KEY ? "https://finnhub.io/api/v1" : "/api/finnhub";
const tk = (p = {}) => (FINNHUB_KEY ? { ...p, token: FINNHUB_KEY } : p);

/* Default board for leaders/tape/heatmap */
const DEFAULT_SET = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","JPM","XOM","UNH","V"
];

/* ================= HELPERS ================= */
const fmtMoney = (n) => (n || n === 0 ? Number(n).toFixed(2) : "—");
const fmtPct = (n) => (n || n === 0 ? `${Number(n).toFixed(2)}%` : "—");
const ymd = (d) => d.toISOString().slice(0, 10);

const read = (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const debounce = (fn, ms = 220) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const timeAgo = (tsSec) => {
  const s = Math.max(1, Math.floor((Date.now() - tsSec * 1000) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
};

const domainFromUrl = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const faviconFor = (url) => {
  const d = domainFromUrl(url);
  return d ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=32` : "";
};
const dedupeNews = (arr = []) => {
  const seen = new Set();
  return arr.filter((n) => {
    const key = (n?.headline || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

async function axGet(url, params, signal) {
  try {
    const r = await axios.get(url, { params, signal });
    return { ok: true, data: r.data, status: r.status };
  } catch (e) {
    const canceled = (axios.isCancel?.(e)) || e?.name === "CanceledError" || e?.code === "ERR_CANCELED";
    if (canceled) return { ok: false, canceled: true };
    return { ok: false, error: e?.response?.data?.error || e?.message || "Request failed" };
  }
}

/* =============== Error Boundary (protects 3rd-party widgets) =============== */
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { hasError:false }; }
  static getDerivedStateFromError(){ return { hasError:true }; }
  componentDidCatch(){ /* no-op */ }
  render(){ return this.state.hasError ? <div style={{padding:16}}>Something went wrong.</div> : this.props.children; }
}

/* =============== TradingView Ticker Tape (stable & resilient) =============== */
function TradingViewTape({ symbols = DEFAULT_SET, themeDark }) {
  const hostRef = useRef(null);

  // Swallow tradingview cross-origin errors in dev overlay
  useEffect(() => {
    const handler = (e) => {
      const src = String(e?.filename || "");
      if (src.includes("tradingview.com")) { e.preventDefault?.(); e.stopImmediatePropagation?.(); return false; }
    };
    window.addEventListener("error", handler, true);
    return () => window.removeEventListener("error", handler, true);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = "";
    const holder = document.createElement("div");
    holder.className = "tradingview-widget-container";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    holder.appendChild(inner);

    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => { /* ignore */ };
    s.innerHTML = JSON.stringify({
      symbols: symbols.map((t) => ({ proName: `NASDAQ:${t}`, title: t })),
      showSymbolLogo: true,
      colorTheme: themeDark ? "dark" : "light",
      isTransparent: true,
      displayMode: "adaptive",
      locale: "en"
    });

    host.appendChild(holder);
    holder.appendChild(s);

    return () => { try { host.innerHTML = ""; } catch {} };
  }, [symbols, themeDark]);

  return <div className="fixed-tape" ref={hostRef} aria-label="Ticker tape" />;
}

/* ============================== MAIN APP ============================== */
function AppInner() {
  /* ---------- theme (strong and reliable) ---------- */
  const prefersDark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const [dark, setDark] = useState(() => read("theme:dark", prefersDark));

  // apply theme on BOTH body and html to fix any stubborn selectors
  useEffect(() => {
    const root = document.documentElement;
    document.body.classList.toggle("theme-dark", dark);
    root.classList.toggle("theme-dark", dark);
    write("theme:dark", dark);
  }, [dark]);

  // sync browser bar color
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0e1217" : "#ffffff");
  }, [dark]);

  /* ---------- state ---------- */
  const [symbol, setSymbol] = useState("");
  const [suggest, setSuggest] = useState({ open:false, idx:-1, items:[] });

  const [quote, setQuote] = useState(null);
  const [ohlc, setOhlc] = useState(null);
  const [profile, setProfile] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [reco, setReco] = useState(null);
  const [newsCards, setNewsCards] = useState([]);
  const newsRows = useMemo(() => dedupeNews(newsCards), [newsCards]);

  const [dividends, setDividends] = useState([]);
  const [earnings, setEarnings] = useState(null);

  const [leaders, setLeaders] = useState({ rows: [], at: null, loading: false });
  const [globalNews, setGlobalNews] = useState([]);

  const [userWatch, setUserWatch] = useState(() => read("watch:list", []));
  const [heat, setHeat] = useState([]);
  const [riskMeter, setRiskMeter] = useState(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [retryBadge, setRetryBadge] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [tab, setTab] = useState("Snapshot");
  const [tipsOpen, setTipsOpen] = useState(() => read("tips:open", false));

  const [openModal, setOpenModal] = useState(null); // 'legal' | 'about' | 'contact'
  const [modalTab, setModalTab] = useState("Terms");

  const searchRef = useRef(null);

  /* ---------- toasts ---------- */
  const [toasts, setToasts] = useState([]);
  const toast = (t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((q) => [...q, { id, ...t }]);
    setTimeout(() => setToasts((q) => q.filter((x) => x.id !== id)), t.ms || 2200);
  };

  /* ---------- watchlist ops ---------- */
  const addWatch = (sym) => setUserWatch((prev) => {
    if (prev.includes(sym)) return prev;
    const next = [...prev, sym]; write("watch:list", next);
    toast({ title:"Added to watchlist", message:sym, type:"success", confetti:true });
    return next;
  });
  const removeWatch = (sym) => setUserWatch((prev) => {
    const next = prev.filter((s) => s !== sym); write("watch:list", next);
    toast({ title:"Removed", message:sym, type:"info" });
    return next;
  });

  /* ---------- suggest ---------- */
  const doSuggest = useMemo(() => debounce(async (q) => {
    const t = q.trim(); if (!t) { setSuggest({open:false, idx:-1, items:[]}); return; }
    const r = await axGet(`${API}/search`, tk({ q: t }));
    const items = Array.isArray(r.data?.result) ? r.data.result
      .filter(i => i?.symbol && (
        i.type==='Common Stock' || i.type==='ETF' || i.type==='ETP' || i.type==='ADR' || i.type==='Preferred Stock' || i.type==='Index'
      ))
      .slice(0, 8)
      .map(i => ({ symbol:i.symbol, desc:i.description, type:i.type })) : [];
    setSuggest({ open:true, idx:-1, items });
  }, 160), []);
  const onSearchChange = (v) => { setSymbol(v); doSuggest(v); };
  const onKeyDown = (e) => {
    if (!suggest.open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSuggest((s) => ({ ...s, idx: Math.min(s.idx + 1, s.items.length - 1) })); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSuggest((s) => ({ ...s, idx: Math.max(s.idx - 1, 0) })); }
    else if (e.key === "Enter" && suggest.idx >= 0) {
      const t = suggest.items[suggest.idx]?.symbol; if (!t) return;
      e.preventDefault(); setSymbol(t); setSuggest((s) => ({ ...s, open: false })); write("last:symbol", t); fetchAll(t);
    } else if (e.key === "Escape") setSuggest((s) => ({ ...s, open: false }));
  };

  /* ---------- fetchers ---------- */
  async function fetchQuote(tkr, signal) {
    const r = await axGet(`${API}/quote`, tk({ symbol: tkr }), signal);
    if (!r.ok) return null;
    const d = r.data || {};
    return { symbol: tkr, price: d.c, changeAbs: d.d, changePct: d.dp, high: d.h, low: d.l, open: d.o, prevClose: d.pc };
  }
  async function fetchCandles(tkr, signal, days=120){
    const to = Math.floor(Date.now()/1000), from = to - days*24*3600;
    const r = await axGet(`${API}/stock/candle`, tk({ symbol:tkr, resolution:'D', from, to }), signal);
    return (r.ok && r.data?.s==='ok') ? r.data : null;
  }
  async function fetchProfile(tkr,s){ const r = await axGet(`${API}/stock/profile2`, tk({symbol:tkr}), s); return r.ok ? (r.data||null) : null; }
  async function fetchMetrics(tkr,s){
    const r = await axGet(`${API}/stock/metric`, tk({symbol:tkr, metric:'all'}), s);
    if (!r.ok) return null;
    const m = r.data?.metric || {};
    return { high52: m['52WeekHigh'] ?? null, low52: m['52WeekLow'] ?? null, ytd: (typeof m['yearToDatePriceReturnDaily'] === 'number') ? m['yearToDatePriceReturnDaily']*100 : null };
  }
  async function fetchRecommendation(tkr,s){
    const r = await axGet(`${API}/stock/recommendation`, tk({symbol:tkr}), s);
    if (!r.ok || !Array.isArray(r.data) || !r.data.length) return null;
    return r.data[0];
  }
  async function fetchCompanyNews(tkr,s){
    const to = new Date(); const from = new Date(to.getTime()-14*24*3600*1000);
    const r = await axGet(`${API}/company-news`, tk({ symbol:tkr, from: ymd(from), to: ymd(to) }), s);
    if (!r.ok || !Array.isArray(r.data)) return [];
    return r.data.filter(n=>n.headline && n.datetime && n.url).sort((a,b)=>b.datetime-a.datetime).slice(0,10);
  }
  async function fetchGeneralNews(s){ const r = await axGet(`${API}/news`, tk({ category:'general' }), s); return (r.ok && Array.isArray(r.data)) ? r.data.slice(0,10) : []; }
  async function fetchDividends(tkr,s){ const r = await axGet(`${API}/stock/dividend`, tk({symbol:tkr}), s); return (r.ok && Array.isArray(r.data)) ? r.data.slice(0,6) : []; }
  async function fetchEarnings(tkr,s){ const r = await axGet(`${API}/calendar/earnings`, tk({symbol:tkr}), s); return r.ok ? (r.data||null) : null; }

  /* ---------- orchestration ---------- */
  const ctrl = useRef(null); const reset = () => { if (ctrl.current) ctrl.current.abort(); ctrl.current = new AbortController(); return ctrl.current.signal; };
  const [lastAnalyzed, setLastAnalyzed] = useState(() => read("last:symbol", null));
  const backoff = useRef(0);

  async function fetchAll(raw) {
    const tkr = (raw||"").trim().toUpperCase();
    if (!tkr) { setErr("Enter a symbol to continue."); return; }
    setBusy(true); setErr(null); const signal = reset();

    try {
      const [q,c,p,m,r,news,divs,earn] = await Promise.all([
        fetchQuote(tkr, signal),
        fetchCandles(tkr, signal),
        fetchProfile(tkr, signal),
        fetchMetrics(tkr, signal),
        fetchRecommendation(tkr, signal),
        fetchCompanyNews(tkr, signal),
        fetchDividends(tkr, signal),
        fetchEarnings(tkr, signal)
      ]);

      setQuote(q); setOhlc(c); setProfile(p); setMetrics(m); setReco(r); setNewsCards(news); setDividends(divs||[]); setEarnings(earn||null);

      if (c?.c?.length) {
        const ret = []; for (let i=1;i<c.c.length;i++){ const prev=c.c[i-1]; const cur=c.c[i]; if (prev) ret.push((cur-prev)/prev); }
        const mean = ret.reduce((a,b)=>a+b,0)/Math.max(1,ret.length);
        const varc = ret.reduce((a,b)=>a+(b-mean)*(b-mean),0)/Math.max(1,ret.length);
        setRiskMeter(Number((Math.sqrt(varc)*100).toFixed(2)));
      } else setRiskMeter(null);

      const lu = new Date(); setLastUpdated(lu);
      write(`stk:${tkr}`, { q, c, p, m, r, news, divs, earn, risk: riskMeter, lastUpdated: lu });
      write("last:symbol", tkr); setLastAnalyzed(tkr);
      document.title = `${tkr} $${fmtMoney(q?.price)} · CandL Stock Analyser`;

      backoff.current = 0; setRetryBadge(null);
    } catch(e) {
      if (e?.canceled) return;
      backoff.current = Math.min(4, (backoff.current||0)+1);
      const wait = 800*Math.pow(2, backoff.current); setRetryBadge({ in: Math.round(wait/1000) });
      setTimeout(()=> lastAnalyzed && fetchAll(lastAnalyzed), wait);
    } finally { setBusy(false); setSuggest(s=>({...s, open:false})); }
  }

  function clearCurrentData(){
    setQuote(null); setProfile(null); setMetrics(null); setRiskMeter(null);
    setOhlc(null); setReco(null); setNewsCards([]); setDividends([]); setEarnings(null);
    setLastUpdated(null);
    const last = (lastAnalyzed||"").trim().toUpperCase(); if (last) localStorage.removeItem(`stk:${last}`);
    toast({ title:"Snapshot cleared", type:"success" });
  }

  /* ---------- auto refresh ---------- */
  useEffect(() => {
    const id = setInterval(() => { if (lastAnalyzed && !busy) fetchAll(lastAnalyzed); }, 30000);
    return () => clearInterval(id);
  }, [lastAnalyzed, busy]);

  /* ---------- global news + boards ---------- */
  useEffect(() => { let alive = true; (async ()=>{ const n = await fetchGeneralNews(); alive && setGlobalNews(n); })(); const id=setInterval(async()=>{ const n=await fetchGeneralNews(); setGlobalNews(n); }, 10*60*1000); return ()=>clearInterval(id); }, []);
  async function computeLeaders(){
    setLeaders(l=>({...l, loading:true}));
    try{
      const calls = await Promise.allSettled(DEFAULT_SET.map(s=>axGet(`${API}/quote`, tk({symbol:s}))));
      const rows = DEFAULT_SET.map((s,i)=>{ const r=calls[i]?.value; const dp=(r?.ok && typeof r.data?.dp === "number")? r.data.dp : 0; return {symbol:s, day:dp}; }).sort((a,b)=>b.day-a.day);
      setLeaders({ rows, at:new Date(), loading:false });
    }catch{ setLeaders(l=>({...l, loading:false})); }
  }
  async function computeHeat(){
    const base = (userWatch.length ? userWatch : DEFAULT_SET).slice(0,20);
    const calls = await Promise.allSettled(base.map(s=>axGet(`${API}/quote`, tk({symbol:s}))));
    const rows = base.map((s,i)=>{ const r=calls[i]?.value; const dp=(r?.ok && typeof r.data?.dp === "number")? r.data.dp : 0; return {symbol:s, dp}; });
    setHeat(rows);
  }
  useEffect(()=>{ computeHeat(); }, [userWatch]);

  /* ---------- deep link (no default) ---------- */
  useEffect(() => {
    const q = new URL(window.location.href).searchParams.get("s");
    if (q) { setSymbol(q.toUpperCase()); write("last:symbol", q.toUpperCase()); fetchAll(q.toUpperCase()); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- accessibility & modal scroll lock ---------- */
  useEffect(() => {
    const el = document.documentElement;
    if (openModal) { const prev = el.style.overflow; el.style.overflow = "hidden"; return () => { el.style.overflow = prev; }; }
  }, [openModal]);

  /* ---------- renders ---------- */
  const headerHue = quote?.changePct == null ? 210 : (quote.changePct >= 0 ? 150 : 5);
  const lastUpdatedText = lastUpdated ? lastUpdated.toLocaleTimeString() : null;

  return (
    <div className="app-container">
      {/* ===== Header (fixed, full-width) ===== */}
      <div className="fixed-header" role="banner">
        <div className="header-inner">
          <h1 className="logo-text">CandL Stock Analyser</h1>
          <div className="header-actions">
            <button className="tip-bulb" onClick={()=> setTipsOpen(v=>!v)} aria-label="Toggle tips" title="Quick Tips">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 21h6v-1H9v1Zm3-18a7 7 0 0 1 4.54 12.29c-.3.26-.54.61-.68 1L15.6 18H8.4l-.26-1.71c-.06-.39-.27-.75-.58-1A7 7 0 0 1 12 3Z"/></svg>
              <span>Tips</span>
            </button>
            <button className="theme-toggle" onClick={()=>setDark(d=>!d)} aria-label="Toggle theme" title="Toggle theme">
              {dark ? (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.5" fill="currentColor"/>
                  <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none">
                    <line x1="12" y1="2.5" x2="12" y2="5.2"/><line x1="12" y1="18.8" x2="12" y2="21.5"/>
                    <line x1="2.5" y1="12" x2="5.2" y2="12"/><line x1="18.8" y1="12" x2="21.5" y2="12"/>
                    <line x1="4.2" y1="4.2" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.8" y2="19.8"/>
                    <line x1="4.2" y1="19.8" x2="6.2" y2="17.8"/><line x1="17.8" y1="6.2" x2="19.8" y2="4.2"/>
                  </g>
                </svg>
              )}
            </button>
            <button className="header-link" onClick={()=>setOpenModal("about")}>About</button>
            <button className="button button--primary contact-cta" onClick={()=>setOpenModal("contact")}>Contact developer</button>
          </div>
        </div>
        <div className="header-hue" style={{ "--hdr-hue": headerHue }} />
      </div>

      {/* ===== TradingView tape (fixed, full-width) ===== */}
      <TradingViewTape key={dark ? "tv-dark" : "tv-light"} symbols={DEFAULT_SET} themeDark={dark} />

      {/* ===== Body under fixed bars ===== */}
      <div className="page-under-fixed">
        {tipsOpen && (
          <div className="dashboard-card" aria-live="polite">
            <h2 className="main-title">Quick Tips</h2>
            <ul className="description" style={{ columns:2, gap:20, marginTop:8 }}>
              <li>Press <b>/</b> to focus search • <b>Ctrl/⌘+R</b> refreshes boards.</li>
              <li>Tabs: <b>Snapshot</b>, <b>News</b>, <b>Events</b>.</li>
              <li>“+” adds to Watchlist; “×” removes on heatmap.</li>
              <li>Header hue tracks price direction.</li>
            </ul>
          </div>
        )}

        {/* Main card */}
        <div className="dashboard-card main-card">
          <h2 className="main-title">Market Intelligence</h2>
          <p className="subtitle">Live snapshot, curated headlines, dividends & earnings.</p>

          {/* Search */}
          <div className="input-group" style={{ position:"relative" }}>
            <input
              ref={searchRef}
              className="input-field mono"
              placeholder="Search by symbol or name (e.g., Apple, AAPL)"
              value={symbol}
              onChange={(e)=>onSearchChange(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Ticker"
            />
            <div style={{ display:"flex", gap:8 }}>
              <button className="button" onClick={()=>{ const t=symbol.trim().toUpperCase(); if(!t) return; write("last:symbol",t); fetchAll(t); }}>Analyze</button>
              <button className="button button--ghost" onClick={clearCurrentData}>Clear Snapshot</button>
            </div>

            {suggest.open && suggest.items.length>0 && (
              <div className="suggest-pop" role="listbox">
                {suggest.items.map((it,i)=>(
                  <button key={it.symbol}
                    role="option" aria-selected={i===suggest.idx}
                    className={`suggest-item ${i===suggest.idx?'is-active':''}`}
                    onMouseEnter={()=>setSuggest(s=>({...s, idx:i}))}
                    onClick={()=>{ setSymbol(it.symbol); setSuggest(s=>({...s, open:false})); write("last:symbol", it.symbol); fetchAll(it.symbol); }}
                  >
                    <span className="mono">{it.symbol}</span>
                    <span className="muted">· {it.type}</span>
                    <div className="suggest-desc">{it.desc}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="seg-tabs seg-tabs--prominent" role="tablist" aria-label="View">
            {["Snapshot","News","Events"].map(name=>(
              <button key={name} role="tab" aria-selected={tab===name}
                className={`seg seg--lg ${tab===name?'is-active':''}`} onClick={()=>setTab(name)}>{name}</button>
            ))}
          </div>

          {/* Retry badge */}
          {retryBadge ? <div className="queue-badge">syncing… <span className="mono">{retryBadge.in}s</span></div> : null}

          {/* Content */}
          {tab==="Snapshot" && (
            <>
              {!quote && busy ? <SkeletonSnapshot/> : quote ? (
                <>
                  <div className="hero-strip" aria-live="polite">
                    <div className="hero-symbol mono">{profile?.ticker || quote.symbol}</div>
                    <div className="hero-price mono">${fmtMoney(quote.price)} <span className={`caret ${quote.changePct>=0?'up':'down'}`}>▴</span></div>
                    <div className={`hero-change ${quote.changePct>=0?'pos':'neg'} mono`}>{fmtPct(quote.changePct)}</div>
                    <div className="updated" title="Last updated"><span className="dot-pulse" /> Updated {lastUpdatedText || "—"}</div>
                  </div>

                  <div className="market-grid">
                    <div className="data-card" tabIndex="0">
                      <span className="card-label">Company</span>
                      <span className="card-value">{profile?.name || quote.symbol}</span>
                      <p className="description">{[profile?.exchange, profile?.currency, profile?.country].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <div className="data-card" tabIndex="0">
                      <span className="card-label">52W High / Low</span>
                      <span className="card-value">{metrics?.high52!=null?fmtMoney(metrics.high52):"—"} / {metrics?.low52!=null?fmtMoney(metrics.low52):"—"}</span>
                    </div>
                    <div className="data-card" tabIndex="0">
                      <span className="card-label">YTD Return</span>
                      <span className={`${metrics?.ytd>=0?'change-value positive':'change-value negative'}`}>{metrics?.ytd!=null?fmtPct(metrics.ytd):"—"}</span>
                    </div>
                    <div className="data-card" tabIndex="0">
                      <span className="card-label">Risk Meter</span>
                      <span className="card-value">{riskMeter!=null?`${riskMeter}%`:"—"}</span>
                      <p className="description">Volatility (daily stdev).</p>
                    </div>
                  </div>

                  <div className="card-section">
                    <h3 className="section-header">Dividends & Earnings</h3>
                    <div className="market-grid">
                      <div className="data-card" tabIndex="0">
                        <span className="card-label">Dividends (recent)</span>
                        <span className="card-value">{dividends.length ? `${dividends[0]?.amount ?? "—"} ${profile?.currency || ""}` : "—"}</span>
                        <p className="description">{dividends[0]?.payDate ? `Paid: ${dividends[0].payDate}` : "—"}</p>
                      </div>
                      <div className="data-card" tabIndex="0">
                        <span className="card-label">Next Earnings</span>
                        <span className="card-value">{earnings?.earningsCalendar?.[0]?.date || "—"}</span>
                        <p className="description">{earnings?.earningsCalendar?.[0]?.hour || ""}</p>
                      </div>
                      <div className="data-card" tabIndex="0">
                        <span className="card-label">Analyst Rec (latest)</span>
                        <span className="card-value">{reco ? (reco.strongBuy+reco.buy)+" Buy / "+(reco.sell+reco.strongSell)+" Sell" : "—"}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : <p className="placeholder-text">Search a symbol above to begin your analysis.</p>}
            </>
          )}

          {tab==="News" && (
            <div className="card-section">
              <h3 className="section-header">Company News</h3>
              {!newsRows.length && busy ? <SkeletonNews/> : null}
              {newsRows.length ? (
                <ul className="news-list">
                  {newsRows.map((n,idx)=>{
                    const fav=faviconFor(n.url); const src=n.source || domainFromUrl(n.url) || "News";
                    return (
                      <li key={n.id || n.datetime+n.url} className="news-item">
                        <a href={n.url} onClick={(e)=>{e.preventDefault(); window.open(n.url,"_blank","noopener,noreferrer");}}
                           className="news-headline-link">{idx+1}. {n.headline}</a>
                        <div className="news-meta-row">
                          <span className="news-chip">{fav ? <img className="news-src-logo" src={fav} alt=""/> : <span className="news-src-logo"/>}<span>{src}</span></span>
                          <span className="news-time-pill">{timeAgo(n.datetime)}</span>
                          <span className="news-actions">
                            <button className="icon-btn" onClick={(e)=>{e.preventDefault(); window.open(n.url,"_blank","noopener,noreferrer");}}>Open</button>
                            <button className="icon-btn" onClick={async(e)=>{e.preventDefault(); try{await navigator.clipboard.writeText(n.url); toast({title:"Link copied", type:"success"});}catch{toast({title:"Copy failed", type:"error"});} }}>Copy</button>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (!busy ? <div className="empty-state"><div className="empty-illustration">📰</div><div>No recent headlines</div></div> : null)}
            </div>
          )}

          {tab==="Events" && (
            <div className="card-section">
              <h3 className="section-header">Events</h3>
              <div className="empty-state"><div className="empty-illustration">📅</div><div>Upcoming corporate events will appear here.</div></div>
            </div>
          )}

          <div className="provenance muted"><span className="micro-logo" /> Data via Finnhub</div>
        </div>

        {/* Global news */}
        <div className="dashboard-card">
          <h2 className="main-title">Top Market News — Global</h2>
          <p className="subtitle">Ten stories · curated.</p>
          <div className="news-grid-5x2">
            {globalNews.map(n=>(
              <a key={n.id || n.datetime || n.url} href={n.url} className="news-card" target="_blank" rel="noopener noreferrer">
                {n.image ? <img src={n.image} alt="" className="news-img" loading="lazy" /> : <div className="news-img placeholder"></div>}
                <div className="news-meta"><span className="news-source">{n.source || "News"}</span></div>
                <div className="news-headline">{n.headline}</div>
                {n.summary ? <div className="news-summary">{n.summary}</div> : null}
              </a>
            ))}
          </div>
        </div>

        {/* Leaders (compact) */}
        <div className="dashboard-card">
          <h2 className="main-title">Top Stocks (Daily)</h2>
          <div className="toolbar">
            <span className="description">Last updated {leaders.at ? new Date(leaders.at).toLocaleTimeString() : "—"}</span>
            <button className="button button--ghost" onClick={computeLeaders} disabled={leaders.loading}>{leaders.loading ? "Refreshing…" : "Refresh Board"}</button>
          </div>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Symbol</th><th>Δ% (Today)</th></tr></thead>
              <tbody>
                {(leaders.rows.length ? leaders.rows : DEFAULT_SET.map(s=>({symbol:s,day:0}))).map(r=>(
                  <tr key={r.symbol}>
                    <td className="mono">
                      <button className="linklike" onClick={()=>{ setSymbol(r.symbol); write("last:symbol", r.symbol); fetchAll(r.symbol); }}>{r.symbol}</button>
                      <button className="icon-chip" onClick={()=>addWatch(r.symbol)} title="Add to watchlist" aria-label={`Add ${r.symbol} to watchlist`}>+</button>
                    </td>
                    <td className={r.day>=0?"pos":"neg"}>{fmtPct(r.day)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Heatmap */}
        <div className="dashboard-card">
          <h2 className="main-title">Heatmap — {userWatch.length ? "Your Watchlist" : "Default Board"}</h2>
          <div className="heat-grid">
            {heat.map(h=>(
              <button key={h.symbol} className="heat-cell"
                onClick={()=>{ setSymbol(h.symbol); write("last:symbol", h.symbol); fetchAll(h.symbol); }}
                style={{ background: h.dp>=0 ? "linear-gradient(180deg, rgba(23,155,107,0.20), rgba(23,155,107,0.10))" : "linear-gradient(180deg, rgba(217,48,37,0.20), rgba(217,48,37,0.10))" }}>
                {userWatch.includes(h.symbol) && <button className="heat-remove" onClick={(e)=>{ e.stopPropagation(); removeWatch(h.symbol); }} title="Remove" aria-label={`Remove ${h.symbol} from watchlist`}>×</button>}
                <div className="mono" style={{ fontWeight:600 }}>{h.symbol}</div>
                <div className={h.dp>=0?"pos":"neg"} style={{ fontSize:14 }}>{fmtPct(h.dp)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* FOOTER full-width wrapper */}
        <div className="footer-outer">
          <footer className="site-footer">
            <div className="footer-left">
              <span className="mono" style={{ fontWeight:700 }}>CandL</span>
              <span>— a William Popoola Project</span>
              <span className="w-badge" title="Stylized W" aria-hidden="true">W</span>
            </div>
            <div className="footer-actions">
              <button className="button button--ghost" onClick={()=>{ setOpenModal("legal"); setModalTab("Terms"); }}>Terms, Disclaimer & Regulatory</button>
              <button className="button button--ghost" onClick={()=>setOpenModal("about")}>About</button>
              <button className="button" onClick={()=>setOpenModal("contact")}>Contact Us</button>
            </div>
          </footer>
        </div>

        {/* Modals — fullscreen blur and top z-index */}
        {openModal==='legal' && (
          <Modal title="Legal" pills={["Terms","Disclaimer","Regulatory"]} active={modalTab} onPill={setModalTab} onClose={()=>setOpenModal(null)}>
            {modalTab==="Terms" && (<>
              <p><b>Use of Service.</b> Personal, non-commercial info only.</p>
              <p><b>No Advice.</b> Info only; not investment, tax, or legal advice.</p>
              <p><b>Data Sources.</b> Market data & news from external providers and may be delayed.</p>
              <p><b>Liability.</b> We’re not liable for losses from using this website.</p>
            </>)}
            {modalTab==="Disclaimer" && (<>
              <p>Nothing here is financial advice. Past performance isn’t indicative of future results.</p>
              <p>Content is provided “as-is.” You accept full responsibility for your actions.</p>
            </>)}
            {modalTab==="Regulatory" && (<>
              <p>This is an educational tool. Not a broker, dealer, or registered adviser.</p>
              <ul style={{marginLeft:16}}>
                <li>Data may not meet real-time dissemination standards.</li>
                <li>Corporate actions & symbol changes may lag.</li>
              </ul>
            </>)}
          </Modal>
        )}
        {openModal==='about' && (
          <Modal title="About CandL" onClose={()=>setOpenModal(null)}>
            <p><b>CandL</b> is a fast, friendly way to check a stock’s heartbeat—price, context, and momentum—without the noise.</p>
            <p>We blend a clean UI with thoughtful defaults: a live snapshot, curated headlines, daily movers, and an at-a-glance risk meter. Everything is designed to be readable instantly—on desktop or your phone.</p>
            <p>Under the hood, CandL fetches data on demand, caches briefly to respect free-tier limits, and backs off automatically when providers get busy. You focus on the symbol; we handle the plumbing.</p>
            <p>Built by <b>William Popoola</b> with a focus on speed, accessibility (keyboard & screen-reader friendly), and calm design. If you have ideas, we’d love to hear from you.</p>
          </Modal>
        )}
        {openModal==='contact' && (
          <Modal title="Contact the Developer" onClose={()=>setOpenModal(null)}>
            <div className="icon-row">
              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 13q.425 0 .713-.288T13 12t-.288-.712T12 11t-.712.288T11 12t .288.713T12 13Zm0 8q-3.775 0-6.388-2.613T3 12t2.612-6.388T12 3t6.388 2.612T21 12t-2.613 6.387T12 21Zm0-2q2.9 0 4.95-2.05T19 12q0-2.9-2.05-4.95T12 5Q9.1 5 7.05 7.05T5 12q0 2.9 2.05 4.95T12 19Z"/></svg>
              <div><a href="mailto:itzarishe@gmail.com">itzarishe@gmail.com</a></div>

              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79a15.464 15.464 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.4 21 3 13.6 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.24 1.01l-2.2 2.2z"/></svg>
              <div><a href="tel:+2347071703030">+234 707 170 3030</a></div>

              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zm8.5 7.1c.01 4.08-2.91 6.99-6.99 6.99a6.95 6.95 0 01-3.76-1.1 4.9 4.9 0 003.6-1.01 2.45 2.45 0 01-2.29-1.7c.37.07.75.05 1.12-.06a2.44 2.44 0 01-1.96-2.39v-.03c.33.18.7.27 1.08.28A2.45 2.45 0 016.9 7.3a6.94 6.94 0 005.04 2.55A2.45 2.45 0 0112 8.6a2.45 2.45 0 014.23-1.67c.66-.13 1.28-.37 1.84-.7a2.46 2.46 0 01-1.08 1.35c.58-.07 1.14-.22 1.65-.44a5.24 5.24 0 01-1.3 1.35z"/></svg>
              <div><a href="https://instagram.com/arisheoluwa" target="_blank" rel="noreferrer">@arisheoluwa</a></div>

              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.46 6c-.77.35-1.6.58-2.46.69a4.18 4.18 0 001.84-2.3 8.3 8.3 0 01-2.63 1 4.15 4.15 0 00-7.07 3.78A11.79 11.79 0 013 5.15a4.13 4.13 0 001.28 5.53 4.13 4.13 0 01-1.88-.52v.05a4.16 4.16 0 003.33 4.07 4.2 4.2 0 01-1.87.07 4.16 4.16 0 003.88 2.89A8.33 8.33 0 012 19.54 11.77 11.77 0 008.29 21c7.55 0 11.69-6.24 11.69-11.65 0-.18 0-.35-.01-.53A8.18 8.18 0 0022.46 6z"/></svg>
              <div><a href="https://x.com/arisheoluwa" target="_blank" rel="noreferrer">@arisheoluwa</a></div>

              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 3A2 2 0 0121 5v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14M8 11H6v7h2v-7m5 0h-2v7h2v-7m5 0h-2v7h2v-7M8 6a1 1 0 100 2h8a1 1 0 100-2H8z"/></svg>
              <div><a href="https://www.linkedin.com/in/william-popoola/" target="_blank" rel="noreferrer">linkedin.com/in/william-popoola/</a></div>
            </div>
          </Modal>
        )}

        {/* Toasts */}
        <div className="toast-wrap" aria-live="polite">
          {toasts.map(t=>(
            <div key={t.id} className={`toast ${t.type}`}>
              <div className="toast-title">{t.title}</div>
              {t.message ? <div className="toast-msg">{t.message}</div> : null}
              {t.confetti ? <div className="confetti">✨</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------- Modal + Skeletons (fullscreen blur; high z-index) --------- */
function Modal({ title, pills, active, onPill, onClose, children }) {
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        zIndex: 1000,                   // above header/tape
        background: "rgba(0,0,0,.38)",
        backdropFilter: "blur(8px)"
      }}
      aria-modal="true" role="dialog" aria-label={title}
    >
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          {Array.isArray(pills) && pills.length ? (
            <div className="pill-tabs" role="tablist" aria-label="Sections">
              {pills.map(id=>(
                <button key={id} role="tab" aria-selected={active===id}
                        className={`pill ${active===id?'is-active':''}`} onClick={()=>onPill?.(id)}>{id}</button>
              ))}
            </div>
          ) : null}
          <button className="linklike" onClick={onClose} autoFocus>Close</button>
        </div>
        <div className="modal-body" style={{ display:"grid", gap:10 }}>{children}</div>
      </div>
    </div>
  );
}

function SkeletonBar({ w='100%', h=16 }){ return <div className="skel" style={{ width:w, height:h }} />; }
function SkeletonSnapshot(){
  return (<div className="skel-block"><SkeletonBar w="40%" h={24}/><div className="skel-row"><SkeletonBar w="24%"/><SkeletonBar w="24%"/><SkeletonBar w="24%"/><SkeletonBar w="24%"/></div></div>);
}
function SkeletonNews(){ return (<div className="skel-news">{Array.from({length:5}).map((_,i)=><SkeletonBar key={i} w="100%" h={18}/>)}</div>); }

/* Wrap in ErrorBoundary */
export default function App(){
  return (<ErrorBoundary><AppInner/></ErrorBoundary>);
}
