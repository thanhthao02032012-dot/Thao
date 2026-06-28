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

// Map to store in-memory patches of edited files
// This keeps the original file untouched as required: "Không sửa trực tiếp file gốc"
// Key: fileId, Value: array of patches { offset: number, oldValue: number, newValue: number }
const filePatches = new Map<string, Array<{ offset: number, oldValue: number, newValue: number }>>();

// 1a. API Endpoint: Initialize Chunked Upload
app.post('/api/file/upload/init', (req, res) => {
  const fileId = crypto.randomUUID();
  const { filename, filesize } = req.body;
  const filePath = path.join(TEMP_DIR, fileId);

  // Initialize empty file session
  try {
    fs.writeFileSync(filePath, '');
    filePatches.set(fileId, []);
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
// Receives sequential binary chunk and appends/writes at exact offset to bypass RAM overhead
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

  // Stream chunk and write directly at the correct offset on disk
  const writeStream = fs.createWriteStream(filePath, {
    flags: 'r+',
    start: chunkIdx * CHUNK_SIZE
  });

  req.pipe(writeStream);

  writeStream.on('finish', () => {
    // If it is the last chunk, perform preliminary analysis & return metadata
    if (chunkIdx === totalChks - 1) {
      try {
        const stats = fs.statSync(filePath);
        
        // Only read the first 4KB for preliminary structure analysis
        const fd = fs.openSync(filePath, 'r');
        const headerSize = Math.min(4096, stats.size);
        const headerBuffer = Buffer.alloc(headerSize);
        fs.readSync(fd, headerBuffer, 0, headerSize, 0);
        fs.closeSync(fd);

        // Detect Magic Number
        let magicNumber = 'Unknown';
        if (stats.size >= 4) {
          magicNumber = headerBuffer.slice(0, 4).toString('hex').toUpperCase();
        }

        // Determine basic file type
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

        // Create Hex representation of first 64 bytes
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

// 2a. API Endpoint: Get byte range / chunk (Used for on-demand scroll chunks)
// Supports /api/file/:fileId/chunk?offset=...&length=... and applies overlays dynamically
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

    // Read the original file segment
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(actualLen);
    fs.readSync(fd, buffer, 0, actualLen, startOffset);
    fs.closeSync(fd);

    // Apply any dynamic byte patches that belong in this range
    const patches = filePatches.get(fileId) || [];
    for (const patch of patches) {
      if (patch.offset >= startOffset && patch.offset < startOffset + actualLen) {
        const relativeOffset = patch.offset - startOffset;
        buffer[relativeOffset] = patch.newValue;
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
  // Forward to chunk handler logic
  
  // Forward to chunk handler
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

    const patches = filePatches.get(fileId as string) || [];
    for (const patch of patches) {
      if (patch.offset >= startOffset && patch.offset < startOffset + actualLen) {
        const relativeOffset = patch.offset - startOffset;
        buffer[relativeOffset] = patch.newValue;
      }
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', actualLen.toString());
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Server failed to read range' });
  }
});

// 3. API Endpoint: Edit byte (Saves patch virtual-to-memory instead of editing original file directly)
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
    const byteVal = parseInt(value, 16); // value is passed as hex string or decimal

    if (isNaN(targetOffset) || targetOffset < 0 || targetOffset >= stats.size) {
      return res.status(400).json({ error: 'Invalid offset' });
    }

    const safeVal = isNaN(byteVal) ? parseInt(value, 10) : byteVal;
    const safeOldVal = oldValue !== undefined ? parseInt(oldValue, 10) : 0;

    // Get current patches array or initialize it
    if (!filePatches.has(fileId)) {
      filePatches.set(fileId, []);
    }
    const patches = filePatches.get(fileId)!;

    // If a patch for this offset already exists, update it, otherwise add new
    const existingPatchIndex = patches.findIndex(p => p.offset === targetOffset);
    if (existingPatchIndex !== -1) {
      patches[existingPatchIndex].newValue = safeVal;
    } else {
      patches.push({
        offset: targetOffset,
        oldValue: safeOldVal,
        newValue: safeVal
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error recording patch:', err);
    res.status(500).json({ error: 'Server failed to record patch' });
  }
});

// 4. API Endpoint: Close file session
app.post('/api/file/close', (req, res) => {
  const { fileId } = req.body;
  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId' });
  }

  const filePath = path.join(TEMP_DIR, fileId);
  filePatches.delete(fileId); // Clear patches memory
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

// 5. API Endpoint: Download file
// assembler: reads original file in 4MB chunks, overlays patches, writes to a new temp file, streams download and unlinks
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
    const patches = filePatches.get(fileId as string) || [];

    if (patches.length === 0) {
      return res.download(originalPath, downloadName, (err) => {
        if (err) {
          console.error('Error downloading pristine file:', err);
        }
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

      // Apply patches falling within this chunk range
      for (const patch of patches) {
        if (patch.offset >= bytesProcessed && patch.offset < bytesProcessed + bytesToRead) {
          const relativeOffset = patch.offset - bytesProcessed;
          buffer[relativeOffset] = patch.newValue;
        }
      }

      fs.writeSync(writeFd, buffer, 0, bytesToRead, bytesProcessed);
      bytesProcessed += bytesToRead;
    }

    fs.closeSync(readFd);
    fs.closeSync(writeFd);

    // Stream download
    res.download(patchedPath, downloadName, (err) => {
      // Clean up patched file
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
        console.log(`[Server Cleanup] Removed stale session file: ${file}`);
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
