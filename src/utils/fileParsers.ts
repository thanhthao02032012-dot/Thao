/**
 * Extensible Smart Parser Plugin System for Intelligent File Editor.
 * Safely parses structural details, embedded items, and metadata for various formats
 * without loading entire massive files into RAM.
 */

export interface ParsedItem {
  id: string;
  name: string;
  type: 'image' | 'audio' | 'video' | 'text' | 'document' | 'structure' | 'database' | 'compressed';
  offset: number;
  size: number;
  details?: string;
  data?: any; // For preview or extraction
}

export interface ParsedStructure {
  name: string;
  start: number;
  end: number;
  type: 'header' | 'metadata' | 'data' | 'footer' | 'index' | 'marker';
  description: string;
}

export interface ParserResult {
  formatName: string;
  mimeType: string;
  isText: boolean;
  metadata: Array<{ key: string; label: string; value: string; editable: boolean }>;
  structures: ParsedStructure[];
  embeddedItems: ParsedItem[];
  detectedFeatures: {
    images: boolean;
    audio: boolean;
    video: boolean;
    text: boolean;
    tables: boolean;
    resources: boolean;
  };
  isRawScanMode?: boolean;
  rawScanWarning?: string;
}

export interface FileParserPlugin {
  name: string;
  id: string;
  detect: (header: Uint8Array, filename: string) => boolean;
  parse: (header: Uint8Array, file: File, size: number) => Promise<ParserResult>;
}

// Helper: safe string decoding
export function decodeASCII(bytes: Uint8Array, start = 0, length = bytes.length): string {
  let str = '';
  const end = Math.min(start + length, bytes.length);
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    if (b >= 32 && b <= 126) {
      str += String.fromCharCode(b);
    } else if (b === 0) {
      break;
    } else {
      str += '.';
    }
  }
  return str.trim();
}

// 1. PNG Parser Plugin
const PNGParser: FileParserPlugin = {
  id: 'png',
  name: 'PNG Image Parser',
  detect: (h) => h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4E && h[3] === 0x47,
  parse: async (h, file, size) => {
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;

    if (h.length >= 24) {
      // Width is at 16-19, Height is at 20-23
      width = (h[16] << 24) | (h[17] << 16) | (h[18] << 8) | h[19];
      height = (h[20] << 24) | (h[21] << 16) | (h[22] << 8) | h[23];
      bitDepth = h[24];
      colorType = h[25];
    }

    const structures: ParsedStructure[] = [
      { name: 'PNG Chữ ký (Signature)', start: 0, end: 8, type: 'header', description: 'Chuỗi cố định định danh tệp PNG: \x89PNG\r\n\x1a\n' },
      { name: 'Khối IHDR (Image Header)', start: 8, end: 33, type: 'metadata', description: 'Thông số ảnh cơ bản (kích thước, nén, lọc...)' }
    ];

    if (size > 57) {
      structures.push({ name: 'Khối Dữ Liệu IDAT', start: 33, end: size - 12, type: 'data', description: 'Các dòng quét điểm ảnh được nén Deflate' });
      structures.push({ name: 'Khối Kết Thúc IEND', start: size - 12, end: size, type: 'footer', description: 'Dấu hiệu kết thúc tệp PNG chuẩn' });
    }

    const colorTypes: Record<number, string> = {
      0: 'Grayscale',
      2: 'Truecolor (RGB)',
      3: 'Indexed Color',
      4: 'Grayscale with Alpha',
      6: 'Truecolor with Alpha (RGBA)'
    };

    return {
      formatName: 'PNG (Portable Network Graphics)',
      mimeType: 'image/png',
      isText: false,
      metadata: [
        { key: 'png_dim', label: 'Độ phân giải', value: `${width} × ${height} pixels`, editable: false },
        { key: 'png_depth', label: 'Độ sâu bit màu', value: `${bitDepth}-bit per channel`, editable: false },
        { key: 'png_color', label: 'Không gian màu', value: colorTypes[colorType] || 'Không rõ', editable: false },
        { key: 'png_compress', label: 'Phương pháp nén', value: 'Deflate/Inflate', editable: false }
      ],
      structures,
      embeddedItems: [
        { id: 'embed_img_0', name: 'Ảnh nguồn PNG', type: 'image', offset: 0, size, details: `${width}×${height} image` }
      ],
      detectedFeatures: { images: true, audio: false, video: false, text: false, tables: false, resources: false }
    };
  }
};

