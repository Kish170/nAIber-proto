import nlp from 'compromise';

export class TextPreprocessor {
    cleanText(text: string): string {
        const doc = nlp(text);
        doc.remove('#Filler');

        return doc.normalize({
            whitespace: true,
            punctuation: true,
            case: false,
            unicode: true
        }).text();
    }

    extractKeyTerms(text: string): string[] {
        const doc = nlp(text);

        const nouns = doc.nouns().out('array');
        const verbs = doc.verbs().out('array');
        const places = doc.places().out('array');
        const people = doc.people().out('array');

        const allTerms = [...nouns, ...verbs, ...places, ...people];
        return [...new Set(allTerms)].filter(term => term && term.length > 0);
    }

    getSemanticEssence(text: string): string {
        const keyTerms = this.extractKeyTerms(text);

        if (keyTerms.length === 0) {
            return this.cleanText(text);
        }

        return keyTerms.join(' ');
    }

    hasSubstantiveContent(text: string): boolean {
        const doc = nlp(text);
        return doc.has('#Noun') || doc.has('#Verb') || doc.has('#Question');
    }
}
