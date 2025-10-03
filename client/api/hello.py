from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):
    def _ok(self, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._ok({"ok": True, "runtime": "python3.11", "message": "Python API alive"})