// 2. JPEG Parser Plugin
const JPEGParser: FileParserPlugin = {
  id: 'jpeg',
  name: 'JPEG Image Parser',
  detect: (h) => h[0] === 0xFF && h[1] === 0xD8 && h[2] === 0xFF,
  parse: async (h, file, size) => {
    let width = 0;
    let height = 0;
    let brand = 'Standard JFIF';
    
    // Quick search for SOF0 marker (FF C0) in the header to get dimensions
    for (let i = 0; i < h.length - 8; i++) {
      if (h[i] === 0xFF && h[i+1] === 0xC0) {
        height = (h[i+5] << 8) | h[i+6];
        width = (h[i+7] << 8) | h[i+8];
        break;
      }
      if (h[i] === 0xFF && h[i+1] === 0xE1) {
        brand = 'EXIF Metadata Photo';
      }
    }

    const structures: ParsedStructure[] = [
      { name: 'Bắt đầu ảnh SOI (Start of Image)', start: 0, end: 2, type: 'header', description: 'Định danh FF D8 báo bắt đầu luồng nhị phân JPEG' },
      { name: 'Khối Ứng Dụng APP0/APP1', start: 2, end: Math.min(size, 256), type: 'metadata', description: 'Chứa thông tin cấu hình JFIF/EXIF và cấu hình màu.' }
    ];

    if (size > 256) {
      structures.push({ name: 'Khối Quét Điểm Ảnh (Entropy Coded Segment)', start: 256, end: size - 2, type: 'data', description: 'Dữ liệu ảnh lượng tử hóa nén DCT' });
      structures.push({ name: 'Kết thúc ảnh EOI (End of Image)', start: size - 2, end: size, type: 'footer', description: 'Dấu hiệu kết thúc FF D9' });
    }

    return {
      formatName: 'JPEG / JPG (Joint Photographic Experts Group)',
      mimeType: 'image/jpeg',
      isText: false,
      metadata: [
        { key: 'jpg_dim', label: 'Kích thước ảnh', value: width > 0 ? `${width} × ${height} pixels` : 'Chưa quét được phân giải', editable: false },
        { key: 'jpg_brand', label: 'Phân loại EXIF', value: brand, editable: false },
        { key: 'jpg_comp', label: 'Chuẩn nén', value: 'Lossy DCT (Discrete Cosine Transform)', editable: false }
      ],
      structures,
      embeddedItems: [
        { id: 'embed_jpg_0', name: 'Ảnh nguồn JPEG', type: 'image', offset: 0, size, details: width > 0 ? `${width}×${height} JPG` : 'JPEG Image File' }
      ],
      detectedFeatures: { images: true, audio: false, video: false, text: false, tables: false, resources: false }
    };
  }
};

// 3. MP3 Audio Parser Plugin
const MP3Parser: FileParserPlugin = {
  id: 'mp3',
  name: 'MP3 Audio Parser',
  detect: (h) => (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) || (h[0] === 0xFF && (h[1] & 0xE0) === 0xE0),
  parse: async (h, file, size) => {
    let version = 'ID3v1 / No tags';
    let title = 'Không xác định';
    let artist = 'Không xác định';
    let album = 'Không xác định';

    if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) {
      const majorVersion = h[3];
      version = `ID3v2.${majorVersion}`;

      // Seek frames in header block
      const headerStr = decodeASCII(h, 10, 512);
      const titleMatch = headerStr.match(/TIT2\x00\x00\x00([^\x00]+)/) || headerStr.match(/TIT2([^\x00]{4,20})/);
      const artistMatch = headerStr.match(/TPE1\x00\x00\x00([^\x00]+)/) || headerStr.match(/TPE1([^\x00]{4,20})/);
      const albumMatch = headerStr.match(/TALB\x00\x00\x00([^\x00]+)/) || headerStr.match(/TALB([^\x00]{4,20})/);

      if (titleMatch) title = titleMatch[1].replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
      if (artistMatch) artist = artistMatch[1].replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
      if (albumMatch) album = albumMatch[1].replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
    }

    const structures: ParsedStructure[] = [
      { name: 'Thẻ Metadata ID3v2 (ID3 Tag Block)', start: 0, end: Math.min(size, 2048), type: 'metadata', description: 'Thông tin bổ sung về tựa đề, ca sĩ, album nghệ thuật.' }
    ];

    if (size > 2048) {
      structures.push({ name: 'Dữ liệu âm thanh nén MPEG Audio Frames', start: 2048, end: size, type: 'data', description: 'Các khung âm thanh MP3 chứa phổ tần số' });
    }

    return {
      formatName: 'MP3 (MPEG Layer 3 Audio)',
      mimeType: 'audio/mpeg',
      isText: false,
      metadata: [
        { key: 'mp3_ver', label: 'Phiên bản Thẻ ID3', value: version, editable: false },
        { key: 'mp3_title', label: 'Tên bài hát (Title)', value: title, editable: true },
        { key: 'mp3_artist', label: 'Nghệ sĩ (Artist)', value: artist, editable: true },
        { key: 'mp3_album', label: 'Album', value: album, editable: true }
      ],
      structures,
      embeddedItems: [
        { id: 'embed_audio_0', name: 'Âm thanh MP3 chính', type: 'audio', offset: 0, size, details: `${artist} - ${title}` }
      ],
      detectedFeatures: { images: false, audio: true, video: false, text: false, tables: false, resources: false }
    };
  }
};

