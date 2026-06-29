import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// Body parsing middleware for JSON endpoints
app.use(express.json());

// Set up temp directory for hex files
const TEMP_DIR = path.join(os.tmpdir(), 'hex_editor');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Optimized Patch structure
interface Patch {
  offset: number;
  oldValue: number;
  newValue: number;
  disabled?: boolean;
  timestamp: number;
}

// 2. Optimized Patch Storage: Using nested Map for O(1) query performance
// Key: fileId, Value: Map of offset -> Patch
const filePatchesMap = new Map<string, Map<number, Patch>>();

// History state to support proper Undo & Redo (Upgrades item 8)
interface HistoryEntry {
  offset: number;
  oldValue: number;
  newValue: number;
  type: 'edit' | 'bulk' | 'replace';
  timestamp: number;
}

const fileHistory = new Map<string, {
  list: HistoryEntry[];
  currentIndex: number; // current pointer in the history stack
}>();

// Helper to safely fetch or initialize patches for a file session
const getPatchesForFile = (fileId: string): Map<number, Patch> => {
  if (!filePatchesMap.has(fileId)) {
    filePatchesMap.set(fileId, new Map<number, Patch>());
  }
  return filePatchesMap.get(fileId)!;
};

// Helper to safely fetch or initialize history for a file session
const getHistoryForFile = (fileId: string) => {
  if (!fileHistory.has(fileId)) {
    fileHistory.set(fileId, { list: [], currentIndex: -1 });
  }
  return fileHistory.get(fileId)!;
};

// 1a. API Endpoint: Initialize Chunked Upload
app.post('/api/file/upload/init', (req, res) => {
  const fileId = crypto.randomUUID();
  const { filename, filesize } = req.body;
  const filePath = path.join(TEMP_DIR, fileId);

  try {
    fs.writeFileSync(filePath, '');
    filePatchesMap.set(fileId, new Map<number, Patch>());
    fileHistory.set(fileId, { list: [], currentIndex: -1 });
    res.json({
      fileId,
      name: filename || 'unnamed_file',
      size: filesize || 0
    });
  } catch (err) {
    console.error('Failed to init file session:', err);
    res.status(500).json({ error: 'Failed to initialize file session on server' });
  }
});

// 1b. API Endpoint: Upload File Chunk (4MB chunks)
app.post('/api/file/upload/chunk', (req, res) => {
  const { fileId, chunkIndex, totalChunks, filename } = req.query;

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId parameter' });
  }

  const filePath = path.join(TEMP_DIR, fileId as string);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  const chunkIdx = parseInt(chunkIndex as string, 10);
  const totalChks = parseInt(totalChunks as string, 10);
  const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB

  const writeStream = fs.createWriteStream(filePath, {
    flags: 'r+',
    start: chunkIdx * CHUNK_SIZE
  });

  req.pipe(writeStream);

  writeStream.on('finish', () => {
    if (chunkIdx === totalChks - 1) {
      try {
        const stats = fs.statSync(filePath);
        
        // Only read the first 4KB for preliminary structure analysis
        const fd = fs.openSync(filePath, 'r');
        const headerSize = Math.min(4096, stats.size);
        const headerBuffer = Buffer.alloc(headerSize);
        fs.readSync(fd, headerBuffer, 0, headerSize, 0);
        fs.closeSync(fd);

        let magicNumber = 'Unknown';
        if (stats.size >= 4) {
          magicNumber = headerBuffer.slice(0, 4).toString('hex').toUpperCase();
        }

        let fileType = 'Unknown Binary File';
        const hexSig = magicNumber.toLowerCase();
        if (hexSig.startsWith('504b0304')) {
          fileType = 'ZIP Archive / APK File';
        } else if (hexSig.startsWith('4d5a')) {
          fileType = 'Windows Executable (EXE/DLL)';
        } else if (hexSig.startsWith('89504e47')) {
          fileType = 'PNG Image';
        } else if (hexSig.startsWith('ffd8ff')) {
          fileType = 'JPEG Image';
        } else if (hexSig.startsWith('25504446')) {
          fileType = 'PDF Document';
        } else if (hexSig.startsWith('7f454c46')) {
          fileType = 'ELF Executable / Partition';
        } else if (hexSig.startsWith('494433')) {
          fileType = 'MP3 Audio';
        }

        const first64Bytes = headerBuffer.slice(0, Math.min(64, stats.size));
        const headerHex = first64Bytes.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';

        // Calculate SHA-256 of the whole file stream-wise (RAM-safe)
        const shaSum = crypto.createHash('sha256');
        const fileStream = fs.createReadStream(filePath);
        
        fileStream.on('data', (data) => {
          shaSum.update(data);
        });

        fileStream.on('end', () => {
          const hashHex = shaSum.digest('hex');
          res.json({
            fileId,
            name: (filename as string) || 'unnamed_file',
            size: stats.size,
            magicNumber,
            fileType,
            header: headerHex,
            hash: hashHex
          });
        });

        fileStream.on('error', (err) => {
          console.error('SHA calculation error:', err);
          res.status(500).json({ error: 'Failed to calculate file hash' });
        });

      } catch (err) {
        console.error('Error post-processing completed file:', err);
        res.status(500).json({ error: 'Failed to process completed file' });
      }
    } else {
      res.json({ success: true, message: `Chunk ${chunkIdx + 1}/${totalChks} received` });
    }
  });

  writeStream.on('error', (err) => {
    console.error('Chunk write error:', err);
    res.status(500).json({ error: 'Failed to write chunk to disk' });
  });
});

