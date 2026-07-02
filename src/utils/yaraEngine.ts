// YARA-like Deep Scan Engine for WebHexed
// Supports Hex patterns, String patterns, Regex patterns, and a robust Condition Evaluator

export interface YaraRuleString {
  id: string;
  type: 'text' | 'hex' | 'regex';
  value: string;         // Original string value
  parsedPattern?: any;   // Parsed form for fast matching
}

export interface YaraRule {
  name: string;
  meta: Record<string, string>;
  strings: YaraRuleString[];
  condition: string;
}

export interface YaraMatch {
  ruleName: string;
  patternId: string;
  type: 'text' | 'hex' | 'regex';
  offset: number;
  length: number;
  preview: string;
}

export interface YaraScanResult {
  ruleName: string;
  description: string;
  author: string;
  confidence: number; // 0-100%
  matches: YaraMatch[];
}

// Default preloaded rules matching the spec
export const DEFAULT_YARA_RULES: YaraRule[] = [
  {
    name: "UnityAssetBundle",
    meta: {
      description: "Detect Unity Engine AssetBundle containers",
      author: "WebHexed",
      category: "Game Engine"
    },
    strings: [
      { id: "$magic1", type: "text", value: "UnityFS" },
      { id: "$magic2", type: "text", value: "UnityWeb" },
      { id: "$magic3", type: "text", value: "UnityRaw" },
      { id: "$data", type: "text", value: "assets/bin/Data" }
    ],
    condition: "($magic1 or $magic2 or $magic3) and $data"
  },
  {
    name: "AndroidAPK",
    meta: {
      description: "Detect Android Application Package layout",
      author: "WebHexed",
      category: "Mobile Archive"
    },
    strings: [
      { id: "$manifest", type: "text", value: "AndroidManifest.xml" },
      { id: "$classes", type: "text", value: "classes.dex" },
      { id: "$resources", type: "text", value: "resources.arsc" }
    ],
    condition: "$manifest and ($classes or $resources)"
  },
  {
    name: "ExecutableBinary",
    meta: {
      description: "Detect PE (Windows), ELF (Linux), or Mach-O (macOS) executables",
      author: "WebHexed",
      category: "Native Binary"
    },
    strings: [
      { id: "$mz", type: "hex", value: "4D 5A" }, // Windows PE
      { id: "$elf", type: "hex", value: "7F 45 4C 46" }, // ELF
      { id: "$macho_32", type: "hex", value: "FE ED FA CE" }, // Mach-O 32-bit
      { id: "$macho_64", type: "hex", value: "FE ED FA CF" }, // Mach-O 64-bit
      { id: "$macho_32_r", type: "hex", value: "CE FA ED FE" }, // Mach-O Reverse
      { id: "$macho_64_r", type: "hex", value: "CF FA ED FE" }  // Mach-O Reverse 64
    ],
    condition: "$mz or $elf or $macho_32 or $macho_64 or $macho_32_r or $macho_64_r"
  },
  {
    name: "MaliciousWebshell",
    meta: {
      description: "Detects common backdoors, web shells, and unsafe execution functions",
      author: "WebHexed Security",
      category: "Malware / Webshell"
    },
    strings: [
      { id: "$php_eval", type: "text", value: "eval($_POST[" },
      { id: "$php_system", type: "text", value: "system($_GET[" },
      { id: "$shell_exec", type: "text", value: "shell_exec(" },
      { id: "$passthru", type: "text", value: "passthru(" },
      { id: "$jsp_runtime", type: "text", value: "Runtime.getRuntime().exec(" },
      { id: "$py_subprocess", type: "text", value: "subprocess.Popen(" }
    ],
    condition: "any of them"
  },
  {
    name: "PDFDocument",
    meta: {
      description: "Detect Adobe PDF documents",
      author: "WebHexed",
      category: "Document"
    },
    strings: [
      { id: "$header", type: "text", value: "%PDF-" },
      { id: "$eof", type: "text", value: "%%EOF" },
      { id: "$obj", type: "text", value: "obj" },
      { id: "$endobj", type: "text", value: "endobj" }
    ],
    condition: "$header and $eof and $obj"
  },
  {
    name: "ZipArchive",
    meta: {
      description: "Detect ZIP compressed archives",
      author: "WebHexed",
      category: "Archive"
    },
    strings: [
      { id: "$pk", type: "hex", value: "50 4B 03 04" }
    ],
    condition: "$pk"
  },
  {
    name: "LZ4Compression",
    meta: {
      description: "Detect LZ4 compression signature frames",
      author: "WebHexed",
      category: "Compression"
    },
    strings: [
      { id: "$lz4_magic", type: "hex", value: "04 22 4D 18" },
      { id: "$lz4_legacy", type: "hex", value: "02 21 4C 18" }
    ],
    condition: "$lz4_magic or $lz4_legacy"
  },
  {
    name: "ZlibStream",
    meta: {
      description: "Detect Zlib / Deflate compression headers",
      author: "WebHexed",
      category: "Compression"
    },
    strings: [
      { id: "$z1", type: "hex", value: "78 01" }, // Low compression
      { id: "$z2", type: "hex", value: "78 9C" }, // Default compression
      { id: "$z3", type: "hex", value: "78 DA" }  // Best compression
    ],
    condition: "$z1 or $z2 or $z3"
  },
  {
    name: "SQLiteDatabase",
    meta: {
      description: "Detect SQLite 3 Database structures",
      author: "WebHexed",
      category: "Database"
    },
    strings: [
      { id: "$magic", type: "text", value: "SQLite format 3" }
    ],
    condition: "$magic"
  }
];