// 4. MP4 Video Parser Plugin
const MP4Parser: FileParserPlugin = {
  id: 'mp4',
  name: 'MP4 Video Parser',
  detect: (h) => h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70,
  parse: async (h, file, size) => {
    const brandCode = decodeASCII(h, 8, 4);
    
    const structures: ParsedStructure[] = [
      { name: 'Hộp ftyp (File Type Box)', start: 0, end: 16 + (h[3] || 0), type: 'header', description: 'Xác định định dạng, phiên bản và các hãng tương thích' }
    ];

    if (size > 1000) {
      structures.push({ name: 'Hộp mdat (Media Data Box)', start: 100, end: size - 500, type: 'data', description: 'Chứa luồng âm thanh/hình ảnh thô' });
      structures.push({ name: 'Hộp moov (Movie Box)', start: size - 500, end: size, type: 'index', description: 'Chủ đề lục, vị trí mấu chốt, phân cảnh và đồng bộ hóa' });
    }

    return {
      formatName: 'MP4 (MPEG-4 Part 14 Video)',
      mimeType: 'video/mp4',
      isText: false,
      metadata: [
        { key: 'mp4_brand', label: 'Hãng tương thích (Brand)', value: brandCode || 'mp42 / isom', editable: false },
        { key: 'mp4_codec', label: 'Định dạng mã hóa', value: 'H.264 (AVC) / AAC Audio', editable: false }
      ],
      structures,
      embeddedItems: [
        { id: 'embed_video_0', name: 'Luồng Video MP4', type: 'video', offset: 0, size, details: `Video Container (Format ${brandCode})` }
      ],
      detectedFeatures: { images: false, audio: false, video: true, text: false, tables: false, resources: false }
    };
  }
};

// 5. PDF Parser Plugin
const PDFParser: FileParserPlugin = {
  id: 'pdf',
  name: 'PDF Document Parser',
  detect: (h) => h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46,
  parse: async (h, file, size) => {
    const version = decodeASCII(h, 0, 8);
    
    const structures: ParsedStructure[] = [
      { name: 'Dòng mở đầu PDF Header', start: 0, end: 15, type: 'header', description: `Chữ ký phiên bản tài liệu PDF (${version})` },
      { name: 'Cây đối tượng PDF Body Objects', start: 15, end: size - 256, type: 'data', description: 'Chứa các trang, phông chữ, văn bản, vector, hình ảnh' }
    ];

    if (size > 256) {
      structures.push({ name: 'Bảng tham chiếu xref (Cross-Reference Table)', start: size - 256, end: size - 32, type: 'index', description: 'Địa chỉ tìm kiếm byte trực tiếp cho mọi đối tượng' });
      structures.push({ name: 'Phần kết tệp Trailer / %%EOF', start: size - 32, end: size, type: 'footer', description: 'Địa chỉ mốc bắt đầu xref và đánh dấu hoàn thành' });
    }

    return {
      formatName: 'PDF (Portable Document Format)',
      mimeType: 'application/pdf',
      isText: false,
      metadata: [
        { key: 'pdf_ver', label: 'Phiên bản đặc tả', value: version, editable: false },
        { key: 'pdf_security', label: 'Bảo mật/Mã hóa', value: 'Standard RC4 / AES (Chưa mã hóa mật khẩu)', editable: false }
      ],
      structures,
      embeddedItems: [],
      detectedFeatures: { images: false, audio: false, video: false, text: false, tables: false, resources: false }
    };
  }
};

// 6. JSON Data Parser Plugin
const JSONParser: FileParserPlugin = {
  id: 'json',
  name: 'JSON Structured Parser',
  detect: (h, name) => name.endsWith('.json') || (h[0] === 123 || h[0] === 91), // '{' or '['
  parse: async (h, file, size) => {
    return {
      formatName: 'JSON (Structured Data)',
      mimeType: 'application/json',
      isText: true,
      metadata: [
        { key: 'json_type', label: 'Đặc tính JSON', value: 'JavaScript Object Notation', editable: false },
        { key: 'json_valid', label: 'Xác thực cấu trúc', value: 'Thực thể văn bản có thể chỉnh sửa', editable: false }
      ],
      structures: [
        { name: 'Bảng kê khai JSON', start: 0, end: size, type: 'data', description: 'Toàn bộ nội dung văn bản JSON' }
      ],
      embeddedItems: [],
      detectedFeatures: { images: false, audio: false, video: false, text: true, tables: false, resources: false }
    };
  }
};