// 2a. API Endpoint: Get byte range / chunk with O(1) Patch overlay
app.get('/api/file/:fileId/chunk', (req, res) => {
  const { fileId } = req.params;
  const { offset, length } = req.query;

  if (!fileId || offset === undefined || !length) {
    return res.status(400).json({ error: 'Missing parameters: fileId, offset, length' });
  }

  const filePath = path.join(TEMP_DIR, fileId);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  try {
    const stats = fs.statSync(filePath);
    const startOffset = parseInt(offset as string, 10);
    const len = parseInt(length as string, 10);

    if (isNaN(startOffset) || isNaN(len) || startOffset < 0 || startOffset >= stats.size) {
      return res.status(400).json({ error: 'Invalid start offset or length' });
    }

    const endOffset = Math.min(startOffset + len - 1, stats.size - 1);
    const actualLen = endOffset - startOffset + 1;

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(actualLen);
    fs.readSync(fd, buffer, 0, actualLen, startOffset);
    fs.closeSync(fd);

    // Apply patches via O(1) Map lookup
    const patches = getPatchesForFile(fileId);
    for (let i = 0; i < actualLen; i++) {
      const currentOffset = startOffset + i;
      const patch = patches.get(currentOffset);
      if (patch && !patch.disabled) {
        buffer[i] = patch.newValue;
      }
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', actualLen.toString());
    res.send(buffer);
  } catch (err) {
    console.error('Error reading file chunk:', err);
    res.status(500).json({ error: 'Server failed to read file chunk' });
  }
});

// 2b. Backward compatibility alias for /api/file/range
app.get('/api/file/range', (req, res) => {
  const { fileId, start, length } = req.query;
  if (!fileId || start === undefined || !length) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const filePath = path.join(TEMP_DIR, fileId as string);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }
  try {
    const stats = fs.statSync(filePath);
    const startOffset = parseInt(start as string, 10);
    const len = parseInt(length as string, 10);
    if (isNaN(startOffset) || isNaN(len) || startOffset < 0 || startOffset >= stats.size) {
      return res.status(400).json({ error: 'Invalid start offset or length' });
    }
    const endOffset = Math.min(startOffset + len - 1, stats.size - 1);
    const actualLen = endOffset - startOffset + 1;

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(actualLen);
    fs.readSync(fd, buffer, 0, actualLen, startOffset);
    fs.closeSync(fd);

    const patches = getPatchesForFile(fileId as string);
    for (let i = 0; i < actualLen; i++) {
      const currentOffset = startOffset + i;
      const patch = patches.get(currentOffset);
      if (patch && !patch.disabled) {
        buffer[i] = patch.newValue;
      }
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', actualLen.toString());
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Server failed to read range' });
  }
});

// 3. API Endpoint: Edit byte (Stores patch in O(1) map & records history entry)
app.post('/api/file/edit', (req, res) => {
  const { fileId, offset, value, oldValue } = req.body;

  if (!fileId || offset === undefined || value === undefined) {
    return res.status(400).json({ error: 'Missing parameters: fileId, offset, value' });
  }

  const filePath = path.join(TEMP_DIR, fileId as string);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  try {
    const stats = fs.statSync(filePath);
    const targetOffset = parseInt(offset, 10);
    const byteVal = parseInt(value, 16);

    if (isNaN(targetOffset) || targetOffset < 0 || targetOffset >= stats.size) {
      return res.status(400).json({ error: 'Invalid offset' });
    }

    const safeVal = isNaN(byteVal) ? parseInt(value, 10) : byteVal;
    
    // Retrieve original byte value if not supplied
    let safeOldVal = oldValue !== undefined ? parseInt(oldValue, 10) : 0;
    if (oldValue === undefined) {
      const fd = fs.openSync(filePath, 'r');
      const singleBuf = Buffer.alloc(1);
      fs.readSync(fd, singleBuf, 0, 1, targetOffset);
      fs.closeSync(fd);
      safeOldVal = singleBuf[0];
    }

    const patches = getPatchesForFile(fileId);
    const history = getHistoryForFile(fileId);

    // Save previous patch value for undo if present, otherwise safeOldVal
    const prevPatchValue = patches.has(targetOffset) ? patches.get(targetOffset)!.newValue : safeOldVal;

    // Record the patch
    patches.set(targetOffset, {
      offset: targetOffset,
      oldValue: safeOldVal,
      newValue: safeVal,
      timestamp: Date.now()
    });

    // Wipe any undone history entries above the current stack pointer
    if (history.currentIndex < history.list.length - 1) {
      history.list = history.list.slice(0, history.currentIndex + 1);
    }

    // Record history action
    history.list.push({
      offset: targetOffset,
      oldValue: prevPatchValue,
      newValue: safeVal,
      type: 'edit',
      timestamp: Date.now()
    });
    history.currentIndex = history.list.length - 1;

    res.json({ success: true });
  } catch (err) {
    console.error('Error recording patch:', err);
    res.status(500).json({ error: 'Server failed to record patch' });
  }
});

// 1. Bulk Edit phía Server (Upgrades item 1)
app.post('/api/file/bulk-edit', (req, res) => {
  const { fileId, startOffset, length, pattern } = req.body;

  if (!fileId || startOffset === undefined || !length || !pattern || !Array.isArray(pattern)) {
    return res.status(400).json({ error: 'Missing parameters: fileId, startOffset, length, pattern' });
  }

  const filePath = path.join(TEMP_DIR, fileId);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  try {
    const stats = fs.statSync(filePath);
    const start = parseInt(startOffset, 10);
    const len = parseInt(length, 10);

    if (isNaN(start) || start < 0 || start >= stats.size || isNaN(len) || len <= 0 || start + len > stats.size) {
      return res.status(400).json({ error: 'Invalid startOffset or length' });
    }

    const patches = getPatchesForFile(fileId);
    const history = getHistoryForFile(fileId);

    // Open original file to retrieve original values for correct undo history
    const fd = fs.openSync(filePath, 'r');
    const origBytes = Buffer.alloc(len);
    fs.readSync(fd, origBytes, 0, len, start);
    fs.closeSync(fd);

    // Wipe redo history
    if (history.currentIndex < history.list.length - 1) {
      history.list = history.list.slice(0, history.currentIndex + 1);
    }

    const bulkTimestamp = Date.now();

    // Generate Patches for each byte in the range
    for (let i = 0; i < len; i++) {
      const targetOffset = start + i;
      const patternByte = pattern[i % pattern.length];
      const origVal = origBytes[i];
      const prevVal = patches.has(targetOffset) ? patches.get(targetOffset)!.newValue : origVal;

      patches.set(targetOffset, {
        offset: targetOffset,
        oldValue: origVal,
        newValue: patternByte,
        timestamp: bulkTimestamp
      });

      // Record detailed history entry for perfect revert
      history.list.push({
        offset: targetOffset,
        oldValue: prevVal,
        newValue: patternByte,
        type: 'bulk',
        timestamp: bulkTimestamp
      });
    }

    history.currentIndex = history.list.length - 1;

    res.json({
      success: true,
      message: `Successfully applied bulk edit across ${len} bytes.`
    });
  } catch (err) {
    console.error('Bulk edit failed on server:', err);
    res.status(500).json({ error: 'Failed to perform bulk edit on server' });
  }
});

// 3. Streaming Preview with HTTP Range request support (Upgrades item 3)
app.get('/api/file/preview', (req, res) => {
  const { fileId } = req.query;

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId parameter' });
  }

  const filePath = path.join(TEMP_DIR, fileId as string);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  try {
    const stats = fs.statSync(filePath);
    const totalSize = stats.size;
    const patches = getPatchesForFile(fileId as string);

    const rangeHeader = req.headers.range;
    let start = 0;
    let end = totalSize - 1;

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const partialStart = parts[0];
      const partialEnd = parts[1];
      start = parseInt(partialStart, 10);
      end = partialEnd ? parseInt(partialEnd, 10) : totalSize - 1;
    }

    if (start >= totalSize || end >= totalSize || start > end) {
      res.setHeader('Content-Range', `bytes */${totalSize}`);
      return res.status(416).send('Requested Range Not Satisfiable');
    }

    const chunksize = (end - start) + 1;
    res.status(rangeHeader ? 206 : 200);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunksize);
    res.setHeader('Content-Type', 'application/octet-stream');

    const fd = fs.openSync(filePath, 'r');
    const bufferSize = 64 * 1024; // 64KB blocks to optimize RAM stream throughput
    let bytesSent = 0;

    const streamChunk = () => {
      if (bytesSent >= chunksize) {
        fs.closeSync(fd);
        return res.end();
      }

      const bytesToRead = Math.min(bufferSize, chunksize - bytesSent);
      const buffer = Buffer.alloc(bytesToRead);
      const currentOffset = start + bytesSent;

      fs.readSync(fd, buffer, 0, bytesToRead, currentOffset);

      // Overlay patches instantly in O(1)
      for (let i = 0; i < bytesToRead; i++) {
        const absOffset = currentOffset + i;
        const patch = patches.get(absOffset);
        if (patch && !patch.disabled) {
          buffer[i] = patch.newValue;
        }
      }

      bytesSent += bytesToRead;
      res.write(buffer, (err) => {
        if (err) {
          fs.closeSync(fd);
          return res.end();
        }
        streamChunk();
      });
    };

    streamChunk();
  } catch (err) {
    console.error('Preview stream error:', err);
    res.status(500).json({ error: 'Failed to stream patched preview' });
  }
});

