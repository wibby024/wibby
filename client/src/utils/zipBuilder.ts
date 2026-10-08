/**
 * Zero-Dependency Pure Web Crypto / Standard PKZip Generator
 * Generates valid standard PKZip archive files directly in the browser.
 * Preserves subfolders, handles collision-avoidance renaming, and triggers direct download.
 */

// CRC-32 Lookup Table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

export function calculateCRC32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipFileEntry {
  path: string; // e.g. "Photos/vacation.jpg"
  data: Uint8Array;
  lastModified?: Date;
}

export class ZipBuilder {
  private entries: ZipFileEntry[] = [];
  private pathSet = new Set<string>();

  /**
   * Adds a file to the archive, ensuring collision-free paths.
   */
  addFile(folder: string, fileName: string, data: Uint8Array, lastModified?: Date): string {
    const cleanFolder = folder.replace(/[\\/]+$/, '').trim();
    let sanitizedName = fileName.replace(/[<>:"/\\|?*]/g, '_').trim() || 'file';

    // Separate base name and extension for numbering
    const lastDot = sanitizedName.lastIndexOf('.');
    const baseName = lastDot > 0 ? sanitizedName.slice(0, lastDot) : sanitizedName;
    const ext = lastDot > 0 ? sanitizedName.slice(lastDot) : '';

    let candidatePath = cleanFolder ? `${cleanFolder}/${sanitizedName}` : sanitizedName;
    let counter = 2;

    // Collision avoidance: file.jpg -> file (2).jpg -> file (3).jpg
    while (this.pathSet.has(candidatePath.toLowerCase())) {
      const candidateName = `${baseName} (${counter})${ext}`;
      candidatePath = cleanFolder ? `${cleanFolder}/${candidateName}` : candidateName;
      counter++;
    }

    this.pathSet.add(candidatePath.toLowerCase());
    this.entries.push({
      path: candidatePath,
      data,
      lastModified: lastModified || new Date()
    });

    return candidatePath;
  }

  /**
   * Builds the final Uint8Array representing a fully standard PKZip archive.
   */
  build(): Uint8Array {
    const encoder = new TextEncoder();
    const localHeaders: Uint8Array[] = [];
    const centralHeaders: Uint8Array[] = [];
    let currentOffset = 0;

    for (const entry of this.entries) {
      const pathBytes = encoder.encode(entry.path);
      const crc = calculateCRC32(entry.data);
      const size = entry.data.length;

      // DOS date / time
      const date = entry.lastModified || new Date();
      const dosTime =
        ((date.getHours() & 0x1f) << 11) |
        ((date.getMinutes() & 0x3f) << 5) |
        ((Math.floor(date.getSeconds() / 2)) & 0x1f);
      const dosDate =
        (((date.getFullYear() - 1980) & 0x7f) << 9) |
        (((date.getMonth() + 1) & 0x0f) << 5) |
        (date.getDate() & 0x1f);

      // Local Header: 30 bytes + pathBytes.length + data.length
      const localHeader = new Uint8Array(30 + pathBytes.length + size);
      const lv = new DataView(localHeader.buffer);

      lv.setUint32(0, 0x04034b50, true); // Local file header signature
      lv.setUint16(4, 20, true);         // Version needed to extract (2.0)
      lv.setUint16(6, 0x0800, true);     // General purpose flag (Bit 11: UTF-8)
      lv.setUint16(8, 0, true);          // Compression method: 0 = Store (Uncompressed)
      lv.setUint16(10, dosTime, true);   // Mod time
      lv.setUint16(12, dosDate, true);   // Mod date
      lv.setUint32(14, crc, true);       // CRC-32
      lv.setUint32(18, size, true);      // Compressed size
      lv.setUint32(22, size, true);      // Uncompressed size
      lv.setUint16(26, pathBytes.length, true); // Filename length
      lv.setUint16(28, 0, true);         // Extra field length

      localHeader.set(pathBytes, 30);
      localHeader.set(entry.data, 30 + pathBytes.length);
      localHeaders.push(localHeader);

      // Central Directory Header: 46 bytes + pathBytes.length
      const centralHeader = new Uint8Array(46 + pathBytes.length);
      const cv = new DataView(centralHeader.buffer);

      cv.setUint32(0, 0x02014b50, true); // Central directory file header signature
      cv.setUint16(4, 20, true);         // Version made by
      cv.setUint16(6, 20, true);         // Version needed to extract
      cv.setUint16(8, 0x0800, true);     // General purpose flag (UTF-8)
      cv.setUint16(10, 0, true);         // Compression method: Store
      cv.setUint16(12, dosTime, true);   // Mod time
      cv.setUint16(14, dosDate, true);   // Mod date
      cv.setUint32(16, crc, true);       // CRC-32
      cv.setUint32(20, size, true);      // Compressed size
      cv.setUint32(24, size, true);      // Uncompressed size
      cv.setUint16(28, pathBytes.length, true); // Filename length
      cv.setUint16(30, 0, true);         // Extra field length
      cv.setUint16(32, 0, true);         // File comment length
      cv.setUint16(34, 0, true);         // Disk number start
      cv.setUint16(36, 0, true);         // Internal file attributes
      cv.setUint32(38, 0, true);         // External file attributes
      cv.setUint32(42, currentOffset, true); // Relative offset of local header

      centralHeader.set(pathBytes, 46);
      centralHeaders.push(centralHeader);

      currentOffset += localHeader.length;
    }

    const centralDirOffset = currentOffset;
    let centralDirSize = 0;
    for (const ch of centralHeaders) {
      centralDirSize += ch.length;
    }

    // End of Central Directory Record (EOCD): 22 bytes
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); // EOCD signature
    ev.setUint16(4, 0, true);          // Number of this disk
    ev.setUint16(6, 0, true);          // Disk with central directory
    ev.setUint16(8, this.entries.length, true);  // Total entries on this disk
    ev.setUint16(10, this.entries.length, true); // Total entries
    ev.setUint32(12, centralDirSize, true);      // Central directory size
    ev.setUint32(16, centralDirOffset, true);    // Central directory offset
    ev.setUint16(20, 0, true);                   // Comment length

    // Assemble all parts into single contiguous buffer
    const totalLength = centralDirOffset + centralDirSize + eocd.length;
    const finalZip = new Uint8Array(totalLength);

    let writePos = 0;
    for (const lh of localHeaders) {
      finalZip.set(lh, writePos);
      writePos += lh.length;
    }
    for (const ch of centralHeaders) {
      finalZip.set(ch, writePos);
      writePos += ch.length;
    }
    finalZip.set(eocd, writePos);

    return finalZip;
  }

  /**
   * Builds the archive as a Blob and triggers automatic browser download.
   */
  download(zipFileName = 'Wibby-Media-Export.zip'): void {
    const zipBytes = this.build();
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = zipFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }
}
