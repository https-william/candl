import json, os, re
from http.server import BaseHTTPRequestHandler
from transformers import pipeline

NLP = None
def get_nlp():
    global NLP
    if NLP is None:
        NLP = pipeline("sentiment-analysis")
    return NLP

def clean(t:str)->str:
    t = re.sub(r"http\\S+|www\\.\\S+", "", t)
    t = re.sub(r"[@#]\\S+", "", t)
    return t.strip()

def analyze_texts(texts):
    nlp = get_nlp()
    xs = [clean(t)[:400] for t in texts if isinstance(t,str) and t.strip()]
    if not xs:
        return {"results": [], "summary": {"positive":0,"neutral":0,"negative":0}}
    raw = nlp(xs)
    out = []; pos=neu=neg=0
    for r in raw:
        label = r["label"].upper()
        if "POS" in label: label, pos = "POSITIVE", pos+1
        elif "NEG" in label: label, neg = "NEGATIVE", neg+1
        else: label, neu = "NEUTRAL", neu+1
        out.append({"label": label, "score": float(r["score"])})
    return {"results": out, "summary": {"positive":pos,"neutral":neu,"negative":neg}}

class handler(BaseHTTPRequestHandler):
    def _ok(self, payload, code=200):
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Access-Control-Allow-Origin','*')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def do_OPTIONS(self):
        self._ok({}, 200)

    def do_POST(self):
        try:
            length = int(self.headers.get('content-length','0'))
            body = json.loads(self.rfile.read(length) or b"{}")
            texts = body.get("texts") or []
            self._ok(analyze_texts(texts))
        except Exception as e:
            self._ok({"error": str(e)}, 400)

def do_GET(self):
    self._ok({"ok": True, "hint": "Use POST with JSON. Example: { texts: [] } or { symbol: 'AAPL' }"})