// 4. Advanced Streaming Search Engine (Upgrades item 4)
app.post('/api/file/search', (req, res) => {
  const { fileId, type, query } = req.body;

  if (!fileId || !type || query === undefined) {
    return res.status(400).json({ error: 'Missing search parameters: fileId, type, query' });
  }

  const filePath = path.join(TEMP_DIR, fileId);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  try {
    const stats = fs.statSync(filePath);
    const patches = getPatchesForFile(fileId);

    // Build target Buffer based on search type
    let targetBuf: Buffer;
    if (type === 'hex') {
      const cleanHex = query.replace(/\s+/g, '');
      if (cleanHex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(cleanHex)) {
        return res.status(400).json({ error: 'Invalid hex sequence string' });
      }
      const bytes = [];
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
      }
      targetBuf = Buffer.from(bytes);
    } else if (type === 'ascii' || type === 'utf8') {
      targetBuf = Buffer.from(query, 'utf8');
    } else if (type === 'utf16') {
      targetBuf = Buffer.from(query, 'utf16le');
    } else {
      return res.status(400).json({ error: 'Unsupported search encoding type' });
    }

    if (targetBuf.length === 0) {
      return res.json({ matches: [] });
    }

    const matches: number[] = [];
    const maxMatches = 100; // safety ceiling
    const CHUNK_SIZE = 1024 * 1024; // 1MB streaming scanning window
    const overlap = targetBuf.length - 1;

    let offset = 0;
    const fd = fs.openSync(filePath, 'r');

    while (offset < stats.size && matches.length < maxMatches) {
      const bytesToRead = Math.min(CHUNK_SIZE, stats.size - offset);
      const buffer = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buffer, 0, bytesToRead, offset);

      // Overlay in-memory patches
      for (let i = 0; i < bytesToRead; i++) {
        const absOffset = offset + i;
        const patch = patches.get(absOffset);
        if (patch && !patch.disabled) {
          buffer[i] = patch.newValue;
        }
      }

      // Search inside the loaded chunk
      let matchIdx = buffer.indexOf(targetBuf);
      while (matchIdx !== -1 && matches.length < maxMatches) {
        const matchAbsOffset = offset + matchIdx;
        matches.push(matchAbsOffset);
        matchIdx = buffer.indexOf(targetBuf, matchIdx + 1);
      }

      // Slide window forwards with overlap to catch boundaries
      offset += (CHUNK_SIZE - overlap);
      if (offset < 0 || CHUNK_SIZE <= overlap) {
        break;
      }
    }

    fs.closeSync(fd);
    res.json({ matches });
  } catch (err) {
    console.error('Search scanning failed:', err);
    res.status(500).json({ error: 'Streaming search failed on server' });
  }
});

