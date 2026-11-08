# Codex in VS Code

Ein Chat-Panel für den OpenAI-Codex-Agenten direkt in VS Code, dasselbe Panel wie im Eclipse-Plugin.
Du brauchst nur **VS Code 1.90 oder neuer** unter Windows. Kein Node.js, kein npm, kein `codex login`:
Die Erweiterung lädt Codex selbst herunter und lässt dich anmelden.

## Installation

1. Die Datei `codex-panel-0.4.0.vsix` besorgen.
2. In VS Code die Erweiterungen öffnen, oben rechts im Menü **...** auf **Aus VSIX installieren...** (Install from VSIX...) klicken und die Datei wählen.
   (Oder im Terminal: `code --install-extension codex-panel-0.4.0.vsix`.) Ein Update geht genauso.
3. Panel öffnen mit **Strg+Alt+C**. Es liegt in der **sekundären Seitenleiste** rechts, neben anderen Chats wie Copilot
   (VS Code 1.106 oder neuer; ältere Versionen zeigen stattdessen ein **Codex**-Symbol in der Aktivitätsleiste). Du kannst die Ansicht auch woandershin ziehen.
4. Auf **Sign in with ChatGPT** klicken. Beim ersten Start lädt die Erweiterung auch Codex herunter (ca. 170 MB).
5. Erscheint **One-time Windows sandbox setup**, auf **Set up** klicken (Windows fragt einmal nach Admin-Rechten).

## Gut zu wissen

- **Updates laufen automatisch.** Etwa einmal pro Woche prüft die Erweiterung die offizielle npm-Registry auf eine neue
  Codex-Version und installiert sie im Hintergrund. Sie wird bei **New chat** oder nach dem Neuladen des Fensters
  aktiv, nie mitten in einer Antwort. Befehlspalette > **Codexter: Check for Codex updates** prüft sofort.
  Intervall oder eine eigene Codex-Installation stellst du unter Einstellungen > Codexter ein.
- **Dateilinks sind klickbar.** Ein Link in der Antwort öffnet die Datei an der richtigen Zeile. Links auf Ordner markieren den Ordner im Explorer.
- **Der Verlauf findet alte Chats.** Der Uhr-Knopf zeigt die Chats aller Projekte, der Projektname steht vorn.
  Einfach tippen, um zu suchen, oder in der Liste ein Projekt wählen; die Auswahl bleibt bis zum Schließen des Fensters erhalten.
  Mit der Maus über einem Chat (oder per Pfeiltasten gewählt) erscheinen **Archivieren** und **Löschen**. Löschen fragt in der Zeile noch einmal nach,
  weil es nicht rückgängig zu machen ist (die Entf-Taste macht dasselbe). **Show archived** zeigt archivierte Chats mit **Wiederherstellen** und **Löschen**.
- **Einstellungen (Zahnrad im Panel):** *Default model* und *Default reasoning effort*, mit denen ein neuer Chat startet, und welche *Models*
  in der Modellliste unter dem Eingabefeld erscheinen (mindestens eines bleibt). *More settings…* öffnet die VS-Code-Einstellungen der Erweiterung.
- **Dateien zum Chat hinzufügen.** **@** in der Nachricht tippen und eine Datei wählen, oder den **+**-Knopf > *Files and folders* nutzen.
  Oder Dateien, Ordner oder Editor-Tabs aus VS Code auf **Attach files** ziehen, den kleinen Bereich unter dem Chat (VS Code lässt Ziehen aus dem
  eigenen Explorer oder von Tabs nicht bis in den Chat selbst). Dateien aus dem Windows-Explorer kannst du direkt auf den Chat ziehen.
  Oder einen Dateipfad ins Eingabefeld einfügen: Rechtsklick auf Tab oder Datei > *Copy Path* (Umschalt+Alt+C), im Windows-Explorer *Als Pfad kopieren*.
  Sie erscheinen als Chips über dem Eingabefeld.
  Passiert beim Ablegen nichts, bitte Ansicht > Ausgabe > **Codexter** öffnen: Jedes Ablegen schreibt die mitgelieferten Formate (`[drop] ...`-Zeilen); schick sie uns.
- **Add to Codexter chat:** Dateien oder Ordner im Explorer (auch mehrere), im Editor oder auf einem Editor-Tab mit Rechtsklick >
  **Add to Codexter chat**. Das hilft, falls Ziehen bei dir nicht klappt.
- **Ein Chat gehört zu einem Ordner.** Wechselst du zu einer Datei aus einem anderen Workspace-Ordner, bietet ein Hinweis **New chat there** an.
- **Kontextmenü im Editor:** Code markieren > Rechtsklick > **Codexter: Ask / Explain / Fix selection**.
- **Berechtigungen (eine Liste unter dem Eingabefeld).** *Ask for approval* (Codex fragt, bevor es Dateien außerhalb des Projekts ändert oder das
  Internet nutzt), *Approve for me* (Codex fragt nur bei Aktionen, die es für potenziell unsicher hält), *Full access* (keine Sandbox, keine Fragen;
  in Warnfarbe) oder *Custom (config.toml)* (das Panel sendet nichts, Codex nimmt deine `config.toml`). Alte Einstellungen werden umgestellt:
  Full access bleibt, alles andere wird *Ask for approval*, und Auto + Auto-review wird *Approve for me*.
- **Der +-Knopf** daneben: *Files and folders* anhängen, ein *Goal* setzen, das Codex weiterverfolgt (ein Banner über dem Eingabefeld zeigt den Fortschritt),
  den *Plan mode* einschalten (Codex schlägt dann einen Plan vor, statt Dateien zu ändern), eine *Sketch* zeichnen, die als Bild gesendet wird, oder eines
  deiner installierten *Plugins* wählen. Bilder lassen sich auch mit Strg+V einfügen.
- **Lange Antworten lesen sich von oben nach unten.** Deine Nachricht ist ein breiter Block, die Antwort nutzt die volle Breite. Ist Codex fertig, klappen seine
  Schritte (Nachdenken, Befehle, Dateien lesen) zu einer Zeile **Worked for 1m 17s** zusammen; ein Klick zeigt sie. Geänderte Dateien und Rückfragen bleiben sichtbar.
- **`AGENTS.md`** im Repository liest Codex automatisch (nur in neuen Chats).
- Codex liegt einmal pro Windows-Benutzer in `%LOCALAPPDATA%\CodexPanel` (ca. 500 MB). Das Eclipse-Plugin nutzt denselben Ordner,
  ein von einem der beiden geladenes Codex gilt also für beide.
- Firmen-Proxy: Der Download nutzt die VS-Code-Einstellung `http.proxy` (oder `HTTPS_PROXY`), und Codex bekommt sie ebenfalls.
- Protokoll: Ansicht > Ausgabe > **Codexter**.

## Probleme

| Problem | Lösung |
|---|---|
| Download von Codex schlägt fehl | `http.proxy` in den Einstellungen prüfen (`https://registry.npmjs.org` muss erreichbar sein). Oder Codex selbst installieren, unter Codexter > Codex Source „own“ wählen und den Pfad zu `codex.exe` eintragen. |
| Abgelegte Datei bewirkt nichts | Auf **Attach files** unter dem Chat ziehen, den Pfad einfügen, oder **Add to Codexter chat** / `@` benutzen. |
| Anmeldung wird nicht fertig | Auf Cancel klicken und neu anmelden. Port 1455 auf localhost muss frei sein. |
| Panel ist leer | **Developer: Reload Window** ausführen; den Ausgabekanal **Codexter** ansehen. |
| Sonstiges | Die letzten Zeilen des Ausgabekanals **Codexter** schicken. |
