# English OS MCP Connector

This document describes the first production-ready MCP endpoint for English OS.

## Endpoint

```text
https://english-os-dashboard.vercel.app/api/mcp
```

## Authentication

The endpoint requires a bearer token.

```http
Authorization: Bearer <ENGLISH_OS_MCP_TOKEN>
```

If `ENGLISH_OS_MCP_TOKEN` is not configured, the route falls back to `ENGLISH_OS_TOKEN`.

Recommended production configuration:

```text
ENGLISH_OS_MCP_TOKEN=<dedicated random token for ChatGPT MCP>
```

Do not expose `ENGLISH_OS_TOKEN` as the external MCP credential if a dedicated token can be used.

## Supported JSON-RPC methods

- `initialize`
- `ping`
- `tools/list`
- `tools/call`
- `resources/list`
- `prompts/list`

## Tools

### english_os_get_learner_context

Read-only. Returns English OS learner context for a learner email.

Required arguments:

```json
{
  "userEmail": "learner@example.com"
}
```

### english_os_get_current_class

Read-only. Returns the current class content and learning state.

Required arguments:

```json
{
  "userEmail": "learner@example.com"
}
```

### english_os_get_class_content

Read-only. Returns class content for a specific unit and local or global class.

Example with local class:

```json
{
  "userEmail": "learner@example.com",
  "unit": 4,
  "localClass": 1
}
```

Example with global class:

```json
{
  "userEmail": "learner@example.com",
  "unit": 4,
  "globalClass": 22
}
```

### passages_run_diagnostic

Read-only. Runs the production Passages vector-store diagnostic for a unit and local class.

```json
{
  "unit": 4,
  "localClass": 1
}
```

### conversation_analyze

Read-only. Analyzes a supplied transcript using the OpenAI SDK and optional English OS context.

```json
{
  "transcript": "Learner: ...\nCoach: ...",
  "focus": "Analyze learning quality and UI risks.",
  "userEmail": "learner@example.com"
}
```

To continue a previous analysis:

```json
{
  "transcript": "Learner: ...\nCoach: ...",
  "focus": "Go deeper into product improvements.",
  "previousResponseId": "resp_..."
}
```

### english_os_approve_current_class_practice

Write action. Requires explicit confirmation.

```json
{
  "userEmail": "learner@example.com",
  "confirm": true
}
```

### english_os_advance_to_next_class

Write action. Requires explicit confirmation.

```json
{
  "userEmail": "learner@example.com",
  "confirm": true
}
```

## Minimal JSON-RPC examples

Initialize:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05"
  }
}
```

List tools:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

Call diagnostic:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "passages_run_diagnostic",
    "arguments": {
      "unit": 4,
      "localClass": 1
    }
  }
}
```

## Security posture

- Read-only tools are safe for diagnostics and analysis.
- Write tools require `confirm=true`.
- The endpoint requires a bearer token.
- Use a dedicated `ENGLISH_OS_MCP_TOKEN` for external clients.
- Keep approval and advancement actions under explicit user confirmation.

## Current limitations

- This is a lightweight JSON-RPC MCP endpoint, not a full OAuth flow.
- Per-user identity is supplied as a tool argument.
- For public marketplace/app distribution, add OAuth and per-user authorization later.
