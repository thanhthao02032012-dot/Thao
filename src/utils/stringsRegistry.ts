import { classifyString } from './fileAnalyzer';

export interface RegistryStringEntry {
  offset: number;
  value: string;
  originalValue?: string;
  length: number;
  type: string;
  encoding?: string;
  category?: string;
  confidence?: number;
  entropy?: number;
  offsets?: number[];
  count?: number;
  aiReason?: string;
}

export interface StringsStats {
  totalCount: number;
  bytesScanned: number;
  byCategory: Record<string, number>;
  byEncoding: Record<string, number>;
  speedMBps: number;
  estimatedRemainingSecs: number;
  chunkCount: number;
  totalChunks: number;
}

// Concept synonym dictionary for smart expanded searching
export const SEARCH_CONCEPT_SYNONYMS: Record<string, string[]> = {

  health: ['health', 'hp', 'hpbar', 'heal', 'life', 'vitality', 'maxhp', 'currenthp', 'playerhealth', 'enemyhealth', 'máu', 'sinh lực', 'trị thương'],
  hp: ['health', 'hp', 'hpbar', 'heal', 'life', 'vitality', 'maxhp', 'currenthp', 'playerhealth', 'enemyhealth', 'máu', 'sinh lực', 'trị thương'],
  player: ['player', 'char', 'character', 'hero', 'actor', 'ply', 'usr', 'user', 'nhân vật', 'người chơi'],
  enemy: ['enemy', 'boss', 'monster', 'mob', 'npc', 'opponent', 'creature', 'quái', 'kẻ địch'],
  gold: ['gold', 'money', 'cash', 'coin', 'coins', 'gem', 'gems', 'currency', 'silver', 'tiền', 'vàng', 'xu', 'ngọc'],
  score: ['score', 'point', 'points', 'highscore', 'sc', 'xp', 'exp', 'experience', 'điểm', 'kinh nghiệm'],
  level: ['level', 'lvl', 'stage', 'map', 'world', 'chapter', 'cấp', 'màn'],
  speed: ['speed', 'spd', 'velocity', 'rate', 'accelerate', 'tốc độ'],
  damage: ['damage', 'dmg', 'atk', 'attack', 'power', 'hit', 'sát thương', 'tấn công'],
  defense: ['defense', 'def', 'armor', 'protection', 'shield', 'giáp', 'phòng thủ'],
  mana: ['mana', 'mp', 'energy', 'magic', 'ap', 'sp', 'năng lượng'],
  key: ['key', 'pass', 'password', 'token', 'auth', 'license', 'khóa', 'mật khẩu'],
  config: ['config', 'json', 'xml', 'ini', 'yaml', 'settings', 'properties', 'setup', 'cấu hình', 'thiết lập'],
  weapon: ['weapon', 'sword', 'gun', 'weapon_type', 'item', 'vũ khí', 'kiếm', 'súng'],
  item: ['item', 'inv', 'inventory', 'loot', 'drop', 'vật phẩm', 'túi'],
  time: ['time', 'timer', 'clock', 'duration', 'sec', 'sec_left', 'thời gian'],
  status: ['status', 'state', 'flag', 'active', 'enabled', 'trạng thái'],
  sound: ['sound', 'audio', 'sfx', 'music', 'bgm', 'volume', 'âm thanh', 'nhạc'],
};

function fuzzyMatch(str: string, query: string): boolean {
  let strIdx = 0;
  let queryIdx = 0;
  const sLower = str.toLowerCase();
  const qLower = query.toLowerCase();
  while (strIdx < sLower.length && queryIdx < qLower.length) {
    if (sLower[strIdx] === qLower[queryIdx]) {
      queryIdx++;
    }
    strIdx++;
  }
  return queryIdx === qLower.length;
}

class StringsRegistryClass {
  private file: File | null = null;
  private allStrings: RegistryStringEntry[] = [];
  private totalFoundCount: number = 0;
  private bytesScannedCount: number = 0;
  private isScanRunning: boolean = false;
  
  private speedMBps: number = 0;
  private estimatedRemainingSecs: number = 0;
  private chunkCount: number = 0;
  private totalChunks: number = 0;

  // High-performance direct caches for instant stats
  private categoryStats: Record<string, number> = {};
  private encodingStats: Record<string, number> = {};
  
  // Real-time Index structures for instant lookups
  private searchIndex: Map<string, number[]> = new Map(); // Substring / word inverted index
  
