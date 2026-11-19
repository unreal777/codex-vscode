// Loaded BEFORE app.js. Maps the page's bridge contract to the VS Code webview API:
//   page -> host : window.__codexPost(jsonString)           -> postMessage
//   host -> page : webview message (array of events)       -> window.codexUi.receive(events)
(function () {
  'use strict';
  const api = acquireVsCodeApi();
  window.__codexPost = (s) => api.postMessage(s);
  window.__codexState = { get: () => api.getState(), set: (o) => api.setState(o) };   // webview state: survives hiding the view
  window.addEventListener('message', (e) => { if (window.codexUi) window.codexUi.receive(e.data); });
})();
