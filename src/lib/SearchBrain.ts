export interface SearchResult {
    type: string;
    value: string;
    offset: number;
    confidence: number;
}

const offlineDictionary: Record<string, string[]> = {
    'health': ['hp', 'life', 'heal', 'maxhealth', 'playerhealth', 'enemyhealth'],
    'password': ['pass', 'pwd', 'secret', 'key', 'credential'],
    'network': ['url', 'endpoint', 'api', 'socket', 'http', 'https'],
};

export class SearchBrain {
    static async search(query: string, data: any): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const lowerQuery = query.toLowerCase();

        // 1. Exact Search
        if (data.strings) {
            data.strings.forEach((s: any) => {
                if (s.value === query) {
                    results.push({ type: 'Exact', value: s.value, offset: s.offset, confidence: 1.0 });
                }
            });
        }

        // 2. Dictionary Search
        if (offlineDictionary[lowerQuery]) {
            offlineDictionary[lowerQuery].forEach(term => {
                if (data.strings) {
                    data.strings.forEach((s: any) => {
                        if (s.value.toLowerCase().includes(term)) {
                            results.push({ type: 'Dictionary', value: s.value, offset: s.offset, confidence: 0.9 });
                        }
                    });
                }
            });
        }

        // 3. Fuzzy Search
        if (results.length === 0 && data.strings) {
            data.strings.forEach((s: any) => {
                if (s.value.toLowerCase().includes(lowerQuery)) {
                    results.push({ type: 'Fuzzy', value: s.value, offset: s.offset, confidence: 0.8 });
                }
            });
        }
        
        return results.sort((a, b) => b.confidence - a.confidence);
    }
}
