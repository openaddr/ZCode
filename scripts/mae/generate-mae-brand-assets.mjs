#!/usr/bin/env node
/**
 * mae 品牌资产生成器(#12,specs/mae/versioning-branding.md)。
 *
 * 占位级方案:以官方图标为底做青色调 duotone 映射(暗端→深青、亮端→薄荷青),
 * 覆盖安装器图标与打包所需全部尺寸,输出集中到 packages/desktop/build/mae/(与上游资产不混放)。
 * 正式图标资产待用户提供:替换本脚本或直接替换 build/mae/ 下同名文件即可。
 *
 * 纯 Node 实现(node:zlib),不引入 sharp 等原生依赖;PNG 仅支持本仓资产实际使用的形态
 * (8-bit、非隔行、colortype 0/2/3/4/6),ICO/ICNS 逐条目重着色后重建容器。
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopBuildDir = resolve(scriptDir, "../../packages/desktop/build");
const outDir = join(desktopBuildDir, "mae");

/** duotone 渐变端点:暗端深青、亮端薄荷青(青色调占位,与官方黑白形成明确视觉区分)。 */
const MAE_BRAND_SHADOW = [7, 46, 42];
const MAE_BRAND_HIGHLIGHT = [140, 247, 231];

// ── PNG 编解码(最小实现)──────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(...buffers) {
  let c = 0xffffffff;
  for (const buffer of buffers) {
    for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** 解码 8-bit 非隔行 PNG 为 RGBA。 */
export function decodePngToRgba(buffer, label) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`[${label}] not a PNG`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idatChunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`[${label}] unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error(`[${label}] interlaced PNG unsupported`);
  const channelsByColorType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByColorType[colorType];
  if (!channels) throw new Error(`[${label}] unsupported color type ${colorType}`);
  if (colorType === 3 && !palette) throw new Error(`[${label}] palette PNG without PLTE`);

  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idatChunks));
  if (raw.length < height * (stride + 1)) throw new Error(`[${label}] truncated PNG data`);
  const unfiltered = new Uint8Array(height * stride);
  let position = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[position++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[position++];
      const left = x >= channels ? unfiltered[rowStart + x - channels] : 0;
      const up = y > 0 ? unfiltered[rowStart - stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? unfiltered[rowStart - stride + x - channels] : 0;
      let value;
      switch (filterType) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + left;
          break;
        case 2:
          value = rawByte + up;
          break;
        case 3:
          value = rawByte + ((left + up) >> 1);
          break;
        case 4:
          value = rawByte + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`[${label}] unknown filter type ${filterType}`);
      }
      unfiltered[rowStart + x] = value & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    switch (colorType) {
      case 0:
        rgba[d] = rgba[d + 1] = rgba[d + 2] = unfiltered[s];
        rgba[d + 3] = 255;
        break;
      case 2:
        rgba[d] = unfiltered[s];
        rgba[d + 1] = unfiltered[s + 1];
        rgba[d + 2] = unfiltered[s + 2];
        rgba[d + 3] = 255;
        break;
      case 3: {
        const index = unfiltered[s];
        rgba[d] = palette[index * 3];
        rgba[d + 1] = palette[index * 3 + 1];
        rgba[d + 2] = palette[index * 3 + 2];
        rgba[d + 3] = transparency && index < transparency.length ? transparency[index] : 255;
        break;
      }
      case 4:
        rgba[d] = rgba[d + 1] = rgba[d + 2] = unfiltered[s];
        rgba[d + 3] = unfiltered[s + 1];
        break;
      case 6:
        rgba[d] = unfiltered[s];
        rgba[d + 1] = unfiltered[s + 1];
        rgba[d + 2] = unfiltered[s + 2];
        rgba[d + 3] = unfiltered[s + 3];
        break;
    }
  }
  return { width, height, rgba };
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeBuffer, data));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** RGBA 编码为 8-bit RGBA PNG(filter 0)。 */
export function encodeRgbaAsPng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── duotone 着色 ──────────────────────────────────────────────────────

/** 亮度→品牌渐变映射:黑→深青、白→薄荷青,alpha 保留。 */
function applyMaeDuotone(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    const t = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) / 255;
    for (let channel = 0; channel < 3; channel++) {
      rgba[i + channel] = Math.round(
        MAE_BRAND_SHADOW[channel] + (MAE_BRAND_HIGHLIGHT[channel] - MAE_BRAND_SHADOW[channel]) * t,
      );
    }
  }
  return rgba;
}

function tintPngBuffer(buffer, label) {
  const { width, height, rgba } = decodePngToRgba(buffer, label);
  applyMaeDuotone(rgba);
  return { width, height, png: encodeRgbaAsPng(width, height, rgba) };
}

// ── ICO / ICNS 容器 ───────────────────────────────────────────────────

/** 解析 ICO 条目(仅支持 PNG 载荷条目,本仓资产满足)。 */
function parseIcoPngEntries(buffer, label) {
  const count = buffer.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + i * 16;
    const bytesInRes = buffer.readUInt32LE(entryOffset + 8);
    const imageOffset = buffer.readUInt32LE(entryOffset + 12);
    const payload = buffer.subarray(imageOffset, imageOffset + bytesInRes);
    if (!payload.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error(`[${label}] ICO entry #${i} is not PNG-encoded (unsupported)`);
    }
    entries.push(payload);
  }
  return entries;
}

