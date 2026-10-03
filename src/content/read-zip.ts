import { inflateRawSync } from "node:zlib";

/**
 * Reads every entry of a zip (a .docx is one) into memory. Test support only:
 * handles stored and deflated entries, which is all Word and python-zipfile emit.
 */
export function readZip(zip: Buffer): Map<string, Buffer> {
  const endOfCentralDir = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOfCentralDir < 0) throw new Error("Not a zip file");

  const entryCount = zip.readUInt16LE(endOfCentralDir + 10);
  let cursor = zip.readUInt32LE(endOfCentralDir + 16);
  const entries = new Map<string, Buffer>();

  for (let i = 0; i < entryCount; i++) {
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localHeader = zip.readUInt32LE(cursor + 42);
    const name = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    const dataStart =
      localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
    const raw = zip.subarray(dataStart, dataStart + compressedSize);
    if (method !== 0 && method !== 8) throw new Error(`${name}: unsupported method ${method}`);
    entries.set(name, method === 0 ? raw : inflateRawSync(raw));
  }
  return entries;
}
