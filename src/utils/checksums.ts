export function crc32(buffer: Uint8Array): string {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
  }
  return ((crc ^ -1) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function md5(buffer: Uint8Array): string {
  // Rotate left function
  const rol = (v: number, s: number) => (v << s) | (v >>> (32 - s));
  
  // Convert Uint8Array to 32-bit words (little-endian)
  const len = buffer.length;
  const wordsCount = ((len + 8) >> 6) + 1;
  const words = new Int32Array(wordsCount * 16);
  for (let i = 0; i < len; i++) {
    words[i >> 2] |= buffer[i] << ((i & 3) << 3);
  }
  words[len >> 2] |= 0x80 << ((len & 3) << 3);
  words[(wordsCount * 16) - 2] = len * 8;

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  const S = [
    7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
    5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
    4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
    6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21
  ];

  const K = [
    -680876936, -389564586,  606105819, -1044525330, -176418897,  1200080426, -1473231341,  -45705983,
     1770035416, -1958414417,     -42063, -1990404162, 1804603682,  -40341101, -1502002290,  1236535329,
    -165796510, -1069501632,   643717713,  -373897302, -701558691,   38016083, -660478335,  -405537848,
     568446438, -1019803690,  -187363961,  1163531501, -1444681467,  -51403784,  1735328473, -1926607734,
       -378558, -1991035235,  1900267571,  -57434055, -1253533667,  188174828, -260945510, -1085029535,
    -474567962,  1400792737, -1120210379,  -30374953,  358537222, -722521979,   76029189,  -640364487,
    -421815835,  530742520,  -995338651,  -198630844, 1126891415, -1416354905,  -57432789,  1705432771,
    -1894986606,   -1051523, -2054922799,  1873313359,  -30611744, -1560198380, 1309151649,  -145523070
  ];

  for (let q = 0; q < wordsCount; q++) {
    const o = q * 16;
    let aa = a;
    let bb = b;
    let cc = c;
    let dd = d;

    for (let i = 0; i < 64; i++) {
      let f = 0;
      let g = 0;
      if (i < 16) {
        f = (bb & cc) | (~bb & dd);
        g = i;
      } else if (i < 32) {
        f = (dd & bb) | (~dd & cc);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = bb ^ cc ^ dd;
        g = (3 * i + 5) & 15;
      } else {
        f = cc ^ (bb | ~dd);
        g = (7 * i) & 15;
      }

      const temp = dd;
      dd = cc;
      cc = bb;
      bb = (bb + rol(aa + f + K[i] + words[o + g], S[i])) | 0;
      aa = temp;
    }

    a = (a + aa) | 0;
    b = (b + bb) | 0;
    c = (c + cc) | 0;
    d = (d + dd) | 0;
  }

  const hex = (v: number) => {
    let s = '';
    for (let i = 0; i < 4; i++) {
      const byte = (v >>> (i * 8)) & 0xFF;
      s += byte.toString(16).padStart(2, '0');
    }
    return s;
  };

  return (hex(a) + hex(b) + hex(c) + hex(d)).toUpperCase();
}

export async function sha1(buffer: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function sha256(buffer: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function calculateEntropy(buffer: Uint8Array, numBlocks = 64): Array<{ block: number; entropy: number; offset: number }> {
  if (buffer.length === 0) return [];
  const results = [];
  const blockSize = Math.max(1, Math.floor(buffer.length / numBlocks));

  for (let b = 0; b < numBlocks; b++) {
    const start = b * blockSize;
    if (start >= buffer.length) break;
    const end = Math.min(start + blockSize, buffer.length);
    const slice = buffer.subarray(start, end);

    const freqs = new Float32Array(256);
    for (let i = 0; i < slice.length; i++) {
      freqs[slice[i]]++;
    }

    let entropy = 0;
    const len = slice.length;
    for (let i = 0; i < 256; i++) {
      if (freqs[i] > 0) {
        const p = freqs[i] / len;
        entropy -= p * Math.log2(p);
      }
    }

    results.push({
      block: b + 1,
      entropy: parseFloat(entropy.toFixed(4)),
      offset: start
    });
  }

  return results;
}
