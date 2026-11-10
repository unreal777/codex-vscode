// 0.7.4: notifications of the operating system (VS Code in the background).
import test from 'node:test';
import assert from 'node:assert/strict';
import { osNotifyCommand, POWERSHELL_APP_ID, TOAST_SCRIPT, toastXml } from '../core/osNotify';

test('toast XML: escaped text, protocol launch link, generic template', () => {
  const x = toastXml('Codexter', '"Fix <a> & b" is done.', 'vscode://codexpanel.codex-panel/open?thread=a&b');
  assert.match(x, /^<toast activationType="protocol" launch="vscode:\/\/codexpanel\.codex-panel\/open\?thread=a&amp;b"/);
  assert.match(x, /<text>&quot;Fix &lt;a&gt; &amp; b&quot; is done\.<\/text>/);
  assert.match(x, /template="ToastGeneric"/);
});

test('commands per platform: the user text goes in environment / arguments, never into the PowerShell script', () => {
  const w = osNotifyCommand('win32', 'Codexter', 'x"; Remove-Item C:\\ -Recurse #', 'vscode://a/open?thread=1');
  assert.ok(w);
  assert.equal(w.exe, 'powershell.exe');
  assert.equal(w.stdin, TOAST_SCRIPT);
  assert.doesNotMatch(TOAST_SCRIPT, /Remove-Item/);
  assert.equal(w.env?.CODEXTER_TOAST_APP, POWERSHELL_APP_ID);
  assert.match(String(w.env?.CODEXTER_TOAST_XML), /Remove-Item/, 'only inside the XML');
  const m = osNotifyCommand('darwin', 'Codexter', 'say "hi" \\ there', '');
  assert.deepEqual(m?.args, ['-e', 'display notification "say \\"hi\\" \\\\ there" with title "Codexter"']);
  assert.deepEqual(osNotifyCommand('linux', 'Codexter', 'done', '')?.args, ['--app-name=Codexter', 'Codexter', 'done']);
  assert.equal(osNotifyCommand('aix', 'a', 'b', ''), null);
});
