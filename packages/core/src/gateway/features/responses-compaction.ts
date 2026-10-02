/**
 * Responses API Compaction Support
 * 
 * Handles Codex's remote compaction requests via /v1/responses
 * with compaction_trigger input items.
 */

import type { GatewayProviderConfig } from "@ccr/core/contracts/app";

export interface CompactionRequest {
  input: Array<{
    type: string;
    [key: string]: unknown;
  }>;
  model?: string;
  [key: string]: unknown;
}

export interface CompactionResponse {
  id: string;
  type: "compaction";
  encrypted_content: string;
  [key: string]: unknown;
}

/**
 * Check if request contains compaction trigger
 */
export function isCompactionRequest(body: unknown): body is CompactionRequest {
  if (!body || typeof body !== 'object') {
    return false;
  }
  
  const req = body as Record<string, unknown>;
  if (!Array.isArray(req.input)) {
    return false;
  }
  
  return req.input.some((item) => 
    item && typeof item === 'object' && item.type === 'compaction_trigger'
  );
}

/**
 * Transform compaction request for upstream provider
 * 
 * Strips the compaction_trigger and prepares the history for summarization
 */
export function prepareCompactionRequest(
  body: CompactionRequest,
  _provider: GatewayProviderConfig
): Record<string, unknown> {
  // Remove compaction_trigger from input
  const filteredInput = body.input.filter(item => item.type !== 'compaction_trigger');
  
  // Add compaction instruction as system/developer message
  const compactionInstruction = {
    type: 'developer',
    content: [
      {
        type: 'text',
        text: 'Summarize the conversation history into a concise, information-preserving format. Preserve key facts, decisions, and context. Output only the summary without commentary.'
      }
    ]
  };
  
  return {
    ...body,
    input: [compactionInstruction, ...filteredInput],
    // Limit output tokens for compaction
    max_completion_tokens: 4000,
    // Disable streaming for compaction
    stream: false
  };
}

/**
 * Transform provider response into Codex compaction format
 */
export function transformCompactionResponse(
  upstreamResponse: unknown,
  protocol: string
): CompactionResponse {
  // Extract assistant message content from upstream response
  let content = '';
  
  if (protocol === 'openai_responses' || protocol === 'openai_chat_completions') {
    const resp = upstreamResponse as any;
    if (resp.choices?.[0]?.message?.content) {
      content = resp.choices[0].message.content;
    } else if (resp.output?.message?.content) {
      content = resp.output.message.content;
    }
  } else if (protocol === 'anthropic_messages') {
    const resp = upstreamResponse as any;
    if (resp.content?.[0]?.text) {
      content = resp.content[0].text;
    }
  }
  
  // Codex expects "encrypted_content" field (though it's not actually encrypted)
  return {
    id: `compact_${Date.now()}`,
    type: 'compaction',
    encrypted_content: content || 'Context compacted.'
  };
}
