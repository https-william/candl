import fetch from 'node-fetch';

const FINNHUB = process.env.FINNHUB_KEY;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}

function getTo() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function getFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function quickTone(q) {
  if (!q || !q.c || !q.pc) return 'neutral';
  const chg = (q.c - q.pc) / q.pc;
  if (chg > 0.01) return 'bullish';
  if (chg < -0.01) return 'bearish';
  return 'neutral';
}
function quickRsiNote(q) {
  if (!q || !q.h || !q.l || !q.c) return 'RSI: n/a';
  const r = (q.c - q.l) / Math.max(1e-9, (q.h - q.l));
  if (r >= 0.8) return 'RSI: hot/overbought zone';
  if (r <= 0.2) return 'RSI: cool/oversold zone';
  return 'RSI: mid-band';
}
function quickRiskNote(q) {
  if (!q || !q.t) return 'Risk: unknown';
  return 'Risk: standard daily volatility';
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, hint: "POST { symbol: 'AAPL' }" });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  if (!FINNHUB) {
    return res.status(500).json({ error: 'FINNHUB_KEY not set in Vercel Environment Variables' });
  }

  try {
    const body = parseBody(req);
    const symbol = String(body.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

    const base = 'https://finnhub.io/api/v1';
    const fetchJSON = async url => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Finnhub ${r.status}`);
      return r.json();
    };

    const [quote, trend, news] = await Promise.all([
      fetchJSON(`${base}/quote?symbol=${symbol}&token=${FINNHUB}`),
      fetchJSON(`${base}/stock/price-target?symbol=${symbol}&token=${FINNHUB}`),
      fetchJSON(`${base}/company-news?symbol=${symbol}&from=${getFrom()}&to=${getTo()}&token=${FINNHUB}`)
    ]);

    const headlines = (news || [])
      .slice(0, 5)
      .map(n => ({ source: n.source, headline: n.headline, datetime: n.datetime, url: n.url }));

    const rsiNote = quickRsiNote(quote);
    const riskNote = quickRiskNote(quote);
    const consensus = {
      tone: quickTone(quote),
      highlights: [
        rsiNote,
        trend?.targetHigh ? `Target High: $${trend.targetHigh}` : null,
        trend?.targetMean ? `Target Mean: $${trend.targetMean}` : null
      ].filter(Boolean)
    };

    return res.status(200).json({
      quote, technical: { rsiNote }, risk: { note: riskNote }, consensus, headlines
    });

  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
