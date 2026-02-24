import { getIntentById, intentCatalog } from './catalog';
import type { ResolvedIntent } from '../types';

export interface ResolveIntentInput {
  message: string;
  requestedIntent?: string;
}

export function resolveIntent(input: ResolveIntentInput): ResolvedIntent {
  const requested = input.requestedIntent?.trim();
  if (requested) {
    const explicit = getIntentById(requested);
    if (explicit) {
      return {
        requestedIntent: requested,
        resolvedIntent: explicit.id,
        confidence: 1,
        strategy: 'explicit',
        reason: `Requested intent matched catalog: ${explicit.id}`,
      };
    }
  }

  const normalized = input.message.toLowerCase();
  const scored = intentCatalog.map((intent) => {
    const hits = intent.keywords.filter((keyword) => normalized.includes(keyword)).length;
    const confidence = hits === 0 ? 0.2 : Math.min(0.95, 0.35 + hits * 0.15);
    return { intent, hits, confidence };
  });

  scored.sort((a, b) => b.hits - a.hits || b.confidence - a.confidence);
  const best = scored[0];

  return {
    requestedIntent: requested,
    resolvedIntent: best.intent.id,
    confidence: best.confidence,
    strategy: 'heuristic',
    reason:
      best.hits > 0
        ? `Heuristic fallback matched ${best.hits} keyword(s): ${best.intent.keywords.filter((k) => normalized.includes(k)).join(', ')}`
        : 'Heuristic fallback defaulted to only available intent',
  };
}
