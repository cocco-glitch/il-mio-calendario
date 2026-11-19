# Server locale di dist/ per le verifiche dal vivo con playwright-cli (porta 8791; la 8765 è di neuro_certezza).
# Uso: python3 test/servi.py [porta]
import os, sys, http.server, functools
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'
porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
srv = http.server.ThreadingHTTPServer(('127.0.0.1', porta), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
print('dist su http://127.0.0.1:%d/index.html' % porta, flush=True)
srv.serve_forever()
