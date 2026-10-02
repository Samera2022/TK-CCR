/**
 * Session Model Binding Manager
 * 
 * Manages current model bindings for each session, identified by
 * client (codex/dsh/other) + optional session ID.
 */

import type { SessionModelBinding } from "@ccr/core/models/model-switching-config";

export class SessionModelBindingManager {
  private bindings = new Map<string, SessionModelBinding>();
  
  /**
   * Generate session key from client and optional session ID
   */
  getSessionKey(client: string, sessionId?: string): string {
    const normalizedClient = client.toLowerCase().trim() || "default";
    const normalizedSessionId = sessionId?.trim() || "";
    return normalizedSessionId 
      ? `${normalizedClient}:${normalizedSessionId}`
      : normalizedClient;
  }
  
  /**
   * Get current model for a session
   */
  getCurrentModel(sessionKey: string): string | undefined {
    return this.bindings.get(sessionKey)?.modelId;
  }
  
  /**
   * Set current model for a session
   */
  setCurrentModel(sessionKey: string, modelId: string): void {
    this.bindings.set(sessionKey, {
      sessionKey,
      modelId,
      timestamp: new Date(),
    });
  }
  
  /**
   * Clear binding for a session
   */
  clearBinding(sessionKey: string): void {
    this.bindings.delete(sessionKey);
  }
  
  /**
   * Get all bindings (for debugging)
   */
  getAllBindings(): SessionModelBinding[] {
    return Array.from(this.bindings.values());
  }
  
  /**
   * Clear all expired bindings (older than maxAge in milliseconds)
   */
  clearExpiredBindings(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleared = 0;
    
    for (const [key, binding] of this.bindings.entries()) {
      if (now - binding.timestamp.getTime() > maxAge) {
        this.bindings.delete(key);
        cleared++;
      }
    }
    
    return cleared;
  }
}

// Singleton instance
let instance: SessionModelBindingManager | undefined;

export function getSessionModelBindingManager(): SessionModelBindingManager {
  if (!instance) {
    instance = new SessionModelBindingManager();
  }
  return instance;
}
