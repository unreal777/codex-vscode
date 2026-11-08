window.__CODEX_FIXTURES = window.__CODEX_FIXTURES || {};
window.__CODEX_FIXTURES["synthetic-links"] = [
 {
  "_recvMs": 0,
  "id": 2,
  "result": {
   "data": [
    {
     "id": "gpt-demo",
     "model": "gpt-demo",
     "displayName": "GPT Demo",
     "hidden": false,
     "isDefault": true,
     "defaultReasoningEffort": "medium",
     "supportedReasoningEfforts": [
      {
       "reasoningEffort": "low",
       "description": "low"
      },
      {
       "reasoningEffort": "medium",
       "description": "medium"
      },
      {
       "reasoningEffort": "high",
       "description": "high"
      }
     ]
    }
   ],
   "nextCursor": null
  }
 },
 {
  "_recvMs": 300,
  "method": "turn/started",
  "params": {
   "threadId": "thread-links",
   "turn": {
    "id": "turn-links",
    "items": [],
    "itemsView": "notLoaded",
    "status": "inProgress",
    "error": null,
    "startedAt": 1,
    "completedAt": null,
    "durationMs": null
   }
  }
 },
 {
  "_recvMs": 350,
  "method": "item/started",
  "params": {
   "item": {
    "type": "userMessage",
    "id": "u1",
    "clientId": null,
    "content": [
     {
      "type": "text",
      "text": "Wo ist der Parser? Verlinke die Dateien.",
      "text_elements": []
     }
    ]
   },
   "threadId": "thread-links",
   "turnId": "turn-links"
  }
 },
 {
  "_recvMs": 650,
  "method": "item/started",
  "params": {
   "item": {
    "type": "agentMessage",
    "id": "a1",
    "text": "",
    "phase": "final_answer",
    "memoryCitation": null,
    "delivery": null,
    "questions": null
   },
   "threadId": "thread-links",
   "turnId": "turn-links"
  }
 },
 {
  "_recvMs": 750,
  "method": "item/completed",
  "params": {
   "item": {
    "type": "agentMessage",
    "id": "a1",
    "text": "Als **Zusammenfassung** (so schreibt Codex die Links wirklich):\n\n- [README.md](/C:/work/shop/README.md:1)\n- [package.json](/C:/work/shop/package.json:1)\n- [Parser.java](/C:/work/shop/src/main/Parser.java:2)\n- [src](/C:/work/shop/src) (Ordner)\n- [My Guide.md](</C:/work/shop/docs/My Guide.md>) (Leerzeichen, spitze Klammern)\n- [My Guide encoded](/C:/work/shop/docs/My%20Guide.md) (Leerzeichen als %20)\n\n### Alle weiteren Formen\n\n| Form | Link |\n|---|---|\n| relative | [rel](src/main/Foo.java) |\n| `:42` | [line](src/main/Foo.java:42) |\n| `:42:7` | [col](src/main/Foo.java:42:7) |\n| `:42-50` | [range](src/main/Foo.java:42-50) |\n| `#L42` | [frag](src/main/Foo.java#L42) |\n| `#L42C7` | [fragcol](src/main/Foo.java#L42C7) |\n| `#L42-L50` | [fragrange](src/main/Foo.java#L42-L50) |\n| `#L10C3-L12C8` | [fragrangecol](src/main/Foo.java#L10C3-L12C8) |\n| file URI + line | [fileuri](file:///C:/work/shop/src/Foo.java:42) |\n| file URI + fragment | [fileurifrag](file:///C:/work/shop/src/Foo.java#L42) |\n| file URI, %20 | [fileuri20](file:///C:/work/my%20dir/Foo.java) |\n| drive, forward slashes | [drivefwd](C:/work/shop/src/Foo.java:42) |\n| drive, backslashes | [drivebs](C:\\work\\shop\\src\\Foo.java:42) |\n| backslashes, spaces, <> | [bsspace](<C:\\work\\shop\\src\\My Dir\\Foo.java:5>) |\n| ./ and ../ | [dot](./src/Foo.java) [dotdot](../other/Bar.java:3) |\n| missing file | [missing](src/main/Missing.java:1) |\n| web link | [web](https://example.com/docs) |\n| anchor | [anchor](#section) |\n| script | [script](javascript:alert(1)) |\n\n### Pfade im Fliesstext\n\nDer Fehler liegt in OrderService.java:120 und in src/main/java/shop/Cart.java, siehe auch C:\\work\\shop\\src\\Util.java:7 und /C:/work/shop/pom.xml.\nNicht verlinkt werden sollen: Foo.java ohne Zeile, die Version 1.2.3, \"e.g. test\", github.com/org/repo.java und https://github.com/openai/codex/blob/main/README.md (normaler Web-Link).\n\nInline-Code: `src/main/Foo.java:42` bleibt klickbar, im Codeblock nicht:\n\n```text\nsrc/main/Foo.java:42 und OrderService.java:120 bleiben Text\n```\n",
    "phase": "final_answer",
    "memoryCitation": null,
    "delivery": null,
    "questions": null
   },
   "threadId": "thread-links",
   "turnId": "turn-links"
  }
 },
 {
  "_recvMs": 800,
  "method": "turn/completed",
  "params": {
   "threadId": "thread-links",
   "turn": {
    "id": "turn-links",
    "items": [],
    "itemsView": "summary",
    "status": "completed",
    "error": null,
    "startedAt": 1,
    "completedAt": 20,
    "durationMs": 4000
   }
  }
 }
];
