/**
 * Nuance signal detection layer using compromise NLP + regex fallback.
 *
 * Architecture:
 *   LLM  → semantic intent + slot extraction
 *   THIS → stable behavioral signals (uncertainty, partial answers, corrections)
 *   Rules → final decision (evaluate_and_decide)
 *
 * Upgrade path: replace each block with a small classifier once transcripts
 * are available. AnswerSignals interface stays stable — callers don't change.
 */

import nlp from 'compromise';

export interface AnswerSignals {
    uncertain: boolean;
    partial: boolean;
    correction: boolean;
    offTopic: boolean;
    sentiment: 'positive' | 'neutral' | 'negative';
    engagement: 'high' | 'low';
}

const UNCERTAIN_PHRASES = /\b(not sure|not certain|hard to say|give or take|could be|might be|roughly|approximately|i'm not certain|something like)\b/i;
const PARTIAL_PHRASES = /\b(it depends|not always|on and off|here and there|every now and then|more or less)\b/i;
const CORRECTION_PHRASES = /\b(no wait|let me rephrase|i take that back|scratch that)\b/i;
const POSITIVE_SENTIMENT = /\b(good|great|well|better|fine|okay|alright|happy|pleased|improving|not bad|pretty good|feeling good|doing well|much better|wonderful|fantastic)\b/i;
const NEGATIVE_SENTIMENT = /\b(bad|worse|terrible|awful|poor|struggling|difficult|hard|pain|hurt|not good|not great|not well|really bad|quite bad|getting worse|miserable|exhausted|drained)\b/i;

export function detectSignals(rawAnswer: string): AnswerSignals {
    const text = rawAnswer.trim();
    const doc = nlp(text);

    const uncertain =
        doc.match('(maybe|perhaps|probably|sort of|kind of|i think|i guess|i suppose|unsure|roughly)').length > 0 ||
        UNCERTAIN_PHRASES.test(text);

    const partial = !uncertain && (
        doc.match('(sometimes|usually|mostly|generally|a bit|a few|mostly|typically|normally)').length > 0 ||
        PARTIAL_PHRASES.test(text)
    );

    const correction =
        doc.match('(actually|i mean|i meant|or rather|sorry|never mind)').length > 0 ||
        CORRECTION_PHRASES.test(text);

    let sentiment: AnswerSignals['sentiment'] = 'neutral';
    if (POSITIVE_SENTIMENT.test(text) && !NEGATIVE_SENTIMENT.test(text)) {
        sentiment = 'positive';
    } else if (NEGATIVE_SENTIMENT.test(text)) {
        sentiment = 'negative';
    }

    const termCount = doc.terms().length;
    const engagement: AnswerSignals['engagement'] = termCount <= 3 ? 'low' : 'high';

    return { uncertain, partial, correction, offTopic: false, sentiment, engagement };
}