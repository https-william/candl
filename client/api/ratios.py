import json, os
from http.server import BaseHTTPRequestHandler
from financetoolkit import Toolkit  # pip package: FinanceToolkit

API = os.environ.get("FINNHUB_KEY","")  # or other provider key supported by toolkit

class handler(BaseHTTPRequestHandler):
    def _ok(self, body, code=200):
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Access-Control-Allow-Origin','*'); self.end_headers()
        self.wfile.write(json.dumps(body).encode('utf-8'))

    def do_OPTIONS(self): self._ok({},200)

    def do_POST(self):
        try:
            n = int(self.headers.get('content-length','0'))
            body = json.loads(self.rfile.read(n) or b"{}")
            symbol = (body.get("symbol") or "AAPL").upper()
            tk = Toolkit([symbol], api_key=API)
            fcf = tk.ratios.get_free_cash_flow_yield().iloc[-1][symbol]
            roic = tk.ratios.get_return_on_invested_capital().iloc[-1][symbol]
            pf   = tk.scores.get_piotroski_score().iloc[-1][symbol]
            self._ok({"symbol": symbol, "pfcf": fcf, "roic": roic, "piotroski": int(pf)})
        except Exception as e:
            self._ok({"error": str(e)}, 400)

def do_GET(self):
    self._ok({"ok": True, "hint": "Use POST with JSON. Example: { texts: [] } or { symbol: 'AAPL' }"})
