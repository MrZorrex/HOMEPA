#!/usr/bin/env python3
"""Локальный сервер для разработки.

Многопоточный (браузер тянет ES-модули параллельно) и без кэширования,
чтобы в превью всегда была последняя версия файлов.
"""

import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 404 на /sdk.js — это норма вне площадки Яндекса, не шумим в логе
        if args and '/sdk.js' in str(args[0]):
            return
        super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(ROOT)
    server = ThreadingHTTPServer(('0.0.0.0', port), partial(Handler, directory=ROOT))
    server.daemon_threads = True
    print(f'NOMERON dev server: http://0.0.0.0:{port}')
    server.serve_forever()


if __name__ == '__main__':
    main()
