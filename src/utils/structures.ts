export interface StructureNode {
  name: string;
  offset: number;
  size: number;
  details?: string;
}

export interface ParsingResult {
  type: string;
  structures: StructureNode[];
}

export function parseFileStructures(buffer: Uint8Array): ParsingResult {
  const scanSize = buffer.length;
  let detectedType = 'Unknown';
  const structures: StructureNode[] = [];

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const asciiDecoder = new TextDecoder('ascii', { fatal: false });

  // Helper to slice buffer and get hex string
  const getHex = (buf: Uint8Array, start: number, end: number) => {
    return Array.from(buf.subarray(start, end))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  // Helper to find a sequence in the buffer
  const findSequence = (buf: Uint8Array, seq: number[], startOffset = 0) => {
    for (let i = startOffset; i <= buf.length - seq.length; i++) {
      let found = true;
      for (let j = 0; j < seq.length; j++) {
        if (buf[i + j] !== seq[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  };

  // 1. PNG Parser
  if (scanSize >= 8 && getHex(buffer, 0, 8) === '89504e470d0a1a0a') {
    detectedType = 'PNG';
    structures.push({ name: 'PNG File Signature', offset: 0, size: 8, details: 'Valid Portable Network Graphics' });
    
    let curr = 8;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    while (curr + 12 <= scanSize) {
      try {
        const len = view.getUint32(curr, false); // Big endian
        const chunkTypeBytes = buffer.subarray(curr + 4, curr + 8);
        const chunkType = asciiDecoder.decode(chunkTypeBytes).replace(/[^a-zA-Z0-9]/g, '?');
        structures.push({
          name: `Chunk: ${chunkType}`,
          offset: curr,
          size: len + 12,
          details: `Length: ${len} bytes`
        });
        curr += len + 12;
        if (chunkType === 'IEND') break;
      } catch (e) {
        break;
      }
    }
  }
  // 2. ZIP Parser
  else if (findSequence(buffer, [0x50, 0x4B, 0x03, 0x04]) !== -1) {
    detectedType = 'ZIP';
    let index = findSequence(buffer, [0x50, 0x4B, 0x03, 0x04]);
    let count = 0;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    while (index !== -1 && index + 30 <= scanSize && count < 20) {
      try {
        const filenameLen = view.getUint16(index + 26, true); // Little endian
        const compSize = view.getUint32(index + 18, true); // Little endian
        const nameBytes = buffer.subarray(index + 30, Math.min(scanSize, index + 30 + filenameLen));
        const rawFilename = decoder.decode(nameBytes);
        const filename = rawFilename.replace(/[^a-zA-Z0-9_.\-/]/g, '');

        structures.push({
          name: `ZIP Entry: ${filename || 'Unnamed'}`,
          offset: index,
          size: 30 + filenameLen + compSize,
          details: `Compressed size: ${compSize} bytes`
        });

        count++;
        index = findSequence(buffer, [0x50, 0x4B, 0x03, 0x04], index + 1);
      } catch (e) {
        break;
      }
    }
  }
  // 3. ELF Parser
  else if (scanSize >= 4 && getHex(buffer, 0, 4) === '7f454c46') {
    detectedType = 'ELF';
    structures.push({ name: 'ELF File Header', offset: 0, size: 64, details: 'Linux Executable and Linkable Format' });
    try {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const phoff = view.getUint32(28, true); // Little endian
      const phnum = view.getUint16(44, true); // Little endian
      if (phoff > 0 && phoff + phnum * 32 <= scanSize) {
        structures.push({
          name: `Program Headers Table (${phnum} entries)`,
          offset: phoff,
          size: phnum * 32
        });
      }
    } catch (e) {}
  }
  // 4. Windows EXE PE Header Parser
  else if (scanSize >= 2 && asciiDecoder.decode(buffer.subarray(0, 2)) === 'MZ') {
    detectedType = 'EXE';
    structures.push({ name: 'MZ DOS Header', offset: 0, size: 64, details: 'Windows MS-DOS Compatibility Signature' });
    try {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const peOffset = view.getUint32(0x3C, true);
      if (peOffset > 0 && peOffset + 4 <= scanSize) {
        const sig = asciiDecoder.decode(buffer.subarray(peOffset, peOffset + 2));
        if (sig === 'PE') {
          structures.push({ name: 'PE Signature COFF Header', offset: peOffset, size: 24, details: 'Portable Executable header signature' });
          structures.push({ name: 'PE Optional Header', offset: peOffset + 24, size: 240, details: 'Executable Entrypoint & Image metadata' });
        }
      }
    } catch (e) {}
  }
  // 5. PDF Parser
  else if (findSequence(buffer, [0x25, 0x50, 0x44, 0x46, 0x2D]) !== -1) { // '%PDF-'
    detectedType = 'PDF';
    const startIdx = findSequence(buffer, [0x25, 0x50, 0x44, 0x46, 0x2D]);
    structures.push({ name: 'PDF Document Header', offset: startIdx, size: 8, details: 'Adobe PDF document standard' });

    // ' obj' sequence: [0x20, 0x6F, 0x62, 0x6A]
    let currIdx = findSequence(buffer, [0x20, 0x6F, 0x62, 0x6A]);
    let objCount = 0;
    while (currIdx !== -1 && objCount < 15) {
      const wordStart = Math.max(0, currIdx - 10);
      const snippetBytes = buffer.subarray(wordStart, currIdx);
      const snippet = decoder.decode(snippetBytes);
      const match = snippet.match(/(\d+)\s+(\d+)\s*$/);
      const objLabel = match ? `PDF Object ${match[1]}.${match[2]}` : 'Indirect Object';

      structures.push({
        name: objLabel,
        offset: wordStart + (match ? match.index || 0 : 0),
        size: 15,
        details: 'Dynamic Indirect object block'
      });

      objCount++;
      currIdx = findSequence(buffer, [0x20, 0x6F, 0x62, 0x6A], currIdx + 1);
    }
  }
  // 6. MP3 Parser
  else if (scanSize >= 10 && asciiDecoder.decode(buffer.subarray(0, 3)) === 'ID3') {
    detectedType = 'MP3';
    const major = buffer[3];
    const sizeBytes = buffer.subarray(6, 10);
    const id3Size = (sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3];
    structures.push({
      name: `ID3v2.${major} metadata Tag Header`,
      offset: 0,
      size: 10 + id3Size,
      details: `Size: ${10 + id3Size} bytes`
    });
  }

  return { type: detectedType, structures };
}
