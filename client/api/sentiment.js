import { SentimentIntensityAnalyzer as Vader } from 'vader-sentiment';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  // Vercel Node functions pass req.body (object on some setups, string on others)
  if (req.body == null) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, hint: "POST { texts: ['one','two'] }" });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const body = parseBody(req);
    const list = Array.isArray(body.texts) ? body.texts : [];

    if (!list.length) {
      return res.status(400).json({ error: "Provide JSON: { texts: ['Great quarter', 'Worried about margins'] }" });
    }

    let pos = 0, neu = 0, neg = 0;
    const results = list.map(t => {
      const s = Vader.polarity_scores(String(t));
      if (s.compound >= 0.05) pos++;
      else if (s.compound <= -0.05) neg++;
      else neu++;
      return { text: t, scores: s };
    });

    const total = Math.max(1, pos + neu + neg);
    const summary = {
      positive: pos,
      neutral: neu,
      negative: neg,
      positive_pct: +(pos / total).toFixed(3),
      neutral_pct: +(neu / total).toFixed(3),
      negative_pct: +(neg / total).toFixed(3)
    };

    return res.status(200).json({ results, summary });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