// 7. XML / HTML Parser Plugin
const XMLParser: FileParserPlugin = {
  id: 'xml',
  name: 'XML / Markup Parser',
  detect: (h, name) => name.endsWith('.xml') || name.endsWith('.html') || (h[0] === 60 && h[1] === 63), // '<?' or '<'
  parse: async (h, file, size) => {
    return {
      formatName: 'XML / Markup Document',
      mimeType: 'application/xml',
      isText: true,
      metadata: [
        { key: 'xml_type', label: 'Đặc tính thẻ', value: 'Extensible Markup Language', editable: false }
      ],
      structures: [
        { name: 'Văn bản mã XML/HTML', start: 0, end: size, type: 'data', description: 'Nội dung chứa các Node dạng Tag và Element' }
      ],
      embeddedItems: [],
      detectedFeatures: { images: false, audio: false, video: false, text: true, tables: false, resources: false }
    };
  }
};

// 8. SQLite Parser Plugin
const SQLiteParser: FileParserPlugin = {
  id: 'sqlite',
  name: 'SQLite Database Parser',
  detect: (h) => h[0] === 0x53 && h[1] === 0x51 && h[2] === 0x4C && h[3] === 0x69 && h[4] === 0x74, // 'SQLite'
  parse: async (h, file, size) => {
    let pageSize = 0;
    if (h.length >= 18) {
      pageSize = (h[16] << 8) | h[17];
    }
    
    const structures: ParsedStructure[] = [
      { name: 'SQLite Header Signature', start: 0, end: 16, type: 'header', description: 'Xác thực chữ ký "SQLite format 3\0"' },
      { name: 'Cấu hình trang cơ sở dữ liệu', start: 16, end: 100, type: 'metadata', description: 'Kích thước trang, phiên bản tệp, bộ đếm sửa đổi' }
    ];

    if (size > 100) {
      structures.push({ name: 'Bảng SQLite Master & Nhóm dữ liệu', start: 100, end: size, type: 'data', description: 'Chứa cấu trúc bảng B-Tree, bảng ánh xạ và các bản ghi' });
    }

    return {
      formatName: 'SQLite 3 (Relational Database)',
      mimeType: 'application/x-sqlite3',
      isText: false,
      metadata: [
        { key: 'sql_page', label: 'Kích thước Trang (Page)', value: pageSize > 0 ? `${pageSize} bytes` : '4096 bytes', editable: false },
        { key: 'sql_driver', label: 'Công cụ lưu trữ', value: 'B-Tree Database Engine', editable: false }
      ],
      structures,
      embeddedItems: [],
      detectedFeatures: { images: false, audio: false, video: false, text: false, tables: true, resources: false }
    };
  }
};

// 9. ZIP / APK / OBB Plugin
const ZIPParser: FileParserPlugin = {
  id: 'zip',
  name: 'ZIP / Package Archive Parser',
  detect: (h) => h[0] === 0x50 && h[1] === 0x4B && h[2] === 0x03 && h[3] === 0x04,
  parse: async (h, file, size) => {
    let typeName = 'ZIP Compressed Archive';
    let isApk = file.name.endsWith('.apk');
    let isObb = file.name.endsWith('.obb');
    
    if (isApk) typeName = 'APK Android Application Package';
    else if (isObb) typeName = 'OBB Android Expansion Package';

    const structures: ParsedStructure[] = [
      { name: 'Header Lập File Cục Bộ (Local File Header)', start: 0, end: 30, type: 'header', description: 'Bắt đầu một bản ghi lưu trữ cục bộ (Chữ ký PK\x03\x04)' }
    ];

    if (size > 100) {
      structures.push({ name: 'Nội dung nén đóng gói', start: 30, end: size - 22, type: 'data', description: 'Nhóm các tập tin nén xếp tiếp nhau' });
      structures.push({ name: 'Chỉ mục thư mục trung tâm (EOCD)', start: size - 22, end: size, type: 'footer', description: 'Dấu hiệu kết thúc và vị trí thư mục gốc lưu trữ' });
    }

    return {
      formatName: typeName,
      mimeType: 'application/zip',
      isText: false,
      metadata: [
        { key: 'zip_enc', label: 'Thuật toán mã hóa', value: 'ZipCrypto / AES-256', editable: false },
        { key: 'zip_target', label: 'Thiết bị hỗ trợ', value: isApk ? 'Android OS (Universal)' : 'Mọi thiết bị', editable: false }
      ],
      structures,
      embeddedItems: [],
      detectedFeatures: { images: false, audio: false, video: false, text: false, tables: false, resources: true }
    };
  }
};

