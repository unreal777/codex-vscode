// Proxy settings: VS Code's http.proxy / http.proxyStrictSSL, else HTTPS_PROXY & co. (replaces EclipseProxy.java).
import * as vscode from 'vscode';
import { ProxyConfig, resolveProxy } from './core/http';

/** Used for the managed Codex download (CONNECT tunnelling is done in core/http.ts). */
export function proxyConfig(): ProxyConfig {
  const http = vscode.workspace.getConfiguration('http');
  return resolveProxy(http.get<string>('proxy'), http.get<boolean>('proxyStrictSSL'));
}

/**
 * Environment for the codex process: when the proxy comes from the VS Code setting and the user has not set the variables
 * themselves, pass it on so Codex reaches OpenAI through the same proxy.
 */
export function processProxyEnv(): NodeJS.ProcessEnv {
  const setting = (vscode.workspace.getConfiguration('http').get<string>('proxy') ?? '').trim();
  if (!setting) return {};
  const env: NodeJS.ProcessEnv = {};
  const have = (n: string) => !!(process.env[n] || process.env[n.toLowerCase()]);
  for (const n of ['HTTPS_PROXY', 'HTTP_PROXY']) {
    if (!have(n)) {
      env[n] = setting;
      env[n.toLowerCase()] = setting;
    }
  }
  return env;
}