// Parse user entered text rule in YARA style
export function parseYaraRules(text: string): YaraRule[] {
  const rules: YaraRule[] = [];
  
  // Clean comments
  // Replace /* ... */
  let cleanText = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // Replace line-by-line //
  cleanText = cleanText.split('\n').map(line => {
    const idx = line.indexOf('//');
    return idx >= 0 ? line.slice(0, idx) : line;
  }).join('\n');

  // Match: rule [RuleName] { [body] }
  const ruleRegex = /rule\s+([a-zA-Z0-9_]+)\s*(?::\s*[a-zA-Z0-9_,\s]+)?\s*\{([\s\S]*?)\}/g;
  let match;

  while ((match = ruleRegex.exec(cleanText)) !== null) {
    const ruleName = match[1];
    const ruleBody = match[2];

    const meta: Record<string, string> = {};
    const stringsList: YaraRuleString[] = [];
    let condition = "any of them";

    // Extract meta block
    const metaMatch = /\bmeta\s*:([\s\S]*?)(?:\bstrings\s*:|\bcondition\s*:|$)/i.exec(ruleBody);
    if (metaMatch) {
      const metaLines = metaMatch[1].split('\n');
      metaLines.forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          let val = parts.slice(1).join('=').trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          meta[key] = val;
        }
      });
    }

    // Extract strings block
    const stringsMatch = /\bstrings\s*:([\s\S]*?)\bcondition\s*:/i.exec(ruleBody);
    if (stringsMatch) {
      const stringsLines = stringsMatch[1].split('\n');
      stringsLines.forEach(line => {
        const assignIdx = line.indexOf('=');
        if (assignIdx >= 0) {
          const id = line.slice(0, assignIdx).trim();
          if (id.startsWith('$')) {
            let right = line.slice(assignIdx + 1).trim();
            // check format
            if (right.startsWith('"')) {
              // text string, find closing quote
              let textVal = '';
              let escaped = false;
              for (let i = 1; i < right.length; i++) {
                if (escaped) {
                  textVal += right[i];
                  escaped = false;
                } else if (right[i] === '\\') {
                  escaped = true;
                } else if (right[i] === '"') {
                  break;
                } else {
                  textVal += right[i];
                }
              }
              stringsList.push({ id, type: 'text', value: textVal });
            } else if (right.startsWith('{') && right.includes('}')) {
              // hex string
              const endIdx = right.indexOf('}');
              const hexVal = right.slice(1, endIdx).trim();
              stringsList.push({ id, type: 'hex', value: hexVal });
            } else if (right.startsWith('/')) {
              // regex string
              const lastSlash = right.lastIndexOf('/');
              const regexVal = right.slice(1, lastSlash);
              stringsList.push({ id, type: 'regex', value: regexVal });
            }
          }
        }
      });
    }

    // Extract condition block
    const condMatch = /\bcondition\s*:([\s\S]*?)$/i.exec(ruleBody);
    if (condMatch) {
      condition = condMatch[1].trim();
    }

    rules.push({
      name: ruleName,
      meta,
      strings: stringsList,
      condition
    });
  }

  return rules;
}

// Convert Hex pattern (e.g. "48 65 ?? 57") to matchable token array
function parseHexPattern(hexStr: string): (number | null)[] {
  const parts = hexStr.replace(/\s+/g, ' ').trim().split(' ');
  return parts.map(part => {
    if (part === '??' || part === '?') return null;
    const num = parseInt(part, 16);
    return isNaN(num) ? null : num;
  });
}