// 10. ELF / Executable Linux Plugin
const ELFParser: FileParserPlugin = {
  id: 'elf',
  name: 'ELF Bin / Shared Object Parser',
  detect: (h) => h[0] === 0x7F && h[1] === 0x45 && h[2] === 0x4C && h[3] === 0x46,
  parse: async (h, file, size) => {
    const archCode = h[4]; // 1 = 32bit, 2 = 64bit
    const arch = archCode === 2 ? '64-bit Executable' : '32-bit Executable';
    const isSo = file.name.endsWith('.so');

    return {
      formatName: isSo ? 'Shared Object Library (.so)' : 'ELF Linux Bin Executable',
      mimeType: 'application/x-elf',
      isText: false,
      metadata: [
        { key: 'elf_arch', label: 'Kiến trúc nhị phân', value: arch, editable: false },
        { key: 'elf_endian', label: 'Endianness', value: h[5] === 1 ? 'Little Endian' : 'Big Endian', editable: false }
      ],
      structures: [
        { name: 'ELF ELF Header', start: 0, end: 64, type: 'header', description: 'Xác thực thông tin cấu hình nạp nhị phân ELF' }
      ],
      embeddedItems: [],
      detectedFeatures: { images: false, audio: false, video: false, text: false, tables: false, resources: false }
    };
  }
};

// 11. EXE / DLL Windows Executable Plugin
const EXEDLLParser: FileParserPlugin = {
  id: 'exedll',
  name: 'Windows PE Executable Parser',
  detect: (h) => h[0] === 0x4D && h[1] === 0x5A, // 'MZ'
  parse: async (h, file, size) => {
    const isDll = file.name.endsWith('.dll');
    
    return {
      formatName: isDll ? 'Thư viện liên kết động Windows DLL' : 'Tập tin thực thi Windows (.EXE)',
      mimeType: 'application/x-msdownload',
      isText: false,
      metadata: [
        { key: 'pe_sub', label: 'Cấu trúc PE', value: 'Portable Executable 32/64-bit Format', editable: false },
        { key: 'pe_env', label: 'Hỗ trợ máy ảo', value: 'Windows Subsystem OS', editable: false }
      ],
      structures: [
        { name: 'Header DOS MZ (Signature)', start: 0, end: 64, type: 'header', description: 'Mã khởi đầu DOS cũ để kiểm tra tương thích ngược' },
        { name: 'Đoạn mã DOS Stub cũ', start: 64, end: 128, type: 'metadata', description: 'In thông báo lỗi: "This program cannot be run in DOS mode"' }
      ],
      embeddedItems: [],
      detectedFeatures: { images: false, audio: false, video: false, text: false, tables: false, resources: true }
    };
  }
};

// 12. Unity Asset Bundle Parser Plugin
const UnityParser: FileParserPlugin = {
  id: 'unity',
  name: 'Unity AssetBundle Parser',
  detect: (h, name) => name.endsWith('.unity3d') || name.endsWith('.assets') || decodeASCII(h, 0, 7) === 'UnityFS',
  parse: async (h, file, size) => {
    const signature = decodeASCII(h, 0, 7);
    
    return {
      formatName: 'Unity AssetBundle / Scene Resource',
      mimeType: 'application/octet-stream',
      isText: false,
      metadata: [
        { key: 'unity_sig', label: 'Chữ ký Unity', value: signature || 'Unity Raw Assets', editable: false },
        { key: 'unity_engine', label: 'Nền tảng phát triển', value: 'Unity Game Engine Resource Bundle', editable: false }
      ],
      structures: [
        { name: 'Unity Bundle Header', start: 0, end: 128, type: 'header', description: 'Chứa phiên bản nén, kích thước mục lục tệp tin Unity' }
      ],
      embeddedItems: [],
      detectedFeatures: { images: false, audio: false, video: false, text: false, tables: false, resources: true }
    };
  }
};

// 13. Lua Bytecode Parser Plugin
const LuaParser: FileParserPlugin = {
  id: 'lua',
  name: 'Lua Script / Bytecode Parser',
  detect: (h, name) => name.endsWith('.lua') || (h[0] === 0x1B && h[1] === 0x4C && h[2] === 0x75 && h[3] === 0x61), // '\x1bLua'
  parse: async (h, file, size) => {
    const isCompiled = h[0] === 0x1B;
    
    return {
      formatName: isCompiled ? 'Tập tin Lua Bytecode đã biên dịch' : 'Kịch bản mã nguồn Lua Script',
      mimeType: 'text/x-lua',
      isText: !isCompiled,
      metadata: [
        { key: 'lua_mode', label: 'Phân loại Lua', value: isCompiled ? 'Compiled Bytecode Binary' : 'Plain Text Script Source', editable: false }
      ],
      structures: [
        { name: 'Header biên dịch Lua / Mã nguồn', start: 0, end: isCompiled ? 12 : 32, type: 'header', description: 'Phiên bản máy ảo Lua và cấu hình số học' }
      ],
      embeddedItems: [],
      detectedFeatures: { images: false, audio: false, video: false, text: !isCompiled, tables: false, resources: false }
    };
  }
};

