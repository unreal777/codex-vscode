window.__CODEX_FIXTURES = window.__CODEX_FIXTURES || {};
window.__CODEX_FIXTURES["synthetic-plan"] = [
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
   "threadId": "thread-plan",
   "turn": {
    "id": "turn-plan",
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
  "_recvMs": 500,
  "method": "item/started",
  "params": {
   "item": {
    "type": "userMessage",
    "id": "u1",
    "clientId": null,
    "content": [
     {
      "type": "text",
      "text": "Plan how to add pagination to the product list.",
      "text_elements": []
     }
    ]
   },
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 800,
  "method": "item/started",
  "params": {
   "item": {
    "type": "reasoning",
    "id": "r1",
    "summary": [],
    "content": []
   },
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 1100,
  "method": "item/reasoning/summaryTextDelta",
  "params": {
   "threadId": "thread-plan",
   "turnId": "turn-plan",
   "itemId": "r1",
   "summaryIndex": 0,
   "delta": "**Looking at the product list**\n\nI check how the list is loaded today."
  }
 },
 {
  "_recvMs": 1400,
  "method": "item/completed",
  "params": {
   "item": {
    "type": "reasoning",
    "id": "r1",
    "summary": [
     "**Looking at the product list**\n\nI check how the list is loaded today."
    ],
    "content": []
   },
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 1600,
  "method": "item/started",
  "params": {
   "item": {
    "type": "commandExecution",
    "id": "c1",
    "command": "rg -n \"ProductList\" src",
    "cwd": "C:\\work\\shop",
    "status": "inProgress",
    "aggregatedOutput": "",
    "exitCode": null,
    "durationMs": null,
    "commandActions": []
   },
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 1900,
  "method": "item/completed",
  "params": {
   "item": {
    "type": "commandExecution",
    "id": "c1",
    "command": "rg -n \"ProductList\" src",
    "cwd": "C:\\work\\shop",
    "status": "completed",
    "aggregatedOutput": "src/main/webapp/js/cart.js:12:ProductList\nsrc/main/java/shop/web/OrderController.java:40:ProductList",
    "exitCode": 0,
    "durationMs": 80,
    "commandActions": []
   },
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 2100,
  "method": "item/started",
  "params": {
   "item": {
    "type": "agentMessage",
    "id": "m1",
    "text": "",
    "phase": "commentary",
    "memoryCitation": null,
    "delivery": null,
    "questions": null
   },
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 2300,
  "method": "item/completed",
  "params": {
   "item": {
    "type": "agentMessage",
    "id": "m1",
    "text": "I found the list in two places, drafting the plan now.",
    "phase": "commentary",
    "memoryCitation": null,
    "delivery": null,
    "questions": null
   },
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 2500,
  "method": "item/started",
  "params": {
   "item": {
    "type": "plan",
    "id": "p1",
    "text": ""
   },
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 2700,
  "method": "item/plan/delta",
  "params": {
   "threadId": "thread-plan",
   "turnId": "turn-plan",
   "itemId": "p1",
   "delta": "1. Add `page` and `size` parameters to `OrderController`.\n"
  }
 },
 {
  "_recvMs": 2900,
  "method": "item/plan/delta",
  "params": {
   "threadId": "thread-plan",
   "turnId": "turn-plan",
   "itemId": "p1",
   "delta": "2. Return a `Page<Product>` from the repository.\n3. Add a pager to `src/main/webapp/js/cart.js`.\n"
  }
 },
 {
  "_recvMs": 3100,
  "method": "item/completed",
  "params": {
   "item": {
    "type": "plan",
    "id": "p1",
    "text": "1. Add `page` and `size` parameters to `OrderController`.\n2. Return a `Page<Product>` from the repository.\n3. Add a pager to `src/main/webapp/js/cart.js`.\n"
   },
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 3300,
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
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 3600,
  "method": "item/completed",
  "params": {
   "item": {
    "type": "agentMessage",
    "id": "a1",
    "text": "Here is the plan. **Nothing was changed.** Tell me when to start with step 1.",
    "phase": "final_answer",
    "memoryCitation": null,
    "delivery": null,
    "questions": null
   },
   "threadId": "thread-plan",
   "turnId": "turn-plan"
  }
 },
 {
  "_recvMs": 3800,
  "method": "turn/completed",
  "params": {
   "threadId": "thread-plan",
   "turn": {
    "id": "turn-plan",
    "items": [],
    "itemsView": "notLoaded",
    "status": "completed",
    "error": null,
    "startedAt": 1,
    "completedAt": 78,
    "durationMs": 77000
   }
  }
 }
];
