import { createHash } from 'node:crypto';
import { traceable } from 'langsmith/traceable';
import { OpenAIClient } from '@naiber/shared-clients';

export interface ExtractedPerson {
    id: string;
    name: string;
    role?: string;
    context: string;
    highlightIndices: number[];
}

export class NERService {
    private openAIClient: OpenAIClient;

    constructor(openAIClient: OpenAIClient) {
        this.openAIClient = openAIClient;
    }

    extractPersons = traceable(
        async (transcript: string): Promise<ExtractedPerson[]> => {
            const response = await this.openAIClient.generalGPTCall({
                messages: [
                    {
                        role: 'system',
                        content: `You are extracting named people mentioned in a conversation between an elderly user and an AI companion.

Return a JSON object with this exact structure:
{
  "persons": [
    {
      "name": "the person's actual name as spoken (e.g. 'Sarah', 'Dr. Patel', 'Rob')",
      "role": "their relationship to the user (e.g. daughter, doctor, neighbor) — omit if unknown",
      "quote": "a short verbatim phrase from the transcript where the person's name is spoken"
    }
  ]
}

Rules:
- ONLY extract persons who are referred to by name in the transcript
- Do NOT create entries for people mentioned only by relationship (e.g. "my daughter", "my doctor", "a neighbor") — skip them entirely
- Do NOT invent descriptive labels like "User's Granddaughter" or "User's Husband" — if no name was spoken, omit the person
- The quote field must be a verbatim excerpt from the transcript and must contain the person's name
- Only extract real people the user mentions — not the AI companion
- Deduplicate — if the same person is mentioned multiple times, include them once with the most informative quote
- Return an empty persons array if no named people are mentioned

Examples of CORRECT extractions:
- User says "my daughter Sarah came over" → name: "Sarah", role: "daughter", quote: "my daughter Sarah came over"
- User says "I spoke with Dr. Patel about my medication" → name: "Dr. Patel", role: "doctor", quote: "I spoke with Dr. Patel about my medication"
- User says "my neighbor Tom helped me in the garden" → name: "Tom", role: "neighbor", quote: "my neighbor Tom helped me in the garden"

Examples of what to SKIP (no name spoken):
- User says "my granddaughter visited" → skip, no name given
- User says "the doctor called" → skip, no name given
- User says "my husband is doing better" → skip, no name given
- User says "someone from church helped me" → skip, no name given`
                    },
                    {
                        role: 'user',
                        content: `Conversation transcript:\n\n${transcript}`
                    }
                ],
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0].message.content;

            console.log('[NERService] Raw GPT response:', content);

            if (!content) {
                console.warn('[NERService] Empty response from LLM — returning no persons');
                return [];
            }

            const parsed = JSON.parse(content);
            const raw: Array<{ name: string; role?: string; quote: string }> = parsed.persons ?? [];

            const verified = raw.filter(p => {
                const nameInQuote = p.quote?.toLowerCase().includes(p.name.toLowerCase().trim());
                if (!nameInQuote) {
                    console.warn(`[NERService] Dropping "${p.name}" — name not found in quote: "${p.quote}"`);
                }
                return nameInQuote;
            });

            const result = verified.map(p => ({
                id: createHash('sha256').update(`${p.name.toLowerCase().trim()}:${(p.role || '').toLowerCase().trim()}`).digest('hex').slice(0, 16),
                name: p.name,
                role: p.role,
                context: p.quote,
                highlightIndices: []
            }));

            console.log('[NERService] Extraction result:', JSON.stringify({
                transcriptLength: transcript.length,
                rawCount: raw.length,
                verifiedCount: result.length,
                droppedCount: raw.length - result.length,
                persons: result.map(p => ({ name: p.name, role: p.role, contextLength: p.context.length })),
            }));

            return result;
        },
        { name: 'ner_extract_persons', run_type: 'chain' }
    );
}