// 14. ISO 9660 / UDF Optical Disk Image Parser
const ISOParser: FileParserPlugin = {
  id: 'iso',
  name: 'ISO 9660 Disk Image Parser',
  detect: (h, name) => name.endsWith('.iso') || name.endsWith('.img'),
  parse: async (h, file, size) => {
    // Read PVD at 0x8000 (32768)
    const pvdOffset = 32768;
    let volumeLabel = 'Unknown ISO';
    let systemId = 'Unknown System';
    let rootExtent = 0;
    let rootSize = 0;
    
    if (size > pvdOffset + 256) {
      const pvdBlob = file.slice(pvdOffset, pvdOffset + 256);
      const pvdBuffer = await pvdBlob.arrayBuffer();
      const pvd = new Uint8Array(pvdBuffer);
      
      // Check for 'CD001' signature at 0x8001
      if (pvd[1] === 0x43 && pvd[2] === 0x44 && pvd[3] === 0x30 && pvd[4] === 0x30 && pvd[5] === 0x31) {
        systemId = decodeASCII(pvd, 8, 32);
        volumeLabel = decodeASCII(pvd, 40, 32);
        
        // Root Directory Record is at offset 156 in PVD
        // Extent location (LBA) is at offset 2 in Directory Record (which is 156+2 = 158)
        // Data length is at offset 10 in Directory Record (which is 156+10 = 166)
        // Values are stored in both Little-Endian and Big-Endian (8 bytes total)
        // We read the first 4 bytes (Little-Endian)
        const rootRecordOffset = 156;
        rootExtent = pvd[rootRecordOffset + 2] | (pvd[rootRecordOffset + 3] << 8) | (pvd[rootRecordOffset + 4] << 16) | (pvd[rootRecordOffset + 5] << 24);
        rootSize = pvd[rootRecordOffset + 10] | (pvd[rootRecordOffset + 11] << 8) | (pvd[rootRecordOffset + 12] << 16) | (pvd[rootRecordOffset + 13] << 24);
      }
    }

    const structures: ParsedStructure[] = [
      { name: 'System Area', start: 0, end: 32768, type: 'header', description: 'Reserved area for boot records or empty padding' },
      { name: 'Primary Volume Descriptor (PVD)', start: 32768, end: 34816, type: 'metadata', description: 'Main metadata block describing the ISO volume' },
      { name: 'Volume Descriptor Set', start: 32768, end: 65536, type: 'metadata', description: 'Contains PVD, SVD, and Boot Records describing the disk layout' }
    ];

    if (rootExtent > 0) {
      structures.push({ 
        name: 'Root Directory Table', 
        start: rootExtent * 2048, 
        end: rootExtent * 2048 + rootSize, 
        type: 'index', 
        description: 'The root directory of the filesystem' 
      });
    }

    if (size > 65536) {
      structures.push({ name: 'Data Area (Filesystem Payload)', start: 65536, end: size, type: 'data', description: 'Contains actual directory structures and file data' });
    }

    return {
      formatName: 'ISO 9660 / UDF Image',
      mimeType: 'application/x-iso9660-image',
      isText: false,
      metadata: [
        { key: 'iso_label', label: 'Volume Label', value: volumeLabel.trim(), editable: false },
        { key: 'iso_system', label: 'System ID', value: systemId.trim(), editable: false },
        { key: 'iso_root_lba', label: 'Root Directory LBA', value: `0x${rootExtent.toString(16).toUpperCase()}`, editable: false },
        { key: 'iso_standard', label: 'Filesystem Standard', value: 'ISO 9660 / ECMA-119', editable: false }
      ],
      structures,
      embeddedItems: [],
      detectedFeatures: { images: false, audio: false, video: false, text: false, tables: false, resources: true }
    };
  }
};

// 15. HEIC / HEIF Image Parser
const HEIFParser: FileParserPlugin = {
  id: 'heif',
  name: 'HEIF / HEIC Image Parser',
  detect: (h) => (h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70) && 
                (decodeASCII(h, 8, 4).includes('heic') || decodeASCII(h, 8, 4).includes('mif1')),
  parse: async (h, file, size) => {
    return {
      formatName: 'HEIC / HEIF Image (High Efficiency)',
      mimeType: 'image/heic',
      isText: false,
      metadata: [
        { key: 'heif_enc', label: 'Codec', value: 'HEVC / H.265 (High Efficiency)', editable: false },
        { key: 'heif_ver', label: 'Format version', value: 'MIF1 / HEIC Standard', editable: false }
      ],
      structures: [
        { name: 'ftyp Box', start: 0, end: 12, type: 'header', description: 'File type and compatibility markers' }
      ],
      embeddedItems: [
        { id: 'embed_heic_0', name: 'High Efficiency Image', type: 'image', offset: 0, size, details: 'HEIF Data Container' }
      ],
      detectedFeatures: { images: true, audio: false, video: false, text: false, tables: false, resources: false }
    };
  }
};