// Check standard text bytes pattern in chunk
function matchBytesPattern(data: Uint8Array, pattern: (number | null)[], maxMatches = 1000): number[] {
  const offsets: number[] = [];
  const patLen = pattern.length;
  if (patLen === 0) return [];
  const maxIdx = data.length - patLen;

  for (let i = 0; i <= maxIdx; i++) {
    let matched = true;
    for (let j = 0; j < patLen; j++) {
      const patByte = pattern[j];
      if (patByte !== null && data[i + j] !== patByte) {
        matched = false;
        break;
      }
    }
    if (matched) {
      offsets.push(i);
      if (offsets.length >= maxMatches) break;
    }
  }
  return offsets;
}

// Helper to convert Uint8Array chunk to Latin-1 string for perfect regex mapping
function uint8ArrayToLatin1String(data: Uint8Array): string {
  let result = '';
  const batchSize = 16384;
  for (let i = 0; i < data.length; i += batchSize) {
    const slice = data.subarray(i, i + batchSize);
    result += String.fromCharCode.apply(null, slice as any);
  }
  return result;
}

// Safe evaluation of condition
export function evaluateCondition(
  conditionStr: string,
  matchStatus: Record<string, boolean>,
  matchCounts: Record<string, number>
): boolean {
  const cleanCond = conditionStr.replace(/\s+/g, ' ').trim().toLowerCase();

  if (cleanCond === 'any of them') {
    return Object.values(matchStatus).some(v => v);
  }
  if (cleanCond === 'all of them') {
    return Object.values(matchStatus).every(v => v);
  }

  // Tokenize and build a safe logic solver
  // We'll translate $var -> matchStatus['$var'] and #var -> matchCounts['$var']
  let expr = conditionStr;

  // Replace count variables e.g. #a -> matchCounts['$a']
  expr = expr.replace(/#([a-zA-Z0-9_]+)/g, (_, name) => {
    return String(matchCounts[`$${name}`] || 0);
  });

  // Replace string variables e.g. $a -> matchStatus['$a']
  expr = expr.replace(/\$([a-zA-Z0-9_]+)/g, (_, name) => {
    return String(matchStatus[`$${name}`] || false);
  });

  // Replace logical terms
  expr = expr.replace(/\band\b/g, '&&')
             .replace(/\bor\b/g, '||')
             .replace(/\bnot\b/g, '!');

  try {
    // Sanity filter: only allow safe JS tokens to execute
    if (!/^[a-zA-Z0-9_$\s&|!()<>=+-\/*]+$/.test(expr)) {
      return false;
    }
    // Safely evaluate logical expression
    const fn = new Function(`return !!(${expr});`);
    return fn();
  } catch (e) {
    console.error("Condition eval failed:", conditionStr, expr, e);
    // Fallback: if any of the mapped strings matches, return true
    return Object.values(matchStatus).some(v => v);
  }
}

// Progressive scanner that scans files in 1MB chunks to ensure 0% freeze
export async function runYaraDeepScan(
  file: File,
  rules: YaraRule[],
  onProgress: (progress: number, status: string) => void,
  maxFileScanSize = 100 * 1024 * 1024, // standard limit, customizable
  options?: {
    signal?: AbortSignal;
    onPauseCheck?: () => Promise<void>;
  }
): Promise<YaraScanResult[]> {
  onProgress(0, "Chuẩn bị rà soát sâu YARA...");

  const size = file.size;
  const chunkLimit = Math.min(size, maxFileScanSize);
  const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks
  
  // Pre-compile rules pattern tokens for efficiency
  const compiledRules = rules.map(rule => {
    const compiledStrings = rule.strings.map(str => {
      let parsedPattern: any = null;
      if (str.type === 'hex') {
        parsedPattern = parseHexPattern(str.value);
      } else if (str.type === 'text') {
        const encoder = new TextEncoder();
        const textBytes = encoder.encode(str.value);
        parsedPattern = Array.from(textBytes);
      } else if (str.type === 'regex') {
        parsedPattern = new RegExp(str.value, 'gi');
      }
      return { ...str, parsedPattern };
    });
    return { ...rule, strings: compiledStrings };
  });

  // Store match results for each rule: stringId -> matches
  const allMatches: Record<string, Record<string, YaraMatch[]>> = {};
  compiledRules.forEach(rule => {
    allMatches[rule.name] = {};
    rule.strings.forEach(str => {
      allMatches[rule.name][str.id] = [];
    });
  });

  let currentOffset = 0;
  const reader = new FileReader();

  // Async chunk reading function
  const readChunk = (offset: number, size: number): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      const slice = file.slice(offset, offset + size);
      reader.readAsArrayBuffer(slice);
    });
  };

  while (currentOffset < chunkLimit) {
    if (options?.signal?.aborted) {
      throw new Error("Scan cancelled by user");
    }
    if (options?.onPauseCheck) {
      await options.onPauseCheck();
    }

    const bytesToRead = Math.min(CHUNK_SIZE, chunkLimit - currentOffset);
    onProgress(
      (currentOffset / chunkLimit) * 100,
      `Đang tìm kiếm pattern: ${(currentOffset / 1024 / 1024).toFixed(1)}MB / ${(chunkLimit / 1024 / 1024).toFixed(1)}MB...`
    );

    try {
      const buffer = await readChunk(currentOffset, bytesToRead);
      const chunkBytes = new Uint8Array(buffer);
      const latin1String = uint8ArrayToLatin1String(chunkBytes);

      // Match each rule
      for (const rule of compiledRules) {
        for (const str of rule.strings) {
          const ruleMatches = allMatches[rule.name][str.id];

          if (str.type === 'hex' || str.type === 'text') {
            const pattern = str.parsedPattern;
            if (pattern) {
              const offsets = matchBytesPattern(chunkBytes, pattern, 150); // limit local matches to keep layout clean
              offsets.forEach(localOffset => {
                const absOffset = currentOffset + localOffset;
                
                // Get display hex preview of the match region
                const matchLen = pattern.length;
                const sliceData = chunkBytes.subarray(localOffset, Math.min(chunkBytes.length, localOffset + Math.min(matchLen, 16)));
                const hexPreview = Array.from(sliceData).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

                ruleMatches.push({
                  ruleName: rule.name,
                  patternId: str.id,
                  type: str.type,
                  offset: absOffset,
                  length: matchLen,
                  preview: hexPreview || str.value
                });
              });
            }
          } else if (str.type === 'regex') {
            const regex = str.parsedPattern;
            if (regex) {
              regex.lastIndex = 0; // reset
              let regexMatch;
              let matchCount = 0;
              while ((regexMatch = regex.exec(latin1String)) !== null && matchCount < 150) {
                const localOffset = regexMatch.index;
                const matchedText = regexMatch[0];
                const absOffset = currentOffset + localOffset;

                ruleMatches.push({
                  ruleName: rule.name,
                  patternId: str.id,
                  type: str.type,
                  offset: absOffset,
                  length: matchedText.length,
                  preview: matchedText.length > 30 ? matchedText.slice(0, 30) + '...' : matchedText
                });
                matchCount++;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to read chunk at offset", currentOffset, e);
      break;
    }

    currentOffset += bytesToRead;
    // Allow thread to yield to UI thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  // Phase 3: Post Analysis and condition evaluation
  onProgress(95, "Đang kiểm tra biểu thức logic YARA...");
  const finalResults: YaraScanResult[] = [];

  compiledRules.forEach(rule => {
    const stringMatches = allMatches[rule.name];
    
    const matchStatus: Record<string, boolean> = {};
    const matchCounts: Record<string, number> = {};
    const aggregatedMatches: YaraMatch[] = [];

    rule.strings.forEach(str => {
      const list = stringMatches[str.id] || [];
      matchCounts[str.id] = list.length;
      matchStatus[str.id] = list.length > 0;
      aggregatedMatches.push(...list);
    });

    const isMatched = evaluateCondition(rule.condition, matchStatus, matchCounts);

    if (isMatched) {
      // Calculate confidence score based on rule complexity and matched strings
      const matchedStringCount = rule.strings.filter(s => matchStatus[s.id]).length;
      const totalStringCount = rule.strings.length;
      
      let confidence = 50; // base confidence
      if (totalStringCount > 0) {
        confidence = Math.round(50 + (matchedStringCount / totalStringCount) * 50);
      }
      
      // If the matched string includes perfect unique signature (e.g. Magic bytes), elevate confidence
      const hasMagicMatch = rule.strings.some(s => s.id.includes('magic') && matchStatus[s.id]);
      if (hasMagicMatch) {
        confidence = Math.max(confidence, 95);
      }

      finalResults.push({
        ruleName: rule.name,
        description: rule.meta.description || "Custom YARA Deep scan matches found",
        author: rule.meta.author || "WebHexed Community",
        confidence,
        matches: aggregatedMatches.sort((a, b) => a.offset - b.offset)
      });
    }
  });

  onProgress(100, "Rà soát Deep YARA hoàn tất!");
  return finalResults.sort((a, b) => b.confidence - a.confidence);
}
