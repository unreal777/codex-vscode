# Starts an isolated VS Code (own user data and extensions folder under %TEMP%) with this extension loaded from source
# and a DevTools port, so tools/cdp-vscode.mjs can drive the Codex view. The user's own VS Code profile is not touched.
param(
	[string]$Workspace = "D:\CodexPanel\codex-panel",
	[int]$Port = 9334,
	[string]$ProfileName = "user-data",
	[switch]$Vsix   # install dist\*.vsix into the isolated profile instead of loading the source folder
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$live = Join-Path $env:TEMP 'codexpanel-vscode-live'
$userData = Join-Path $live $ProfileName
$extDir = Join-Path $live 'extensions'
New-Item -ItemType Directory -Force $userData, $extDir | Out-Null

# Skip the welcome page and workspace trust prompt in the throwaway profile
$settingsDir = Join-Path $userData 'User'
New-Item -ItemType Directory -Force $settingsDir | Out-Null
Set-Content -Encoding utf8 (Join-Path $settingsDir 'settings.json') '{ "workbench.startupEditor": "none", "security.workspace.trust.enabled": false, "update.mode": "none", "extensions.autoUpdate": false, "telemetry.telemetryLevel": "off", "chat.disableAIFeatures": true, "workbench.welcomePage.walkthroughs.openOnInstall": false }'

$code = (Get-Command code -ErrorAction Stop).Source
$codeArgs = @('--new-window', '--user-data-dir', $userData, '--extensions-dir', $extDir, "--remote-debugging-port=$Port")
if ($Vsix) {
	$pkg = Get-ChildItem (Join-Path $root 'dist') -Filter *.vsix | Sort-Object LastWriteTime | Select-Object -Last 1
	& $code --user-data-dir $userData --extensions-dir $extDir --install-extension $pkg.FullName --force
} else {
	$codeArgs += "--extensionDevelopmentPath=$root"
}
$codeArgs += $Workspace
Start-Process -FilePath $code -ArgumentList $codeArgs -WindowStyle Normal
Write-Output "started isolated VS Code on DevTools port $Port with workspace $Workspace"

