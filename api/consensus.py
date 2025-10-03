import os, json, time, math, requests
from http.server import BaseHTTPRequestHandler

API = "https://finnhub.io/api/v1"
KEY = os.environ.get("FINNHUB_KEY","")

CACHE = {}  # {key: (expires_at, data)}

def cache_get(k):
    v = CACHE.get(k)
    if not v: return None
    exp, data = v
    return data if exp > time.time() else None

def cache_set(k, data, ttl):
    CACHE[k] = (time.time()+ttl, data)

def fh(path, params):
    params = {**params, "token": KEY}
    r = requests.get(f"{API}/{path}", params=params, timeout=12)
    r.raise_for_status()
    return r.json()

def get_quote(sym):
    k=f"q:{sym}"
    c=cache_get(k)
    if c: return c
    d=fh("quote", {"symbol": sym})
    cache_set(k,d, 15)
    return d

def get_candles(sym, res="D", cnt=120):
    k=f"c:{sym}:{res}"
    c=cache_get(k)
    if c: return c
    now=int(time.time()); frm=now-400*24*3600
    d=fh("stock/candle", {"symbol":sym, "resolution":res, "from":frm, "to":now})
    cache_set(k,d, 600)
    return d

def get_news(sym):
    k=f"n:{sym}"
    c=cache_get(k)
    if c: return c
    d=fh("company-news", {"symbol": sym, "from": time.strftime("%Y-%m-%d", time.gmtime(time.time()-7*86400)),
                          "to": time.strftime("%Y-%m-%d", time.gmtime())})
    cache_set(k,d, 600)
    return d[:30]

def rsi(values, period=14):
    # values = list of closes
    gains=[]; losses=[]
    for i in range(1, len(values)):
        diff = values[i]-values[i-1]
        gains.append(max(0,diff)); losses.append(max(0,-diff))
    def ema(xs, p):
        k=2/(p+1); v=xs[0]
        for x in xs[1:]: v = x*k + v*(1-k)
        return v
    if len(gains)<period: return None
    avg_gain = ema(gains[-period:], period); avg_loss = ema(losses[-period:], period)
    if avg_loss == 0: return 100.0
    rs = avg_gain/avg_loss
    return 100 - (100/(1+rs))

def technical_agent(candles):
    closes = candles.get("c") or []
    if len(closes) < 20: return {"note":"Not enough data", "flags":[]}
    _rsi = rsi(closes)
    flags=[]
    if _rsi is not None:
        if _rsi >= 70: flags.append("RSI overbought")
        elif _rsi <= 30: flags.append("RSI oversold")
    # 20/50 SMA cross
    sma20 = sum(closes[-20:])/20
    sma50 = sum(closes[-50:])/50 if len(closes)>=50 else None
    if sma50:
        if sma20 > sma50: flags.append("20>50 (bullish tilt)")
        else: flags.append("20<50 (bearish tilt)")
    note = ", ".join(flags) if flags else "Neutral"
    return {"note": note, "rsi": _rsi}

def risk_agent(quote):
    chg = (quote.get("c",0) - quote.get("pc",0))
    pct = (chg/quote.get("pc",1))*100 if quote.get("pc") else 0
    risk=[]
    if abs(pct) > 4: risk.append("High intraday move")
    if quote.get("h",0)-quote.get("l",0) > quote.get("c",0)*0.06:
        risk.append("Wide day range")
    return {"note": ", ".join(risk) or "Normal", "pct_change": pct}

def synthesize(symbol, sentiment, tech, risk):
    score = 0
    s = sentiment["summary"]
    score += (s["positive"] - s["negative"])
    if tech.get("rsi") is not None:
        if tech["rsi"] < 35: score += 1
        if tech["rsi"] > 65: score -= 1
    if "High intraday move" in risk["note"]: score -= 1
    tone = "Slightly Positive" if score>0 else "Neutral" if score==0 else "Cautious"
    return {
        "symbol": symbol,
        "tone": tone,
        "highlights": [tech["note"], risk["note"]],
    }

class handler(BaseHTTPRequestHandler):
    def _ok(self, body, code=200):
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Access-Control-Allow-Origin','*'); self.end_headers()
        self.wfile.write(json.dumps(body).encode('utf-8'))

    def do_OPTIONS(self): self._ok({}, 200)

    def do_POST(self):
        try:
            ln = int(self.headers.get('content-length','0'))
            body = json.loads(self.rfile.read(ln) or b"{}")
            sym = (body.get("symbol") or "").upper().strip()
            texts = body.get("texts") or []

            quote = get_quote(sym)
            candles = get_candles(sym)
            news = get_news(sym)

            # call local sentiment API (opt: direct import to avoid another HTTP call)
            import urllib.request
            req = urllib.request.Request(
                url=os.environ.get("SENT_URL","http://localhost"),
                method="POST",
                data=json.dumps({"texts": [n.get("headline","") for n in news][:25] or texts}).encode("utf-8"),
                headers={"Content-Type":"application/json"}
            )
            # If SENT_URL not set (like on Vercel), call self path
            try:
                # On Vercel, we can import our own function by HTTP: /api/sentiment
                req.full_url = "http://127.0.0.1/api/sentiment"
                resp = urllib.request.urlopen(req, timeout=10)
                sentiment = json.loads(resp.read().decode("utf-8"))
            except:
                sentiment = {"summary":{"positive":0,"neutral":0,"negative":0}}

            tech = technical_agent(candles)
            risk = risk_agent(quote)
            out = {
                "quote": quote,
                "technical": tech,
                "risk": risk,
                "consensus": synthesize(sym, sentiment, tech, risk),
                "headlines": news[:5]
            }
            self._ok(out)
        except Exception as e:
            self._ok({"error": str(e)}, 400)

def do_GET(self):
    self._ok({"ok": True, "hint": "Use POST with JSON. Example: { texts: [] } or { symbol: 'AAPL' }"})