// 5. In-place Replace & Replace All Engine (Upgrades item 5)
app.post('/api/file/replace', (req, res) => {
  const { fileId, type, findQuery, replaceQuery, mode, currentOffset } = req.body;

  if (!fileId || !type || findQuery === undefined || replaceQuery === undefined) {
    return res.status(400).json({ error: 'Missing parameters for replacement' });
  }

  const filePath = path.join(TEMP_DIR, fileId);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  try {
    const stats = fs.statSync(filePath);
    const patches = getPatchesForFile(fileId);
    const history = getHistoryForFile(fileId);

    // Helper to compile search / replace buffers
    const compileBuf = (q: string): Buffer => {
      if (type === 'hex') {
        const clean = q.replace(/\s+/g, '');
        const bytes = [];
        for (let i = 0; i < clean.length; i += 2) {
          bytes.push(parseInt(clean.substring(i, i + 2), 16));
        }
        return Buffer.from(bytes);
      } else if (type === 'ascii' || type === 'utf8') {
        return Buffer.from(q, 'utf8');
      } else {
        return Buffer.from(q, 'utf16le');
      }
    };

    const findBuf = compileBuf(findQuery);
    const replaceBuf = compileBuf(replaceQuery);

    if (findBuf.length === 0) {
      return res.status(400).json({ error: 'Find query sequence is empty' });
    }

    // Step 1: Scan file to gather all match offsets
    const matches: number[] = [];
    const CHUNK_SIZE = 1024 * 1024;
    const overlap = findBuf.length - 1;
    let offset = 0;

    const fd = fs.openSync(filePath, 'r');
    while (offset < stats.size) {
      const bytesToRead = Math.min(CHUNK_SIZE, stats.size - offset);
      const buffer = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buffer, 0, bytesToRead, offset);

      // Overlay current patches
      for (let i = 0; i < bytesToRead; i++) {
        const absOffset = offset + i;
        const patch = patches.get(absOffset);
        if (patch && !patch.disabled) {
          buffer[i] = patch.newValue;
        }
      }

      let matchIdx = buffer.indexOf(findBuf);
      while (matchIdx !== -1) {
        matches.push(offset + matchIdx);
        matchIdx = buffer.indexOf(findBuf, matchIdx + findBuf.length);
      }

      offset += (CHUNK_SIZE - overlap);
      if (offset < 0 || CHUNK_SIZE <= overlap) break;
    }
    fs.closeSync(fd);

    // Apply Filter for single-mode
    let targetsToReplace = matches;
    if (mode === 'single') {
      const startFrom = currentOffset !== undefined ? parseInt(currentOffset, 10) : 0;
      const firstValid = matches.find(m => m >= startFrom);
      targetsToReplace = firstValid !== undefined ? [firstValid] : [];
    }

    if (targetsToReplace.length === 0) {
      return res.json({ success: true, count: 0, message: 'No matching pattern found.' });
    }

    // Clear redo index
    if (history.currentIndex < history.list.length - 1) {
      history.list = history.list.slice(0, history.currentIndex + 1);
    }

    const replaceTimestamp = Date.now();
    const replacedOffsets: number[] = [];

    // Open file to retrieve original values for undo logging
    const readFd = fs.openSync(filePath, 'r');

    for (const matchOffset of targetsToReplace) {
      replacedOffsets.push(matchOffset);

      // Read original values
      const origBytes = Buffer.alloc(replaceBuf.length);
      fs.readSync(readFd, origBytes, 0, Math.min(replaceBuf.length, stats.size - matchOffset), matchOffset);

      for (let i = 0; i < replaceBuf.length; i++) {
        const patchOffset = matchOffset + i;
        if (patchOffset >= stats.size) break;

        const newVal = replaceBuf[i];
        const origVal = origBytes[i];
        const prevVal = patches.has(patchOffset) ? patches.get(patchOffset)!.newValue : origVal;

        patches.set(patchOffset, {
          offset: patchOffset,
          oldValue: origVal,
          newValue: newVal,
          timestamp: replaceTimestamp
        });

        history.list.push({
          offset: patchOffset,
          oldValue: prevVal,
          newValue: newVal,
          type: 'replace',
          timestamp: replaceTimestamp
        });
      }
    }

    fs.closeSync(readFd);
    history.currentIndex = history.list.length - 1;

    res.json({
      success: true,
      count: replacedOffsets.length,
      replacedOffsets,
      message: `Successfully replaced ${replacedOffsets.length} occurrence(s).`
    });
  } catch (err) {
    console.error('Replace failed:', err);
    res.status(500).json({ error: 'Failed to execute replace operation' });
  }
});