  // Subscribers
  private listeners: Set<() => void> = new Set();

  public reset(file: File) {
    this.file = file;
    this.allStrings = [];
    this.totalFoundCount = 0;
    this.bytesScannedCount = 0;
    this.speedMBps = 0;
    this.estimatedRemainingSecs = 0;
    this.chunkCount = 0;
    this.totalChunks = 0;
    this.isScanRunning = true;
    this.categoryStats = {};
    this.encodingStats = {};
    this.searchIndex.clear();
    this.notify();
  }

  public finishScan() {
    this.isScanRunning = false;
    this.buildSearchIndex();
    this.notify();
  }

  public appendBatch(strings: RegistryStringEntry[], metrics: any) {
    this.bytesScannedCount = metrics.bytesScanned || 0;
    this.speedMBps = metrics.speedMBps || 0;
    this.estimatedRemainingSecs = metrics.estimatedRemainingSecs || 0;
    this.chunkCount = metrics.chunkCount || 0;
    this.totalChunks = metrics.totalChunks || 0;
    
    // Quick validation and batch appending
    for (let i = 0; i < strings.length; i++) {
      const s = strings[i];
      if (this.allStrings.length < 500000) { // Limit to 500k strings to prevent OOM
        this.allStrings.push(s);
      }
      this.totalFoundCount++; // Keep counting total accurately
      
      // Update stats instantly (RAM efficient)
      const cat = s.category || 'General';
      this.categoryStats[cat] = (this.categoryStats[cat] || 0) + 1;
      
      const enc = s.encoding?.split(' ')[0] || 'ASCII';
      this.encodingStats[enc] = (this.encodingStats[enc] || 0) + 1;
      if (s.originalValue) {
        this.encodingStats['Decoded'] = (this.encodingStats['Decoded'] || 0) + 1;
      }
    }

    // Only notify periodically to avoid UI lag during heavy streaming
    if (this.chunkCount % 5 === 0 || this.chunkCount === this.totalChunks) {
      this.notify();
    }
  }

  /**
   * Build an optimized search index of tokenized words mapping to indices.
   * Enables immediate search responses.
   */
  public buildSearchIndex() {
    this.searchIndex.clear();
    const len = this.allStrings.length;
    for (let i = 0; i < len; i++) {
      const val = this.allStrings[i].value.toLowerCase();
      // Tokenize by non-word boundary characters or common separators
      const tokens = val.split(/[^a-zA-Z0-9_\u00C0-\u00FF]/).filter(t => t.length >= 2);
      for (let j = 0; j < tokens.length; j++) {
        const token = tokens[j];
        let idxs = this.searchIndex.get(token);
        if (!idxs) {
          idxs = [];
          this.searchIndex.set(token, idxs);
        }
        if (idxs.length < 5000) { // Safety cap on single token mapping size
          idxs.push(i);
        }
      }
    }
  }

