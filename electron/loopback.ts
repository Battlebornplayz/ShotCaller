// A one-shot HTTP server on 127.0.0.1 that catches sign-in redirects from the browser.
// It only listens while a sign-in is in progress and answers a single callback.

import http from 'node:http';
import { LOOPBACK_PORTS } from './cloudConfig';

export interface LoopbackWait {
  port: number;
  /** Resolves with the query of the first request to `path`. */
  result: Promise<URLSearchParams>;
  close: () => void;
}

const PAGE = (title: string, text: string) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="background:#0F1023;color:#F2F3FF;font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0">
<div style="background:#1A1C3A;padding:32px 40px;border-radius:12px;max-width:420px;text-align:center">
<div style="font-size:13px;letter-spacing:.08em;color:#4F8CFF;font-weight:700;margin-bottom:10px">SHOTCALLER</div>
<h2 style="margin:0 0 8px">${title}</h2><p style="color:#8F93C9;margin:0">${text}</p></div></body>`;

function listen(server: http.Server, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const onError = () => resolve(false);
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError);
      resolve(true);
    });
  });
}

/** Starts the server on the first free allowed port. `timeoutMs` bounds how long it waits. */
export async function waitForCallback(path: string, timeoutMs: number): Promise<LoopbackWait> {
  let resolveResult!: (q: URLSearchParams) => void;
  let rejectResult!: (e: Error) => void;
  const result = new Promise<URLSearchParams>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });
  // Callers may close before anyone awaits; don't let that surface as an unhandled rejection.
  result.catch(() => undefined);

  let done = false;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (done || url.pathname !== path) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    done = true;
    const failed = url.searchParams.has('error') || url.searchParams.has('error_description');
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      .end(
        failed
          ? PAGE('Sign-in didn’t finish', 'Head back to ShotCaller to try again. You can close this tab.')
          : PAGE('You’re signed in', 'Head back to ShotCaller. You can close this tab.'),
      );
    resolveResult(url.searchParams);
    setTimeout(close, 500);
  });

  let port = 0;
  for (const p of LOOPBACK_PORTS) {
    if (await listen(server, p)) {
      port = p;
      break;
    }
  }
  if (!port) throw new Error('Couldn’t open a sign-in port (47615-47617 are all in use).');

  const timer = setTimeout(() => {
    rejectResult(new Error('Sign-in timed out.'));
    close();
  }, timeoutMs);

  function close(): void {
    clearTimeout(timer);
    if (!done) {
      done = true;
      rejectResult(new Error('cancelled'));
    }
    server.close();
    server.closeAllConnections?.();
  }

  return { port, result, close };
}