// 8. Patch History Management: Undo & Redo & Disable (Upgrades item 8)
app.get('/api/file/history', (req, res) => {
  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

  const patches = getPatchesForFile(fileId as string);
  const history = getHistoryForFile(fileId as string);

  // Serialize Map patches to Array for client rendering
  const activePatches = Array.from(patches.values()).map(p => ({
    offset: p.offset,
    oldValue: p.oldValue,
    newValue: p.newValue,
    disabled: !!p.disabled,
    timestamp: p.timestamp
  }));

  res.json({
    patches: activePatches,
    historyLength: history.list.length,
    currentIndex: history.currentIndex
  });
});

app.post('/api/file/history/undo', (req, res) => {
  const { fileId } = req.body;
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

  const patches = getPatchesForFile(fileId);
  const history = getHistoryForFile(fileId);

  if (history.currentIndex < 0) {
    return res.status(400).json({ error: 'No history to undo' });
  }

  try {
    const entry = history.list[history.currentIndex];
    const targetTimestamp = entry.timestamp;

    // Support undoing multi-byte bulk/replace operations at once
    const undoGroup = history.list.filter(item => item.timestamp === targetTimestamp);
    
    for (const item of undoGroup) {
      if (item.oldValue === null) {
        patches.delete(item.offset);
      } else {
        patches.set(item.offset, {
          offset: item.offset,
          oldValue: item.oldValue, // keep correct values
          newValue: item.oldValue,
          timestamp: Date.now()
        });
      }
    }

    // Move pointer backwards
    history.currentIndex -= undoGroup.length;
    res.json({ success: true, currentIndex: history.currentIndex });
  } catch (err) {
    console.error('Undo error:', err);
    res.status(500).json({ error: 'Failed to perform undo' });
  }
});

app.post('/api/file/history/redo', (req, res) => {
  const { fileId } = req.body;
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

  const patches = getPatchesForFile(fileId);
  const history = getHistoryForFile(fileId);

  if (history.currentIndex >= history.list.length - 1) {
    return res.status(400).json({ error: 'No history to redo' });
  }

  try {
    const nextEntryIndex = history.currentIndex + 1;
    const nextEntry = history.list[nextEntryIndex];
    const targetTimestamp = nextEntry.timestamp;

    const redoGroup = history.list.filter(item => item.timestamp === targetTimestamp);

    for (const item of redoGroup) {
      patches.set(item.offset, {
        offset: item.offset,
        oldValue: item.oldValue,
        newValue: item.newValue,
        timestamp: Date.now()
      });
    }

    history.currentIndex += redoGroup.length;
    res.json({ success: true, currentIndex: history.currentIndex });
  } catch (err) {
    console.error('Redo failed:', err);
    res.status(500).json({ error: 'Failed to execute redo' });
  }
});

// Toggle patch status (Enable / Disable dynamic overlay without deleting)
app.post('/api/file/history/toggle-patch', (req, res) => {
  const { fileId, offset } = req.body;
  if (!fileId || offset === undefined) return res.status(400).json({ error: 'Missing parameters' });

  const patches = getPatchesForFile(fileId);
  const patchOffset = parseInt(offset, 10);

  if (patches.has(patchOffset)) {
    const patch = patches.get(patchOffset)!;
    patch.disabled = !patch.disabled;
    res.json({ success: true, disabled: patch.disabled });
  } else {
    res.status(404).json({ error: 'Patch offset not found' });
  }
});