  /**
   * Performs high-speed advanced searches using the index and optimized linear scan
   */
  public query(options: {
    query: string;
    matchType: 'contains' | 'exact' | 'regex' | 'fuzzy' | 'prefix' | 'suffix' | 'multi' | 'semantic' | 'concept';
    caseSensitive: boolean;
    category: string;
    encoding: string;
    minConfidence: number;
    minEntropy: number;
    minLen: number;
    aiMatches?: Array<{ offset: number; reason: string }>;
  }): RegistryStringEntry[] {
    const qRaw = options.query;
    const qClean = qRaw.trim();
    
    // 1. Initial filter pool selection
    let pool: number[] = [];
    const isSpecializedQuery = qClean.length > 1;
    
    // If the index contains the token and we are doing contains/prefix/concept, use the index!
    if (isSpecializedQuery && this.searchIndex.size > 0 && 
        (options.matchType === 'contains' || options.matchType === 'concept' || options.matchType === 'prefix') && 
        !options.caseSensitive) {
      const term = qClean.toLowerCase();
      const matchedIdxs = this.searchIndex.get(term);
      if (matchedIdxs) {
        pool = matchedIdxs;
      }
    }

    // Default to scanning everything if the index wasn't applicable or empty
    const useScan = pool.length === 0;
    const itemsCount = useScan ? this.allStrings.length : pool.length;
    const results: RegistryStringEntry[] = [];

    // Setup concept synonyms if search mode is concept (or auto concept search is triggered)
    let conceptTerms: string[] = [qClean.toLowerCase()];
    if (options.matchType === 'concept' || options.matchType === 'semantic') {
      const syns = SEARCH_CONCEPT_SYNONYMS[qClean.toLowerCase()];
      if (syns) {
        conceptTerms = Array.from(new Set([...conceptTerms, ...syns]));
      }
    }

    // Prepare Regex if requested
    let compiledRegex: RegExp | null = null;
    if (options.matchType === 'regex' && qClean) {
      try {
        compiledRegex = new RegExp(qClean, options.caseSensitive ? '' : 'i');
      } catch (err) {
        // Fallback to contains on invalid regex
        compiledRegex = null;
      }
    }

    // Prepare Multi Keywords
    const keywords = qClean.toLowerCase().split(/\s+/).filter(k => k.length > 0);

    for (let i = 0; i < itemsCount; i++) {
      const idx = useScan ? i : pool[i];
      const entry = this.allStrings[idx];

      // Quick constraints checking (category, encoding, confidence, entropy, length)
      if (options.category !== 'all' && entry.category !== options.category) continue;
      
      if (options.encoding !== 'all') {
        if (options.encoding === 'decoded') {
          if (!entry.originalValue) continue;
        } else if (!entry.encoding?.includes(options.encoding)) {
          continue;
        }
      }

      if (entry.length < options.minLen) continue;
      if (entry.confidence < options.minConfidence) continue;
      if (entry.entropy < options.minEntropy) continue;

      // Text matching phase
      if (qClean) {
        const val = entry.value;
        const offsetHex = entry.offset.toString(16).toLowerCase();
        const offsetMatched = offsetHex.includes(qClean.toLowerCase());

        if (offsetMatched) {
          results.push(entry);
          continue;
        }

        // Apply advanced search algorithms
        let isMatched = false;
        const targetText = options.caseSensitive ? val : val.toLowerCase();
        const searchText = options.caseSensitive ? qClean : qClean.toLowerCase();

        switch (options.matchType) {
          case 'exact':
            isMatched = targetText === searchText;
            break;
          case 'prefix':
            isMatched = targetText.startsWith(searchText);
            break;
          case 'suffix':
            isMatched = targetText.endsWith(searchText);
            break;
          case 'fuzzy':
            isMatched = fuzzyMatch(val, qClean);
            break;
          case 'regex':
            isMatched = compiledRegex ? compiledRegex.test(val) : val.toLowerCase().includes(searchText);
            break;
          case 'multi':
            // Check if ALL keywords match (AND logic)
            isMatched = keywords.every(k => val.toLowerCase().includes(k));
            break;
          case 'concept':
            // Check if any concept synonym matches
            isMatched = conceptTerms.some(term => val.toLowerCase().includes(term));
            break;
          case 'semantic':
            // If AI Semantic Search matches are provided, filter using them
            if (options.aiMatches && options.aiMatches.length > 0) {
              const matchedAi = options.aiMatches.find(m => m.offset === entry.offset);
              if (matchedAi) {
                isMatched = true;
                entry.aiReason = matchedAi.reason;
              }
            } else {
              // Fallback to concept search if AI matches haven't arrived yet
              isMatched = conceptTerms.some(term => val.toLowerCase().includes(term));
            }
            break;
          case 'contains':
          default:
            isMatched = targetText.includes(searchText);
            break;
        }

        if (!isMatched) continue;
      }

      results.push(entry);
    }

    // Sort results by confidence, then length
    return results.sort((a, b) => {
      const confDiff = b.confidence - a.confidence;
      if (confDiff !== 0) return confDiff;
      return b.length - a.length;
    });
  }

  public getStats(): StringsStats {
    return {
      totalCount: this.totalFoundCount,
      bytesScanned: this.bytesScannedCount,
      byCategory: { ...this.categoryStats },
      byEncoding: { ...this.encodingStats },
      speedMBps: this.speedMBps,
      estimatedRemainingSecs: this.estimatedRemainingSecs,
      chunkCount: this.chunkCount,
      totalChunks: this.totalChunks
    };
  }

  public getIsScanRunning(): boolean {
    return this.isScanRunning;
  }

  public getAll(): RegistryStringEntry[] {
    return this.allStrings;
  }

  public addListener(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => {
      try { l(); } catch (err) { console.error(err); }
    });
  }
}

export const StringsRegistry = new StringsRegistryClass();
