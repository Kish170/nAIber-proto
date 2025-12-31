import nlp from 'compromise';

export interface IntentClassification {
    shouldProcessRAG: boolean;
    isContinuation: boolean;
    isShortResponse: boolean;
    messageLength: number;
    hasSubstantiveContent: boolean;
}

export class IntentClassifier {
    classifyIntent(message: string): IntentClassification {
        const doc = nlp(message);
        const wordCount = doc.wordCount();

        const isShortResponse = wordCount < 5;

        const hasNouns = doc.has('#Noun');
        const hasVerbs = doc.has('#Verb');
        const hasQuestion = doc.has('#Question');
        const hasSubstantiveContent = hasNouns || hasVerbs || hasQuestion;
        const isAffirmative = doc.has('#Affirmative');
        const isFiller = doc.has('#Filler') && wordCount < 10;

        const backchannelPatterns = /^(uh-?huh|mm-?hmm|yeah|yep|yup|ok|okay|right|I see|got it|sure)$/i;
        const isBackchannel = backchannelPatterns.test(message.trim());

        const shouldProcessRAG = !isShortResponse &&
                                  hasSubstantiveContent &&
                                  !isFiller &&
                                  !isAffirmative &&
                                  !isBackchannel;

        return {
            shouldProcessRAG,
            isContinuation: !shouldProcessRAG,
            isShortResponse,
            messageLength: wordCount,
            hasSubstantiveContent
        };
    }

    calculateSimilarityThreshold(classification: IntentClassification): number {
        let threshold = 0.60;  

        if (classification.messageLength > 15) {
            threshold = 0.70;  
        } else if (classification.messageLength > 10) {
            threshold = 0.65;
        }

        return threshold;
    }

    isSimpleAffirmation(message: string): boolean {
        const doc = nlp(message);
        return doc.has('#Affirmative') && doc.wordCount() < 3;
    }
}