// Session Restore endpoint for browser restarts (Upgrades item 12)
app.post('/api/file/history/restore', (req, res) => {
  const { fileId, patches } = req.body;
  if (!fileId || !Array.isArray(patches)) {
    return res.status(400).json({ error: 'Invalid restore parameters' });
  }

  try {
    const activePatches = getPatchesForFile(fileId);
    const history = getHistoryForFile(fileId);

    activePatches.clear();
    history.list = [];
    history.currentIndex = -1;

    const ts = Date.now();
    for (const p of patches) {
      activePatches.set(p.offset, {
        offset: p.offset,
        oldValue: p.oldValue || 0,
        newValue: p.newValue,
        timestamp: ts
      });
      history.list.push({
        offset: p.offset,
        oldValue: p.oldValue || 0,
        newValue: p.newValue,
        type: 'edit',
        timestamp: ts
      });
    }
    history.currentIndex = history.list.length - 1;

    res.json({ success: true, restoredCount: patches.length });
  } catch (err) {
    console.error('Failed to restore patches:', err);
    res.status(500).json({ error: 'Failed to restore session patches on server' });
  }
});

// 9. Streaming Multi-Block Entropy Calculator (Upgrades item 9)
app.get('/api/file/entropy', (req, res) => {
  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'Missing fileId parameter' });

  const filePath = path.join(TEMP_DIR, fileId as string);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  try {
    const stats = fs.statSync(filePath);
    const patches = getPatchesForFile(fileId as string);
    const totalSize = stats.size;

    // Divide file into exactly 64 blocks for optimal line chart resolution
    const blockCount = 64;
    const blockSize = Math.max(128, Math.floor(totalSize / blockCount));
    const results: Array<{ block: number; entropy: number; offset: number }> = [];

    const fd = fs.openSync(filePath, 'r');

    for (let b = 0; b < blockCount; b++) {
      const offset = b * blockSize;
      if (offset >= totalSize) break;

      const bytesToRead = Math.min(blockSize, totalSize - offset);
      const buffer = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buffer, 0, bytesToRead, offset);

      // Apply patches
      for (let i = 0; i < bytesToRead; i++) {
        const absOffset = offset + i;
        const patch = patches.get(absOffset);
        if (patch && !patch.disabled) {
          buffer[i] = patch.newValue;
        }
      }

      // Calculate Shannon Entropy
      const counts = new Uint32Array(256);
      for (let i = 0; i < bytesToRead; i++) {
        counts[buffer[i]]++;
      }

      let entropy = 0;
      for (let i = 0; i < 256; i++) {
        if (counts[i] > 0) {
          const p = counts[i] / bytesToRead;
          entropy -= p * Math.log2(p);
        }
      }

      results.push({
        block: b + 1,
        entropy: parseFloat(entropy.toFixed(4)),
        offset
      });
    }

    fs.closeSync(fd);
    res.json({ results });
  } catch (err) {
    console.error('Entropy multi-block error:', err);
    res.status(500).json({ error: 'Failed to calculate entropy' });
  }
});

