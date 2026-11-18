window.__CODEX_FIXTURES = window.__CODEX_FIXTURES || {};
window.__CODEX_FIXTURES["synthetic-review"] = [
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
    },
    {
     "id": "gpt-demo-mini",
     "model": "gpt-demo-mini",
     "displayName": "GPT Demo Mini",
     "hidden": false,
     "isDefault": false,
     "defaultReasoningEffort": "low",
     "supportedReasoningEfforts": [
      {
       "reasoningEffort": "low",
       "description": "low"
      },
      {
       "reasoningEffort": "medium",
       "description": "medium"
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
   "threadId": "thread-synth",
   "turn": {
    "id": "turn-review",
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
  "_recvMs": 360,
  "method": "item/started",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "item": {
    "type": "reasoning",
    "id": "r1",
    "summary": [],
    "content": [],
    "startedAtMs": 1
   }
  }
 },
 {
  "_recvMs": 420,
  "method": "item/reasoning/summaryPartAdded",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "r1",
   "summaryIndex": 0
  }
 },
 {
  "_recvMs": 480,
  "method": "item/reasoning/summaryTextDelta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "r1",
   "summaryIndex": 0,
   "delta": "**Reading the diff**\n\nChecking the changed files against main."
  }
 },
 {
  "_recvMs": 1140,
  "method": "item/completed",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "item": {
    "type": "reasoning",
    "id": "r1",
    "summary": [
     "**Reading the diff**\n\nChecking the changed files against main."
    ],
    "content": [],
    "startedAtMs": 1
   }
  }
 },
 {
  "_recvMs": 1200,
  "method": "item/started",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "item": {
    "type": "agentMessage",
    "id": "a1",
    "text": "",
    "phase": "final_answer"
   }
  }
 },
 {
  "_recvMs": 1260,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "I reviewed the uncommitted changes and t"
  }
 },
 {
  "_recvMs": 1320,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "he 3 commits of `feature/checkout` that "
  }
 },
 {
  "_recvMs": 1380,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "are not in `main`.\n\n**Overview:** two cr"
  }
 },
 {
  "_recvMs": 1440,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "itical problems (a null dereference and "
  }
 },
 {
  "_recvMs": 1500,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "a trusted client amount), two medium one"
  }
 },
 {
  "_recvMs": 1560,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "s and one suggestion.\n\n```codexter-findi"
  }
 },
 {
  "_recvMs": 1620,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "ngs\n{\n \"findings\": [\n  {\n   \"severity\": "
  }
 },
 {
  "_recvMs": 1680,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "\"critical\",\n   \"file\": \"src/main/java/sh"
  }
 },
 {
  "_recvMs": 1740,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "op/OrderService.java\",\n   \"line\": 42,\n  "
  }
 },
 {
  "_recvMs": 1800,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " \"title\": \"Null dereference when a custo"
  }
 },
 {
  "_recvMs": 1860,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "mer has no orders\",\n   \"problem\": \"`repo"
  }
 },
 {
  "_recvMs": 1920,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": ".find(c.id())` returns `null` for a new "
  }
 },
 {
  "_recvMs": 1980,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "customer, and `openOrders` calls `.strea"
  }
 },
 {
  "_recvMs": 2040,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "m()` on it, so the order page fails with"
  }
 },
 {
  "_recvMs": 2100,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " a 500.\",\n   \"fix\": \"Return an empty lis"
  }
 },
 {
  "_recvMs": 2160,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "t when the lookup gives `null`:\\n\\n```ja"
  }
 },
 {
  "_recvMs": 2220,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "va\\nif (all == null) return List.of();\\n"
  }
 },
 {
  "_recvMs": 2280,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "```\"\n  },\n  {\n   \"severity\": \"critical\","
  }
 },
 {
  "_recvMs": 2340,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "\n   \"file\": \"src/main/java/shop/PaymentC"
  }
 },
 {
  "_recvMs": 2400,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "ontroller.java\",\n   \"line\": 77,\n   \"titl"
  }
 },
 {
  "_recvMs": 2460,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "e\": \"Amount taken from the request body\""
  }
 },
 {
  "_recvMs": 2520,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": ",\n   \"problem\": \"The amount to charge co"
  }
 },
 {
  "_recvMs": 2580,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "mes from the client, so a user can pay l"
  }
 },
 {
  "_recvMs": 2640,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "ess than the order total.\",\n   \"fix\": \"L"
  }
 },
 {
  "_recvMs": 2700,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "oad the order on the server and charge `"
  }
 },
 {
  "_recvMs": 2760,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "order.total()`; ignore the amount of the"
  }
 },
 {
  "_recvMs": 2820,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " request.\",\n   \"locations\": [\n    {\n    "
  }
 },
 {
  "_recvMs": 2880,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " \"file\": \"src/main/java/shop/PaymentCont"
  }
 },
 {
  "_recvMs": 2940,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "roller.java\",\n     \"line\": 77\n    },\n   "
  }
 },
 {
  "_recvMs": 3000,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " {\n     \"file\": \"src/main/java/shop/Orde"
  }
 },
 {
  "_recvMs": 3060,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "r.java\",\n     \"line\": 18\n    }\n   ]\n  },"
  }
 },
 {
  "_recvMs": 3120,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "\n  {\n   \"severity\": \"medium\",\n   \"file\":"
  }
 },
 {
  "_recvMs": 3180,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " \"src/main/java/shop/InvoiceExporter.jav"
  }
 },
 {
  "_recvMs": 3240,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "a\",\n   \"line\": 120,\n   \"title\": \"Writer "
  }
 },
 {
  "_recvMs": 3300,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "is not closed on error\",\n   \"problem\": \""
  }
 },
 {
  "_recvMs": 3360,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "The `FileWriter` stays open when `writeR"
  }
 },
 {
  "_recvMs": 3420,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "ows` throws, which keeps the file locked"
  }
 },
 {
  "_recvMs": 3480,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " on Windows.\",\n   \"fix\": \"Use try-with-r"
  }
 },
 {
  "_recvMs": 3540,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "esources around the writer.\"\n  },\n  {\n  "
  }
 },
 {
  "_recvMs": 3600,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " \"severity\": \"medium\",\n   \"file\": \"src/t"
  }
 },
 {
  "_recvMs": 3660,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "est/java/shop/OrderServiceTest.java\",\n  "
  }
 },
 {
  "_recvMs": 3720,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " \"line\": 0,\n   \"title\": \"No test for the"
  }
 },
 {
  "_recvMs": 3780,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " empty case\",\n   \"problem\": \"None of the"
  }
 },
 {
  "_recvMs": 3840,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " tests covers a customer without orders,"
  }
 },
 {
  "_recvMs": 3900,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": " which is how the bug above went unnotic"
  }
 },
 {
  "_recvMs": 3960,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "ed.\",\n   \"fix\": \"Add `openOrdersOfNewCus"
  }
 },
 {
  "_recvMs": 4020,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "tomerIsEmpty()`.\"\n  },\n  {\n   \"severity\""
  }
 },
 {
  "_recvMs": 4080,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": ": \"suggestion\",\n   \"file\": \"src/main/jav"
  }
 },
 {
  "_recvMs": 4140,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "a/shop/OrderService.java\",\n   \"line\": 55"
  }
 },
 {
  "_recvMs": 4200,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": ",\n   \"title\": \"Use a named constant for "
  }
 },
 {
  "_recvMs": 4260,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "the page size\",\n   \"problem\": \"`50` appe"
  }
 },
 {
  "_recvMs": 4320,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "ars three times in this class.\",\n   \"fix"
  }
 },
 {
  "_recvMs": 4380,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "\": \"Introduce `private static final int "
  }
 },
 {
  "_recvMs": 4440,
  "method": "item/agentMessage/delta",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "itemId": "a1",
   "delta": "PAGE_SIZE = 50;`.\"\n  }\n ]\n}\n```\n"
  }
 },
 {
  "_recvMs": 4500,
  "method": "item/completed",
  "params": {
   "threadId": "thread-synth",
   "turnId": "turn-review",
   "item": {
    "type": "agentMessage",
    "id": "a1",
    "text": "I reviewed the uncommitted changes and the 3 commits of `feature/checkout` that are not in `main`.\n\n**Overview:** two critical problems (a null dereference and a trusted client amount), two medium ones and one suggestion.\n\n```codexter-findings\n{\n \"findings\": [\n  {\n   \"severity\": \"critical\",\n   \"file\": \"src/main/java/shop/OrderService.java\",\n   \"line\": 42,\n   \"title\": \"Null dereference when a customer has no orders\",\n   \"problem\": \"`repo.find(c.id())` returns `null` for a new customer, and `openOrders` calls `.stream()` on it, so the order page fails with a 500.\",\n   \"fix\": \"Return an empty list when the lookup gives `null`:\\n\\n```java\\nif (all == null) return List.of();\\n```\"\n  },\n  {\n   \"severity\": \"critical\",\n   \"file\": \"src/main/java/shop/PaymentController.java\",\n   \"line\": 77,\n   \"title\": \"Amount taken from the request body\",\n   \"problem\": \"The amount to charge comes from the client, so a user can pay less than the order total.\",\n   \"fix\": \"Load the order on the server and charge `order.total()`; ignore the amount of the request.\",\n   \"locations\": [\n    {\n     \"file\": \"src/main/java/shop/PaymentController.java\",\n     \"line\": 77\n    },\n    {\n     \"file\": \"src/main/java/shop/Order.java\",\n     \"line\": 18\n    }\n   ]\n  },\n  {\n   \"severity\": \"medium\",\n   \"file\": \"src/main/java/shop/InvoiceExporter.java\",\n   \"line\": 120,\n   \"title\": \"Writer is not closed on error\",\n   \"problem\": \"The `FileWriter` stays open when `writeRows` throws, which keeps the file locked on Windows.\",\n   \"fix\": \"Use try-with-resources around the writer.\"\n  },\n  {\n   \"severity\": \"medium\",\n   \"file\": \"src/test/java/shop/OrderServiceTest.java\",\n   \"line\": 0,\n   \"title\": \"No test for the empty case\",\n   \"problem\": \"None of the tests covers a customer without orders, which is how the bug above went unnoticed.\",\n   \"fix\": \"Add `openOrdersOfNewCustomerIsEmpty()`.\"\n  },\n  {\n   \"severity\": \"suggestion\",\n   \"file\": \"src/main/java/shop/OrderService.java\",\n   \"line\": 55,\n   \"title\": \"Use a named constant for the page size\",\n   \"problem\": \"`50` appears three times in this class.\",\n   \"fix\": \"Introduce `private static final int PAGE_SIZE = 50;`.\"\n  }\n ]\n}\n```\n",
    "phase": "final_answer"
   }
  }
 },
 {
  "_recvMs": 4560,
  "method": "turn/completed",
  "params": {
   "threadId": "thread-synth",
   "turn": {
    "id": "turn-review",
    "items": [],
    "itemsView": "summary",
    "status": "completed",
    "error": null,
    "startedAt": 1,
    "completedAt": 30,
    "durationMs": 29000
   }
  }
 }
];
