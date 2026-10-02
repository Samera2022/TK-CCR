# Model Orchestration System

## Overview

The Model Orchestration system enables dynamic model switching and automatic model selection based on task requirements across CCR, Codex, and DSH.

## Features

### Phase 1: Model Switching ✅
- **Agent-Requested Switching**: Agents can request CCR to switch models
- **Model Discovery**: Query available models from CCR
- **Session Management**: Per-session model preferences

### Phase 2: Budget Control ✅
- **Token Tracking**: Automatic token usage tracking per model
- **Budget Limits**: Configurable budget per model
- **Confirmation Requests**: Ask agent when budget exceeded

### Phase 3: Orchestra Mode ✅
- **Automatic Selection**: CCR selects best model for each task
- **Role-Based**: Define roles with specific models and prompts
- **Task Classification**: Analyze task and select appropriate role

## Architecture

```
┌─────────────────────────────────────────┐
│  Agent (Codex/DSH)                      │
│  • ccr_switch_model tool                │
│  • Orchestra header support             │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  CCR                                    │
│  • Model switching API                  │
│  • Budget tracker                       │
│  • Orchestra engine                     │
└─────────────────────────────────────────┘
```

## API Endpoints

### GET /v1/ccr/models
List all available models.

**Response:**
```json
{
  "models": [
    {
      "id": "anthropic/claude-opus-5",
      "displayName": "Claude Opus 5",
      "provider": "anthropic",
      "contextTokens": 200000,
      "capabilities": ["vision", "tool_calling"]
    }
  ]
}
```

### POST /v1/ccr/switch-model
Switch current session's model.

**Request:**
```json
{
  "model": "openai/gpt-5.6-sol",
  "reason": "Need larger context window"
}
```

**Response:**
```json
{
  "success": true,
  "model": "openai/gpt-5.6-sol",
  "previousModel": "anthropic/claude-opus-5"
}
```

## Configuration

Example `router-config.yaml`:

```yaml
model_switching:
  enabled: true

model_budgets:
  default_budget: 100000
  warning_threshold: 0.8
  models:
    "openai/gpt-5.6-sol":
      budget: 200000
    "anthropic/claude-opus-5":
      budget: 150000

orchestra:
  enabled: false
  default_orchestrator_model: "openai/gpt-5.6-sol"
  roles:
    - name: code_writer
      model: anthropic/claude-opus-5
      system_prompt: "You are an expert code writer..."
      triggers: ["implement", "write", "create"]
      budget: 100000
```

## Integration Status

### CCR ✅
- [x] Phase 1: Model switching API and session binding
- [x] Phase 2: Budget tracking core
- [x] Phase 3: Orchestra engine core
- [ ] Runtime integration (budget checks, LLM calls)
- [ ] Configuration file loading

### Codex ✅
- [x] Phase 1: CCR integration crate
- [ ] Tool executor integration
- [ ] UI components

### DSH ✅
- [x] Phase 1: CCR tools package
- [ ] Tool runtime integration
- [ ] UI components

## Usage Examples

### Agent Switching Models

```typescript
// Agent calls ccr_switch_model tool
{
  name: "ccr_switch_model",
  input: {
    model: "openai/gpt-5.6-sol",
    reason: "Analyzing large codebase"
  }
}
```

### Orchestra Mode

Enable with header:
```
x-ccr-orchestra-enabled: true
```

CCR will:
1. Analyze the task
2. Select appropriate role
3. Apply role's model and system prompt
4. Return response with `x-ccr-active-role` header

## Next Steps

1. Complete runtime integration:
   - Budget checks in request pipeline
   - LLM integration for orchestra classifier
   - Configuration file loading

2. UI Components:
   - Budget indicators
   - Orchestra status display
   - Model switching controls

3. Testing:
   - E2E tests for all phases
   - Performance benchmarks
   - Budget enforcement tests

## Development

TypeScript compilation:
```bash
npm run typecheck
```

Build:
```bash
npm run build
```

## Contributing

See `docs/model-orchestration-design.md` for detailed architecture.
See `docs/model-orchestration-impl-plan.md` for implementation plan.