// 10. Template Structural Parser (Upgrades item 10)
app.get('/api/file/structures', (req, res) => {
  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'Missing fileId parameter' });

  const filePath = path.join(TEMP_DIR, fileId as string);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  try {
    const stats = fs.statSync(filePath);
    const patches = getPatchesForFile(fileId as string);

    // Read the first 128KB of the file to scan headers
    const scanSize = Math.min(128 * 1024, stats.size);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(scanSize);
    fs.readSync(fd, buffer, 0, scanSize, 0);
    fs.closeSync(fd);

    // Apply patches to the scanned buffer
    for (let i = 0; i < scanSize; i++) {
      const patch = patches.get(i);
      if (patch && !patch.disabled) {
        buffer[i] = patch.newValue;
      }
    }

    // Determine structures
    let detectedType = 'Unknown';
    const structures: Array<{ name: string; offset: number; size: number; details?: string }> = [];

    // 1. PNG Parser
    if (scanSize >= 8 && buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
      detectedType = 'PNG';
      structures.push({ name: 'PNG File Signature', offset: 0, size: 8, details: 'Valid Portable Network Graphics' });
      
      let curr = 8;
      while (curr + 12 <= scanSize) {
        const len = buffer.readUInt32BE(curr);
        const chunkType = buffer.toString('ascii', curr + 4, curr + 8);
        structures.push({
          name: `Chunk: ${chunkType}`,
          offset: curr,
          size: len + 12,
          details: `Length: ${len} bytes`
        });
        curr += len + 12;
        if (chunkType === 'IEND') break;
      }
    }
    // 2. ZIP Parser
    else if (buffer.indexOf(Buffer.from([0x50, 0x4B, 0x03, 0x04])) !== -1) {
      detectedType = 'ZIP';
      let index = buffer.indexOf(Buffer.from([0x50, 0x4B, 0x03, 0x04]));
      let count = 0;
      while (index !== -1 && index + 30 <= scanSize && count < 20) {
        const filenameLen = buffer.readUInt16LE(index + 26);
        const compSize = buffer.readUInt32LE(index + 18);
        const rawFilename = buffer.slice(index + 30, index + 30 + filenameLen).toString('utf8');
        const filename = rawFilename.replace(/[^a-zA-Z0-9_.\-/]/g, '');

        structures.push({
          name: `ZIP Entry: ${filename || 'Unnamed'}`,
          offset: index,
          size: 30 + filenameLen + compSize,
          details: `Compressed size: ${compSize} bytes`
        });

        count++;
        index = buffer.indexOf(Buffer.from([0x50, 0x4B, 0x03, 0x04]), index + 1);
      }
    }
    // 3. ELF Parser
    else if (scanSize >= 4 && buffer.slice(0, 4).toString('hex') === '7f454c46') {
      detectedType = 'ELF';
      structures.push({ name: 'ELF File Header', offset: 0, size: 64, details: 'Linux Executable and Linkable Format' });
      const phoff = buffer.readUInt32LE(28);
      const phnum = buffer.readUInt16LE(44);
      if (phoff > 0 && phoff + phnum * 32 <= scanSize) {
        structures.push({
          name: `Program Headers Table (${phnum} entries)`,
          offset: phoff,
          size: phnum * 32
        });
      }
    }
    // 4. Windows EXE PE Header Parser
    else if (scanSize >= 2 && buffer.slice(0, 2).toString('ascii') === 'MZ') {
      detectedType = 'EXE';
      structures.push({ name: 'MZ DOS Header', offset: 0, size: 64, details: 'Windows MS-DOS Compatibility Signature' });
      const peOffset = buffer.readUInt32LE(0x3C);
      if (peOffset > 0 && peOffset + 4 <= scanSize && buffer.slice(peOffset, peOffset + 2).toString('ascii') === 'PE') {
        structures.push({ name: 'PE Signature COFF Header', offset: peOffset, size: 24, details: 'Portable Executable header signature' });
        structures.push({ name: 'PE Optional Header', offset: peOffset + 24, size: 240, details: 'Executable Entrypoint & Image metadata' });
      }
    }
    // 5. PDF Parser
    else if (buffer.indexOf(Buffer.from('%PDF-')) !== -1) {
      detectedType = 'PDF';
      const startIdx = buffer.indexOf(Buffer.from('%PDF-'));
      structures.push({ name: 'PDF Document Header', offset: startIdx, size: 8, details: 'Adobe PDF document standard' });

      let currIdx = buffer.indexOf(Buffer.from(' obj'));
      let objCount = 0;
      while (currIdx !== -1 && objCount < 15) {
        // Find object identifier
        const wordStart = Math.max(0, currIdx - 10);
        const snippet = buffer.toString('utf8', wordStart, currIdx);
        const match = snippet.match(/(\d+)\s+(\d+)\s*$/);
        const objLabel = match ? `PDF Object ${match[1]}.${match[2]}` : 'Indirect Object';

        structures.push({
          name: objLabel,
          offset: wordStart + (match ? match.index || 0 : 0),
          size: 15,
          details: 'Dynamic Indirect object block'
        });

        objCount++;
        currIdx = buffer.indexOf(Buffer.from(' obj'), currIdx + 1);
      }
    }
    // 6. MP3 Parser
    else if (scanSize >= 10 && buffer.slice(0, 3).toString('ascii') === 'ID3') {
      detectedType = 'MP3';
      const major = buffer[3];
      // Size encoding is synchsafe (7 bits per byte)
      const sizeBytes = buffer.slice(6, 10);
      const id3Size = (sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3];
      structures.push({
        name: `ID3v2.${major} metadata Tag Header`,
        offset: 0,
        size: 10 + id3Size,
        details: `Size: ${10 + id3Size} bytes`
      });
    }

    res.json({
      type: detectedType,
      structures
    });
  } catch (err) {
    console.error('Failed to parse structures:', err);
    res.status(500).json({ error: 'Failed to execute structural parsing' });
  }
});

