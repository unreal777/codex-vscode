window.__CODEX_FIXTURES = window.__CODEX_FIXTURES || {};
window.__CODEX_FIXTURES["synthetic-autoreview"] = [
 {
  "_recvMs": 0,
  "method": "turn/started",
  "params": {
   "threadId": "thread-autoreview",
   "turn": {
    "id": "turn-autoreview",
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
  "_recvMs": 50,
  "method": "item/started",
  "params": {
   "item": {
    "type": "userMessage",
    "id": "u1",
    "clientId": null,
    "content": [
     {
      "type": "text",
      "text": "Clean up the build output and the temp files",
      "text_elements": []
     }
    ]
   },
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview"
  }
 },
 {
  "_recvMs": 250,
  "method": "item/started",
  "params": {
   "item": {
    "type": "commandExecution",
    "id": "c1",
    "pluginId": null,
    "scriptPath": null,
    "command": "\"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -Command Remove-Item -Recurse -Force target",
    "cwd": "C:\\work\\shop",
    "processId": null,
    "source": "unifiedExecStartup",
    "status": "inProgress",
    "commandActions": [],
    "aggregatedOutput": null,
    "exitCode": null,
    "durationMs": null
   },
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview"
  }
 },
 {
  "_recvMs": 350,
  "method": "item/autoApprovalReview/started",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-1",
   "targetItemId": "c1",
   "action": {
    "type": "command",
    "source": "shell",
    "command": "\"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -Command Remove-Item -Recurse -Force target",
    "cwd": "C:\\work\\shop"
   },
   "review": {
    "status": "inProgress",
    "riskLevel": null,
    "userAuthorization": null,
    "rationale": null
   }
  }
 },
 {
  "_recvMs": 1250,
  "method": "item/autoApprovalReview/completed",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-1",
   "targetItemId": "c1",
   "action": {
    "type": "command",
    "source": "shell",
    "command": "\"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -Command Remove-Item -Recurse -Force target",
    "cwd": "C:\\work\\shop"
   },
   "completedAtMs": 1793794110206,
   "decisionSource": "agent",
   "review": {
    "status": "approved",
    "riskLevel": "low",
    "userAuthorization": "high",
    "rationale": "Deletes the Maven build output inside the project; the user asked for cleanup."
   }
  }
 },
 {
  "_recvMs": 1650,
  "method": "item/completed",
  "params": {
   "item": {
    "type": "commandExecution",
    "id": "c1",
    "pluginId": null,
    "scriptPath": null,
    "command": "\"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -Command Remove-Item -Recurse -Force target",
    "cwd": "C:\\work\\shop",
    "processId": null,
    "source": "unifiedExecStartup",
    "status": "completed",
    "commandActions": [],
    "aggregatedOutput": "",
    "exitCode": 0,
    "durationMs": 380
   },
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview"
  }
 },
 {
  "_recvMs": 1850,
  "method": "item/started",
  "params": {
   "item": {
    "type": "commandExecution",
    "id": "c2",
    "pluginId": null,
    "scriptPath": null,
    "command": "\"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -Command Remove-Item -Recurse -Force C:\\Users",
    "cwd": "C:\\work\\shop",
    "processId": null,
    "source": "unifiedExecStartup",
    "status": "inProgress",
    "commandActions": [],
    "aggregatedOutput": null,
    "exitCode": null,
    "durationMs": null
   },
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview"
  }
 },
 {
  "_recvMs": 1950,
  "method": "item/autoApprovalReview/started",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-2",
   "targetItemId": "c2",
   "action": {
    "type": "command",
    "source": "shell",
    "command": "\"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -Command Remove-Item -Recurse -Force C:\\Users",
    "cwd": "C:\\work\\shop"
   },
   "review": {
    "status": "inProgress",
    "riskLevel": null,
    "userAuthorization": null,
    "rationale": null
   }
  }
 },
 {
  "_recvMs": 2850,
  "method": "item/autoApprovalReview/completed",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-2",
   "targetItemId": "c2",
   "action": {
    "type": "command",
    "source": "shell",
    "command": "\"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -Command Remove-Item -Recurse -Force C:\\Users",
    "cwd": "C:\\work\\shop"
   },
   "completedAtMs": 1793794110206,
   "decisionSource": "agent",
   "review": {
    "status": "denied",
    "riskLevel": "critical",
    "userAuthorization": "low",
    "rationale": "Would delete data outside the project."
   }
  }
 },
 {
  "_recvMs": 3150,
  "method": "item/completed",
  "params": {
   "item": {
    "type": "commandExecution",
    "id": "c2",
    "pluginId": null,
    "scriptPath": null,
    "command": "\"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -Command Remove-Item -Recurse -Force C:\\Users",
    "cwd": "C:\\work\\shop",
    "processId": null,
    "source": "unifiedExecStartup",
    "status": "declined",
    "commandActions": [],
    "aggregatedOutput": null,
    "exitCode": null,
    "durationMs": null
   },
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview"
  }
 },
 {
  "_recvMs": 3250,
  "method": "item/autoApprovalReview/started",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-3",
   "targetItemId": "f1",
   "action": {
    "type": "applyPatch",
    "cwd": "C:\\work\\shop",
    "files": [
     "C:\\work\\shop\\.gitignore",
     "C:\\work\\shop\\README.md"
    ]
   },
   "review": {
    "status": "inProgress",
    "riskLevel": null,
    "userAuthorization": null,
    "rationale": null
   }
  }
 },
 {
  "_recvMs": 4150,
  "method": "item/autoApprovalReview/completed",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-3",
   "targetItemId": "f1",
   "action": {
    "type": "applyPatch",
    "cwd": "C:\\work\\shop",
    "files": [
     "C:\\work\\shop\\.gitignore",
     "C:\\work\\shop\\README.md"
    ]
   },
   "completedAtMs": 1793794110206,
   "decisionSource": "agent",
   "review": {
    "status": "approved",
    "riskLevel": "low",
    "userAuthorization": "high",
    "rationale": "Edits two files inside the workspace."
   }
  }
 },
 {
  "_recvMs": 4250,
  "method": "item/autoApprovalReview/started",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-4",
   "targetItemId": null,
   "action": {
    "type": "networkAccess",
    "target": "https://example.org:443",
    "host": "example.org",
    "protocol": "https",
    "port": 443
   },
   "review": {
    "status": "inProgress",
    "riskLevel": null,
    "userAuthorization": null,
    "rationale": null
   }
  }
 },
 {
  "_recvMs": 5150,
  "method": "item/autoApprovalReview/completed",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-4",
   "targetItemId": null,
   "action": {
    "type": "networkAccess",
    "target": "https://example.org:443",
    "host": "example.org",
    "protocol": "https",
    "port": 443
   },
   "completedAtMs": 1793794110206,
   "decisionSource": "agent",
   "review": {
    "status": "denied",
    "riskLevel": "medium",
    "userAuthorization": "low",
    "rationale": "The task does not need the network."
   }
  }
 },
 {
  "_recvMs": 5250,
  "method": "item/autoApprovalReview/started",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-5",
   "targetItemId": "m1",
   "action": {
    "type": "mcpToolCall",
    "server": "context7",
    "toolName": "resolve-library-id",
    "connectorId": null,
    "connectorName": null,
    "toolTitle": null
   },
   "review": {
    "status": "inProgress",
    "riskLevel": null,
    "userAuthorization": null,
    "rationale": null
   }
  }
 },
 {
  "_recvMs": 6150,
  "method": "item/autoApprovalReview/completed",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-5",
   "targetItemId": "m1",
   "action": {
    "type": "mcpToolCall",
    "server": "context7",
    "toolName": "resolve-library-id",
    "connectorId": null,
    "connectorName": null,
    "toolTitle": null
   },
   "completedAtMs": 1793794110206,
   "decisionSource": "agent",
   "review": {
    "status": "timedOut",
    "riskLevel": null,
    "userAuthorization": "low",
    "rationale": null
   }
  }
 },
 {
  "_recvMs": 6250,
  "method": "item/autoApprovalReview/started",
  "params": {
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview",
   "startedAtMs": 1793794109306,
   "reviewId": "rev-6",
   "targetItemId": "c3",
   "review": {
    "status": "inProgress",
    "riskLevel": null,
    "userAuthorization": null,
    "rationale": null
   },
   "action": {
    "type": "command",
    "source": "shell",
    "command": "\"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -Command git clean -fdx",
    "cwd": "C:\\work\\shop"
   }
  }
 },
 {
  "_recvMs": 6550,
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
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview"
  }
 },
 {
  "_recvMs": 6650,
  "method": "item/completed",
  "params": {
   "item": {
    "type": "agentMessage",
    "id": "a1",
    "text": "Removed `target/`. The reviewer denied the broader delete and the network request, so I left those alone.",
    "phase": "final_answer",
    "memoryCitation": null,
    "delivery": null,
    "questions": null
   },
   "threadId": "thread-autoreview",
   "turnId": "turn-autoreview"
  }
 },
 {
  "_recvMs": 6700,
  "method": "turn/completed",
  "params": {
   "threadId": "thread-autoreview",
   "turn": {
    "id": "turn-autoreview",
    "items": [],
    "itemsView": "summary",
    "status": "completed",
    "error": null,
    "startedAt": 1,
    "completedAt": 9,
    "durationMs": 8000
   }
  }
 }
];