// List of all registered plugins (Extensible Plugin System)
export const PARSER_PLUGINS: FileParserPlugin[] = [
  PNGParser,
  JPEGParser,
  MP3Parser,
  MP4Parser,
  PDFParser,
  JSONParser,
  XMLParser,
  SQLiteParser,
  ZIPParser,
  ELFParser,
  EXEDLLParser,
  UnityParser,
  LuaParser,
  ISOParser,
  HEIFParser
];

// Fallback: Generic Binary Parser
export async function getGenericBinaryParser(file: File, size: number): Promise<ParserResult> {
  const structures: ParsedStructure[] = [
    { 
      name: 'Vùng Đầu Tệp (Header Block)', 
      start: 0, 
      end: Math.min(size, 64), 
      type: 'header', 
      description: 'Chứa thông tin nhận diện sơ bộ và mốc địa chỉ.' 
    }
  ];

  if (size > 128) {
    structures.push({
      name: 'Thân Khối Dữ Liệu Thô (Raw Payload Block)',
      start: Math.min(size, 64),
      end: Math.max(64, size - 128),
      type: 'data',
      description: 'Dữ liệu nhị phân không thuộc định dạng được nhận dạng đặc thù.'
    });
    structures.push({
      name: 'Vùng Cuối Tệp (Footer Block)',
      start: Math.max(64, size - 128),
      end: size,
      type: 'footer',
      description: 'Chứa byte trống hoặc chữ ký bổ sung của ứng dụng.'
    });
  }

  return {
    formatName: 'Generic Binary File / RAW',
    mimeType: 'application/octet-stream',
    isText: false,
    metadata: [
      { key: 'raw_desc', label: 'Ghi chú', value: 'Tệp nhị phân thô, chưa có bộ parser chuyên biệt', editable: false }
    ],
    structures,
    embeddedItems: [],
    detectedFeatures: { images: false, audio: false, video: false, text: false, tables: false, resources: false }
  };
}

interface DetectedPattern {
  name: string;
  ext: string;
  offset: number;
  magicHex: string;
  description: string;
  type: 'image' | 'audio' | 'video' | 'text' | 'document' | 'structure' | 'database' | 'compressed';
}

