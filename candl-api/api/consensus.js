// candl-api/api/consensus.js
// Aggregates Finnhub “recommendation trends” into a compact consensus summary.
//
// POST { "symbol": "AAPL" }
// -> { source, symbol, latest, summary, raw }

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      hint: "POST JSON: { symbol: 'AAPL' }"
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST with JSON { symbol }' });
  }

  const { symbol: rawSym } = parseBody(req);
  const symbol = String(rawSym || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const token = process.env.FINNHUB_KEY;
  if (!token) {
    // Fallback so the UI continues to work if env var is missing
    return res.status(200).json({
      source: "Finnhub (demo)",
      symbol,
      latest: null,
      summary: { buy: 0, hold: 0, sell: 0, strongBuy: 0, strongSell: 0 },
      note: "FINNHUB_KEY not set"
    });
  }

  try {
    const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${token}`;
    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: 'Finnhub error', status: r.status, text });
    }
    const data = await r.json(); // typically newest first

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(200).json({
        source: "Finnhub",
        symbol,
        latest: null,
        summary: { buy: 0, hold: 0, sell: 0, strongBuy: 0, strongSell: 0 },
        note: "No recommendation data"
      });
    }

    // Take the latest record (index 0)
    const latest = data[0] || {};
    const summary = {
      buy: latest.buy ?? 0,
      hold: latest.hold ?? 0,
      sell: latest.sell ?? 0,
      strongBuy: latest.strongBuy ?? 0,
      strongSell: latest.strongSell ?? 0
    };

    res.status(200).json({
      source: "Finnhub",
      symbol,
      latest: {
        period: latest.period, // e.g. "2025-09-30"
        ...summary
      },
      summary,
      raw: data
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error', message: String(err?.message || err) });
  }
}
