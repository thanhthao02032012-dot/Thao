export async function readAndPatchChunk(
  file: File,
  offset: number,
  length: number,
  patches: Map<number, number>,
  virtualFileSize: number
): Promise<Uint8Array> {
  const actualLength = Math.min(length, virtualFileSize - offset);
  if (actualLength <= 0) {
    return new Uint8Array(0);
  }

  const bytes = new Uint8Array(actualLength);
  const fileBytesCount = Math.max(0, Math.min(actualLength, file.size - offset));

  if (fileBytesCount > 0) {
    const slice = file.slice(offset, offset + fileBytesCount);
    const arrayBuffer = await slice.arrayBuffer();
    bytes.set(new Uint8Array(arrayBuffer));
  }

  // Apply any active patches (both inline modifications and signature additions)
  for (let i = 0; i < actualLength; i++) {
    const curOffset = offset + i;
    if (patches.has(curOffset)) {
      bytes[i] = patches.get(curOffset)!;
    }
  }

  return bytes;
}

export function getPatchedBlob(
  file: File,
  patches: Map<number, number>,
  virtualFileSize: number
): Blob {
  if (patches.size === 0) {
    return file;
  }

  const sortedOffsets = Array.from(patches.keys()).sort((a, b) => a - b);
  const parts: (Blob | Uint8Array)[] = [];
  let lastCopiedOffset = 0;

  let i = 0;
  while (i < sortedOffsets.length) {
    const currentOffset = sortedOffsets[i];
    
    // Add unpatched slice before this patch
    if (currentOffset > lastCopiedOffset) {
      const originalFileBytesCount = Math.max(0, Math.min(currentOffset - lastCopiedOffset, file.size - lastCopiedOffset));
      if (originalFileBytesCount > 0) {
        parts.push(file.slice(lastCopiedOffset, lastCopiedOffset + originalFileBytesCount));
      }
      // Zero-pad if there are gaps in extended virtual file size
      const gap = currentOffset - (lastCopiedOffset + originalFileBytesCount);
      if (gap > 0) {
        parts.push(new Uint8Array(gap));
      }
    }

    // Find contiguous patches
    const patchStart = currentOffset;
    let patchEnd = currentOffset;
    while (i + 1 < sortedOffsets.length && sortedOffsets[i + 1] === patchEnd + 1) {
      patchEnd = sortedOffsets[i + 1];
      i++;
    }

    const blockSize = patchEnd - patchStart + 1;
    const blockData = new Uint8Array(blockSize);
    for (let offset = patchStart; offset <= patchEnd; offset++) {
      blockData[offset - patchStart] = patches.get(offset)!;
    }
    parts.push(blockData);

    lastCopiedOffset = patchEnd + 1;
    i++;
  }

  // Add remaining part of file
  if (lastCopiedOffset < virtualFileSize) {
    const originalFileBytesCount = Math.max(0, Math.min(virtualFileSize - lastCopiedOffset, file.size - lastCopiedOffset));
    if (originalFileBytesCount > 0) {
      parts.push(file.slice(lastCopiedOffset, lastCopiedOffset + originalFileBytesCount));
    }
    const gap = (virtualFileSize - lastCopiedOffset) - originalFileBytesCount;
    if (gap > 0) {
      parts.push(new Uint8Array(gap));
    }
  }

  return new Blob(parts, { type: file.type || 'application/octet-stream' });
}

export async function downloadPatchedFileStream(
  file: File,
  patches: Map<number, number>,
  virtualFileSize: number,
  filename: string
) {
  const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks
  
  const stream = new ReadableStream({
    async start(controller) {
      let offset = 0;
      while (offset < virtualFileSize) {
        const chunk = await readAndPatchChunk(file, offset, CHUNK_SIZE, patches, virtualFileSize);
        controller.enqueue(chunk);
        offset += CHUNK_SIZE;
      }
      controller.close();
    }
  });

  const response = new Response(stream);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function searchLocalFile(
  file: File,
  type: 'hex' | 'ascii' | 'utf8' | 'utf16',
  query: string,
  patches: Map<number, number>,
  virtualFileSize: number
): Promise<number[]> {
  // Compile query pattern
  let pattern: Uint8Array;
  if (type === 'hex') {
    const cleanHex = query.replace(/\s+/g, '');
    if (cleanHex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(cleanHex)) {
      throw new Error('Chuỗi Hex không hợp lệ');
    }
    const bytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
    }
    pattern = new Uint8Array(bytes);
  } else if (type === 'ascii' || type === 'utf8') {
    const encoder = new TextEncoder();
    pattern = encoder.encode(query);
  } else if (type === 'utf16') {
    // UTF-16LE encoding
    const bytes = new Uint8Array(query.length * 2);
    for (let i = 0; i < query.length; i++) {
      const code = query.charCodeAt(i);
      bytes[i * 2] = code & 0xFF;
      bytes[i * 2 + 1] = (code >> 8) & 0xFF;
    }
    pattern = bytes;
  } else {
    throw new Error('Không hỗ trợ định dạng tìm kiếm này');
  }

  if (pattern.length === 0) {
    return [];
  }

  const matches: number[] = [];
  const maxMatches = 100;
  const CHUNK_SIZE = 1024 * 1024; // 1MB scan window
  const overlap = pattern.length - 1;

  let offset = 0;
  while (offset < virtualFileSize && matches.length < maxMatches) {
    const bytesToRead = Math.min(CHUNK_SIZE, virtualFileSize - offset);
    const buffer = await readAndPatchChunk(file, offset, bytesToRead, patches, virtualFileSize);

    // Naive search inside the buffer
    for (let i = 0; i <= buffer.length - pattern.length; i++) {
      let match = true;
      for (let j = 0; j < pattern.length; j++) {
        if (buffer[i + j] !== pattern[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        matches.push(offset + i);
        if (matches.length >= maxMatches) {
          break;
        }
        // Skip over the pattern length to avoid overlapping results of the same string
        i += pattern.length - 1;
      }
    }

    offset += (CHUNK_SIZE - overlap);
    if (offset < 0 || CHUNK_SIZE <= overlap) {
      break;
    }
  }

  return matches;
}