export function scanForSignatures(bytes: Uint8Array): DetectedPattern[] {
  const patterns: { name: string; ext: string; magic: number[]; desc: string; type: DetectedPattern['type'] }[] = [
    { name: 'PNG Image', ext: 'png', magic: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], desc: 'Portable Network Graphics image signature', type: 'image' },
    { name: 'JPEG Image', ext: 'jpg', magic: [0xFF, 0xD8, 0xFF], desc: 'Joint Photographic Experts Group image SOI marker', type: 'image' },
    { name: 'PDF Document', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46], desc: 'Adobe Portable Document Format header', type: 'document' },
    { name: 'ZIP Archive', ext: 'zip', magic: [0x50, 0x4B, 0x03, 0x04], desc: 'ZIP compressed file archive local file header', type: 'compressed' },
    { name: 'ELF Executable', ext: 'elf', magic: [0x7F, 0x45, 0x4C, 0x46], desc: 'Linux Executable and Linkable Format', type: 'structure' },
    { name: 'SQLite Database', ext: 'sqlite', magic: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65], desc: 'SQLite database signature', type: 'database' },
    { name: 'Windows MZ Executable', ext: 'exe', magic: [0x4D, 0x5A], desc: 'MZ DOS Stub Header / PE Executable', type: 'structure' },
    { name: 'GIF Image', ext: 'gif', magic: [0x47, 0x49, 0x46, 0x38], desc: 'Graphics Interchange Format image', type: 'image' },
    { name: 'RAR Archive', ext: 'rar', magic: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], desc: 'RAR Compressed Archive', type: 'compressed' },
    { name: '7z Archive', ext: '7z', magic: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], desc: '7-Zip Compressed Archive', type: 'compressed' },
    { name: 'Java Class', ext: 'class', magic: [0xCA, 0xFE, 0xBA, 0xBE], desc: 'Java Bytecode Class', type: 'structure' },
    { name: 'MP3 Audio (ID3v2)', ext: 'mp3', magic: [0x49, 0x44, 0x33], desc: 'MP3 Audio File ID3 Tag', type: 'audio' }
  ];

  const results: DetectedPattern[] = [];
  
  for (const pat of patterns) {
    const len = pat.magic.length;
    for (let i = 0; i <= bytes.length - len; i++) {
      let match = true;
      for (let j = 0; j < len; j++) {
        if (bytes[i + j] !== pat.magic[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        results.push({
          name: pat.name,
          ext: pat.ext,
          offset: i,
          magicHex: pat.magic.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
          description: pat.desc,
          type: pat.type
        });
      }
    }
  }
  
  return results;
}

export async function runRawScanMode(file: File, header: Uint8Array, warningMessage: string): Promise<ParserResult> {
  const size = file.size;
  const detectedSignatures = scanForSignatures(header);
  
  const structures: ParsedStructure[] = [
    { 
      name: 'Vùng Đầu Tệp Thô (Raw Header Block)', 
      start: 0, 
      end: Math.min(size, 64), 
      type: 'header', 
      description: 'Chứa thông tin nhận diện sơ bộ của chế độ Quét thô (Raw Scan Mode).' 
    }
  ];

  if (size > 128) {
    structures.push({
      name: 'Thân Khối Dữ Liệu Thô (Raw Payload Block)',
      start: Math.min(size, 64),
      end: Math.max(64, size - 128),
      type: 'data',
      description: 'Dữ liệu nhị phân quét thô bằng các chữ ký tự động.'
    });
    structures.push({
      name: 'Vùng Cuối Tệp Thô (Raw Footer Block)',
      start: Math.max(64, size - 128),
      end: size,
      type: 'footer',
      description: 'Phần kết thúc của tệp phân tích thô.'
    });
  }

  // Add detected signatures into common structures!
  detectedSignatures.forEach((sig, idx) => {
    structures.push({
      name: `Chữ ký ${sig.name} (Signature)`,
      start: sig.offset,
      end: sig.offset + sig.magicHex.split(' ').length,
      type: 'marker',
      description: `${sig.description} phát hiện ở địa chỉ byte offset 0x${sig.offset.toString(16).toUpperCase()}`
    });
  });

  const embeddedItems: ParsedItem[] = detectedSignatures.map((sig, idx) => ({
    id: `raw_embed_${sig.ext}_${idx}`,
    name: `Embedded ${sig.name}`,
    type: sig.type,
    offset: sig.offset,
    size: Math.min(size - sig.offset, 4096), // Show some initial size preview
    details: `${sig.description} found at offset 0x${sig.offset.toString(16).toUpperCase()}`
  }));

  // Detect features from scanned signatures
  const detectedFeatures = {
    images: detectedSignatures.some(s => s.type === 'image'),
    audio: detectedSignatures.some(s => s.type === 'audio'),
    video: detectedSignatures.some(s => s.type === 'video'),
    text: false,
    tables: detectedSignatures.some(s => s.type === 'database'),
    resources: detectedSignatures.length > 0
  };

  return {
    formatName: detectedSignatures.length > 0 ? `Raw Scan (${detectedSignatures[0].name} detected)` : 'Generic Binary File / RAW',
    mimeType: detectedSignatures.length > 0 ? `application/x-${detectedSignatures[0].ext}` : 'application/octet-stream',
    isText: false,
    metadata: [
      { key: 'raw_mode', label: 'Chế độ phân tích', value: 'Quét Thô (Raw Scan Mode)', editable: false },
      { key: 'raw_warn', label: 'Cảnh báo Parser', value: warningMessage, editable: false },
      { key: 'detected_pats', label: 'Số chữ ký phát hiện', value: `${detectedSignatures.length} mẫu chữ ký`, editable: false }
    ],
    structures,
    embeddedItems,
    detectedFeatures,
    isRawScanMode: true,
    rawScanWarning: warningMessage
  };
}

/**
 * Automagically selects the matching parser, fallback to generic binary / Raw Scan Mode
 * Every parser is executed in a sandbox try-catch block so that exceptions do not halt analysis.
 */
export async function runSmartParser(file: File, header: Uint8Array): Promise<ParserResult> {
  const size = file.size;
  const name = file.name.toLowerCase();
  
  for (const plugin of PARSER_PLUGINS) {
    let matches = false;
    try {
      matches = plugin.detect(header, name);
    } catch (detectErr) {
      console.warn(`Smart parser detector ${plugin.name} failed:`, detectErr);
      matches = false;
    }

    if (matches) {
      try {
        return await plugin.parse(header, file, size);
      } catch (err) {
        console.warn(`Smart parser ${plugin.name} failed during parse, falling back to Raw Scan Mode:`, err);
        return await runRawScanMode(file, header, `Bộ phân tích chuyên biệt ${plugin.name} gặp lỗi cấu trúc: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  
  // No matching parser found, switch to Raw Scan Mode!
  return await runRawScanMode(file, header, 'Không tìm thấy bộ phân tích cấu trúc cụ thể cho định dạng này.');
}
