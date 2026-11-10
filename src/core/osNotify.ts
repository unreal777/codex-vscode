// Notifications of the operating system (seen over the browser or any other program, unlike VS Code's own, which stay inside its
// window): Windows toast through PowerShell (a click opens the given vscode:// link), macOS osascript, Linux notify-send.
// No VS Code imports (unit tested).
import { spawn } from 'node:child_process';

/** PowerShell's own app id: an unpackaged script may show toasts under it. */
export const POWERSHELL_APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Toast XML: title, text and the link a click opens (protocol activation). */
export function toastXml(title: string, body: string, launch: string): string {
  return '<toast activationType="protocol" launch="' + xmlEscape(launch) + '" duration="short">'
    + '<visual><binding template="ToastGeneric"><text>' + xmlEscape(title) + '</text><text>' + xmlEscape(body) + '</text></binding></visual>'
    + '<audio src="ms-winsoundevent:Notification.Default"/></toast>';
}

/** The PowerShell script; the XML and the app id come in environment variables (no quoting of user text in the script). */
export const TOAST_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
  '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
  '$x.LoadXml($env:CODEXTER_TOAST_XML)',
  '$t = New-Object Windows.UI.Notifications.ToastNotification $x',
  '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:CODEXTER_TOAST_APP).Show($t)',
].join('\n');

/** AppleScript string literal. */
const appleString = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

export interface OsNotifyCommand { exe: string; args: string[]; stdin?: string; env?: NodeJS.ProcessEnv }

/** How to show the notification on this platform; null where there is no way. */
export function osNotifyCommand(platform: string, title: string, body: string, launch: string): OsNotifyCommand | null {
  if (platform === 'win32') {
    return { exe: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], stdin: TOAST_SCRIPT,
      env: { CODEXTER_TOAST_XML: toastXml(title, body, launch), CODEXTER_TOAST_APP: POWERSHELL_APP_ID } };
  }
  if (platform === 'darwin') return { exe: 'osascript', args: ['-e', 'display notification ' + appleString(body) + ' with title ' + appleString(title)] };
  if (platform === 'linux') return { exe: 'notify-send', args: ['--app-name=Codexter', title, body] };
  return null;
}

/** Shows it; resolves with an error text, or null when it worked. Never throws. */
export function osNotify(title: string, body: string, launch: string, platform = process.platform): Promise<string | null> {
  const c = osNotifyCommand(platform, title, body, launch);
  if (!c) return Promise.resolve('no system notifications on ' + platform);
  return new Promise((resolve) => {
    let err = '';
    try {
      const p = spawn(c.exe, c.args, { env: { ...process.env, ...c.env }, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      p.stderr.on('data', (d: Buffer) => { err = (err + d.toString('utf8')).slice(-2000); });
      p.on('error', (e) => resolve(String(e)));
      p.on('close', (code) => resolve(code === 0 ? null : 'exit code ' + code + (err.trim() ? ': ' + err.trim() : '')));
      p.stdin.on('error', () => { /* exited early */ });
      p.stdin.end(c.stdin ?? '');
    } catch (e) {
      resolve(String(e));
    }
  });
}