function buildIcoFromPngs(pngsWithSizes) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(pngsWithSizes.length, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + pngsWithSizes.length * 16;
  for (const { size, png } of pngsWithSizes) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

/** 解析 ICNS chunk(PNG 载荷着色重建,非 PNG 载荷原样保留)。 */
function tintIcns(buffer, label) {
  if (buffer.toString("ascii", 0, 4) !== "icns") throw new Error(`[${label}] not an ICNS`);
  const totalSize = buffer.readUInt32BE(4);
  const chunks = [];
  let offset = 8;
  while (offset < totalSize) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32BE(offset + 4);
    const payload = buffer.subarray(offset + 8, offset + chunkSize);
    const tinted = payload.subarray(0, 8).equals(PNG_SIGNATURE)
      ? tintPngBuffer(payload, `${label}:${chunkType}`).png
      : payload;
    const chunk = Buffer.alloc(8);
    chunk.write(chunkType, 0, "ascii");
    chunk.writeUInt32BE(8 + tinted.length, 4);
    chunks.push(Buffer.concat([chunk, tinted]));
    offset += chunkSize;
  }
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(8 + chunks.reduce((sum, c) => sum + c.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

// ── 主流程 ────────────────────────────────────────────────────────────

const ICON_SIZES_DIR = join(desktopBuildDir, "icons");

function writeOut(relativePath, data) {
  const target = join(outDir, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
  return { file: relativePath, bytes: data.length };
}

const written = [];

// 1) 单张 PNG 资产
for (const name of [
  "icon.png",
  "icon_windows.png",
  "icon_installer.png",
  "dmg_background.png",
  "dmg_background@2x.png",
]) {
  const source = readFileSync(join(desktopBuildDir, name));
  written.push(writeOut(name, tintPngBuffer(source, name).png));
}

// 2) Linux hicolor 全尺寸
for (const name of readdirSync(ICON_SIZES_DIR).filter((n) => n.endsWith(".png"))) {
  const source = readFileSync(join(ICON_SIZES_DIR, name));
  written.push(writeOut(join("icons", name), tintPngBuffer(source, `icons/${name}`).png));
}

// 3) ICO(应用/安装器):解析条目逐张着色后按原尺寸序重建
for (const name of ["icon.ico", "icon_installer.ico"]) {
  const entries = parseIcoPngEntries(readFileSync(join(desktopBuildDir, name)), name);
  const tinted = entries.map((payload) => {
    const { width, png } = tintPngBuffer(payload, name);
    return { size: Math.max(width, 1), png };
  });
  written.push(writeOut(name, buildIcoFromPngs(tinted)));
}

// 4) ICNS(应用/DMG 安装盘):chunk 级着色重建
for (const name of ["icon.icns", "icon_installer.icns"]) {
  written.push(writeOut(name, tintIcns(readFileSync(join(desktopBuildDir, name)), name)));
}

// 汇总(供台账/PR 引用)
let totalBytes = 0;
for (const { file, bytes } of written) {
  totalBytes += bytes;
  console.log(`${file.padEnd(24)} ${(bytes / 1024).toFixed(1)} KiB`);
}
const upstreamBytes = ["icon.png", "icon.ico", "icon.icns", "icon_windows.png", "icon_installer.png", "icon_installer.ico", "icon_installer.icns", "dmg_background.png", "dmg_background@2x.png"].reduce(
  (sum, name) => sum + statSync(join(desktopBuildDir, name)).size,
  0,
);
console.log(`mae brand assets: ${written.length} files, ${(totalBytes / 1024).toFixed(1)} KiB (upstream equivalents ${(upstreamBytes / 1024).toFixed(1)} KiB) -> ${outDir}`);
