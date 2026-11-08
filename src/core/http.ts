// HTTPS GET with optional corporate proxy (CONNECT tunnelling), implemented with node http/https/tls only.
// Redirects are NOT followed here: the caller validates every hop (see installer.ts).
import * as http from 'node:http';
import * as https from 'node:https';
import * as tls from 'node:tls';

export interface ProxyConfig {
  /** http(s)://[user:pass@]host:port, empty = direct */
  url?: string;
  /** false = accept certificates that do not verify (VS Code http.proxyStrictSSL=false) */
  strictSSL?: boolean;
  /** NO_PROXY style list, comma separated host names / suffixes / "*" */
  noProxy?: string;
}

export interface GetOptions {
  accept: string;
  userAgent: string;
  proxy?: ProxyConfig;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
}

/** Proxy from the VS Code setting, else HTTPS_PROXY / https_proxy / HTTP_PROXY / http_proxy / ALL_PROXY. */
export function resolveProxy(settingProxy: string | undefined, strictSSL: boolean | undefined, env: NodeJS.ProcessEnv = process.env): ProxyConfig {
  const fromEnv = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy || '';
  const url = (settingProxy && settingProxy.trim()) || fromEnv.trim();
  return { url: url || undefined, strictSSL: strictSSL !== false, noProxy: env.NO_PROXY || env.no_proxy || '' };
}

export function bypassProxy(host: string, noProxy: string | undefined): boolean {
  if (!noProxy) return false;
  const h = host.toLowerCase();
  for (const raw of noProxy.split(',')) {
    const e = raw.trim().toLowerCase().replace(/:\d+$/, '');
    if (!e) continue;
    if (e === '*') return true;
    const suffix = e.startsWith('*.') ? e.substring(1) : e.startsWith('.') ? e : '.' + e;
    if (h === e.replace(/^\*?\./, '') || h.endsWith(suffix)) return true;
  }
  return false;
}

/** Opens a TLS connection to host:port through an HTTP(S) proxy using CONNECT. */
export function openTunnel(proxyUrl: string, host: string, port: number, strictSSL: boolean, timeoutMs: number): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    let pu: URL;
    try {
      pu = new URL(proxyUrl.includes('://') ? proxyUrl : 'http://' + proxyUrl);
    } catch {
      reject(new Error('invalid proxy URL'));
      return;
    }
    const secureProxy = pu.protocol === 'https:';
    const headers: Record<string, string> = { Host: host + ':' + port };
    if (pu.username) {
      const cred = decodeURIComponent(pu.username) + ':' + decodeURIComponent(pu.password);
      headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(cred, 'utf8').toString('base64');
    }
    const opts = {
      host: pu.hostname,
      port: Number(pu.port) || (secureProxy ? 443 : 80),
      method: 'CONNECT',
      path: host + ':' + port,
      headers,
      timeout: timeoutMs,
    };
    const req = secureProxy ? https.request({ ...opts, rejectUnauthorized: strictSSL }) : http.request(opts);
    req.once('timeout', () => req.destroy(new Error('proxy connect timed out')));
    req.once('error', reject);
    req.once('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error('proxy refused the tunnel: HTTP ' + res.statusCode));
        return;
      }
      const t = tls.connect({ socket, servername: host, rejectUnauthorized: strictSSL });
      t.once('secureConnect', () => resolve(t));
      t.once('error', reject);
    });
    req.end();
  });
}

/** https.Agent that reaches its target through a CONNECT tunnel. */
class TunnelAgent extends https.Agent {
  constructor(private readonly proxyUrl: string, private readonly strictSSL: boolean, private readonly timeoutMs: number) {
    super({ keepAlive: false });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override createConnection(options: any, cb?: any): any {
    openTunnel(this.proxyUrl, options.host || options.hostname, Number(options.port) || 443, this.strictSSL, this.timeoutMs)
      .then((s) => cb(null, s), (e) => cb(e));
    return undefined;
  }
}

/** One GET request; resolves with the response (status and headers known, body not yet read). */
export function httpsGet(url: URL, o: GetOptions): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const connectMs = o.connectTimeoutMs ?? 20000;
    const proxy = o.proxy;
    const useProxy = !!proxy?.url && !bypassProxy(url.hostname, proxy.noProxy);
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { Accept: o.accept, 'User-Agent': o.userAgent },
        agent: useProxy ? new TunnelAgent(proxy!.url!, proxy!.strictSSL !== false, connectMs) : false,
        timeout: connectMs,
        rejectUnauthorized: proxy?.strictSSL !== false,
      },
      (res) => {
        req.setTimeout(o.requestTimeoutMs ?? 60000, () => req.destroy(new Error('request timed out')));
        resolve(res);
      },
    );
    req.once('timeout', () => req.destroy(new Error('connection timed out')));
    req.once('error', reject);
    req.end();
  });
}
