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
                        content: `You are extracting people mentioned in a conversation between an elderly user and an AI companion.

                                Return a JSON object with this exact structure:
                                {
                                "persons": [
                                    {
                                    "name": "the person's name or a descriptive label if no name is given (e.g. 'Sarah', 'User's Daughter')",
                                    "role": "their relationship to the user (e.g. daughter, doctor, neighbor) — omit if unknown",
                                    "context": "a short quote or phrase from the transcript that mentions this person"
                                    }
                                ]
                                }

                                Rules:
                                - Only extract real people the user mentions — not the AI companion
                                - If no name is given, use a descriptive label based on role (e.g. 'User's Daughter', 'User's Doctor')
                                - Deduplicate — if the same person is mentioned multiple times, include them once with the most descriptive context
                                - Omit generic references with no identifying detail (e.g. 'someone', 'people', 'they')
                                - Return an empty array if no people are mentioned`
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
            const raw: Array<{ name: string; role?: string; context: string }> = parsed.persons ?? [];

            const result = raw.map(p => ({
                id: createHash('sha256').update(`${p.name.toLowerCase().trim()}:${(p.role || '').toLowerCase().trim()}`).digest('hex').slice(0, 16),
                name: p.name,
                role: p.role,
                context: p.context,
                highlightIndices: []
            }));

            console.log('[NERService] Extraction result:', JSON.stringify({
                transcriptLength: transcript.length,
                personCount: result.length,
                persons: result.map(p => ({ name: p.name, role: p.role, contextLength: p.context.length })),
            }));

            return result;
        },
        { name: 'ner_extract_persons', run_type: 'chain' }
    );
}