// Custom fast inline CRC32 helper to avoid any build package errors
function calculateCrc32(buffer: Buffer): number {
  let c = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i;
    for (let j = 0; j < 8; j++) {
      r = (r & 1) ? (0xEDB88320 ^ (r >>> 1)) : (r >>> 1);
    }
    table[i] = r;
  }
  for (let i = 0; i < buffer.length; i++) {
    c = table[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// 11. Multi-Hash Real-Time Stream-wise Calculator (Upgrades item 11)
app.get('/api/file/hashes', (req, res) => {
  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'Missing fileId parameter' });

  const filePath = path.join(TEMP_DIR, fileId as string);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  try {
    const stats = fs.statSync(filePath);
    const patches = getPatchesForFile(fileId as string);

    // Initialize hashes
    const md5Sum = crypto.createHash('md5');
    const sha1Sum = crypto.createHash('sha1');
    const sha256Sum = crypto.createHash('sha256');

    // For CRC32 calculation we iterate stream chunks
    let crc = 0xFFFFFFFF;
    const crcTable = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let r = i;
      for (let j = 0; j < 8; j++) {
        r = (r & 1) ? (0xEDB88320 ^ (r >>> 1)) : (r >>> 1);
      }
      crcTable[i] = r;
    }

    const fd = fs.openSync(filePath, 'r');
    const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB stream chunks
    let bytesProcessed = 0;

    while (bytesProcessed < stats.size) {
      const bytesToRead = Math.min(CHUNK_SIZE, stats.size - bytesProcessed);
      const buffer = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buffer, 0, bytesToRead, bytesProcessed);

      // Apply patches
      for (let i = 0; i < bytesToRead; i++) {
        const absOffset = bytesProcessed + i;
        const patch = patches.get(absOffset);
        if (patch && !patch.disabled) {
          buffer[i] = patch.newValue;
        }
      }

      // Update Node crypto digests
      md5Sum.update(buffer);
      sha1Sum.update(buffer);
      sha256Sum.update(buffer);

      // CRC32 stream logic
      for (let i = 0; i < bytesToRead; i++) {
        crc = crcTable[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
      }

      bytesProcessed += bytesToRead;
    }

    fs.closeSync(fd);

    const finalCrc = ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase();

    res.json({
      md5: md5Sum.digest('hex').toUpperCase(),
      sha1: sha1Sum.digest('hex').toUpperCase(),
      sha256: sha256Sum.digest('hex').toUpperCase(),
      crc32: finalCrc.padStart(8, '0')
    });
  } catch (err) {
    console.error('Hashes stream calculation failed:', err);
    res.status(500).json({ error: 'Failed to calculate checksums' });
  }
});

// 4. API Endpoint: Close file session
app.post('/api/file/close', (req, res) => {
  const { fileId } = req.body;
  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId' });
  }

  const filePath = path.join(TEMP_DIR, fileId);
  filePatchesMap.delete(fileId);
  fileHistory.delete(fileId);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: 'File session closed and deleted from server disk' });
    } catch (err) {
      console.error('Error deleting file:', err);
      res.status(500).json({ error: 'Failed to clean up file session' });
    }
  } else {
    res.json({ success: true, message: 'File session already cleaned up' });
  }
});

// 5. API Endpoint: Download file (Applies Map patches overlay on compilation)
app.get('/api/file/download', (req, res) => {
  const { fileId, filename } = req.query;

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId' });
  }

  const originalPath = path.join(TEMP_DIR, fileId as string);
  if (!fs.existsSync(originalPath)) {
    return res.status(404).json({ error: 'File session not found on server' });
  }

  const patchedPath = path.join(TEMP_DIR, `${fileId}_patched`);
  const downloadName = (filename as string) || 'download.bin';

  try {
    const stats = fs.statSync(originalPath);
    const patches = getPatchesForFile(fileId as string);

    if (patches.size === 0) {
      return res.download(originalPath, downloadName, (err) => {
        if (err) console.error('Error downloading pristine file:', err);
      });
    }

    // Assembly with 4MB chunk buffers
    const CHUNK_SIZE = 4 * 1024 * 1024;
    const readFd = fs.openSync(originalPath, 'r');
    const writeFd = fs.openSync(patchedPath, 'w');

    let bytesProcessed = 0;
    const buffer = Buffer.alloc(CHUNK_SIZE);

    while (bytesProcessed < stats.size) {
      const bytesToRead = Math.min(CHUNK_SIZE, stats.size - bytesProcessed);
      fs.readSync(readFd, buffer, 0, bytesToRead, bytesProcessed);

      // Apply patches via O(1) map query
      for (let i = 0; i < bytesToRead; i++) {
        const absOffset = bytesProcessed + i;
        const patch = patches.get(absOffset);
        if (patch && !patch.disabled) {
          buffer[i] = patch.newValue;
        }
      }

      fs.writeSync(writeFd, buffer, 0, bytesToRead, bytesProcessed);
      bytesProcessed += bytesToRead;
    }

    fs.closeSync(readFd);
    fs.closeSync(writeFd);

    res.download(patchedPath, downloadName, (err) => {
      try {
        if (fs.existsSync(patchedPath)) {
          fs.unlinkSync(patchedPath);
        }
      } catch (cleanErr) {
        console.error('Cleanup of patched file failed:', cleanErr);
      }
      if (err) {
        console.error('Error in patched file download stream:', err);
      }
    });
  } catch (err) {
    console.error('Failed to export file with patches:', err);
    res.status(500).json({ error: 'Failed to build and export patched file' });
  }
});

// Periodically clean up files older than 1 hour (every 10 minutes)
setInterval(() => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > oneHour) {
        fs.unlinkSync(filePath);
        filePatchesMap.delete(file);
        fileHistory.delete(file);
        console.log(`[Server Cleanup] Removed stale session file & memory: ${file}`);
      }
    }
  } catch (err) {
    console.error('[Server Cleanup] Error during periodic cleanup:', err);
  }
}, 10 * 60 * 1000);

// Initialize Dev Server / Production Static Serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Full-Stack Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
