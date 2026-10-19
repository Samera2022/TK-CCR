/**
 * Session Reasoning Binding Manager
 *
 * Tracks the reasoning/thinking effort selected for a session, using the same
 * `client:sessionId` key convention as the model binding manager so an agent
 * that can already switch models can switch thinking effort the same way.
 */

import type { ReasoningEffortLevel } from "@ccr/core/models/reasoning-config";

export interface SessionReasoningBinding {
  effort: ReasoningEffortLevel;
  sessionKey: string;
  timestamp: Date;
}

export class SessionReasoningBindingManager {
  private bindings = new Map<string, SessionReasoningBinding>();

  getSessionKey(client: string, sessionId?: string): string {
    const normalizedClient = client.toLowerCase().trim() || "default";
    const normalizedSessionId = sessionId?.trim() || "";
    return normalizedSessionId
      ? `${normalizedClient}:${normalizedSessionId}`
      : normalizedClient;
  }

  getEffort(sessionKey: string): ReasoningEffortLevel | undefined {
    return this.bindings.get(sessionKey)?.effort;
  }

  setEffort(sessionKey: string, effort: ReasoningEffortLevel): SessionReasoningBinding {
    const binding: SessionReasoningBinding = {
      effort,
      sessionKey,
      timestamp: new Date()
    };
    this.bindings.set(sessionKey, binding);
    return binding;
  }

  clearBinding(sessionKey: string): void {
    this.bindings.delete(sessionKey);
  }

  getAllBindings(): SessionReasoningBinding[] {
    return Array.from(this.bindings.values());
  }

  clearExpiredBindings(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleared = 0;
    for (const [key, binding] of this.bindings.entries()) {
      if (now - binding.timestamp.getTime() > maxAge) {
        this.bindings.delete(key);
        cleared += 1;
      }
    }
    return cleared;
  }
}

let instance: SessionReasoningBindingManager | undefined;

export function getSessionReasoningBindingManager(): SessionReasoningBindingManager {
  if (!instance) {
    instance = new SessionReasoningBindingManager();
  }
  return instance;
}
