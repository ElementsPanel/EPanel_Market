/**
 * 一个只做存储（STORE，不压缩）的 zip 写入器。
 *
 * 下载接口要按端打包一个版本的文件，而打包这件事在仓库里没有先例：`/files` +
 * `/file` 那套是给面板逐文件拉取的，跟这里不冲突。第三方 zip 库（archiver 等）只在
 * node_modules 里作为 nitropack 的传递依赖存在，没有写进 package.json，所以宁可自己
 * 写——产物都是 js/json 文本，不压缩也够小。
 *
 * ZIP 的字段全是小端。因为要在写本地头之前就知道 CRC 与长度，所以不设通用标志位
 * bit 3（0x0008），也就不需要数据描述符。
 */

const LOCAL_SIGNATURE = 0x04034b50
const CENTRAL_SIGNATURE = 0x02014b50
const EOCD_SIGNATURE = 0x06054b50
/** 2.0：只用 STORE 与 UTF-8 名字所需的最低版本。 */
const VERSION_NEEDED = 20
const METHOD_STORE = 0
/** bit 11：文件名按 UTF-8 解释。只有名字真的非 ASCII 时才置位。 */
const UTF8_FLAG = 0x0800
const MAX_ENTRIES = 0xffff
const MAX_SIZE = 0xffffffff

/** 反射多项式 0xEDB88320，模块加载时建一次表。 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** MS-DOS 时间戳：日期不能早于 1980，秒只有 2 秒精度。 */
function dosStamp(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time: time & 0xffff, date: day & 0xffff }
}

export interface ZipEntry {
  /** 归档内的路径，始终用 `/` 分隔。 */
  name: string
  data: Buffer
}

export function createZip(entries: ZipEntry[], now = new Date()): Buffer {
  if (entries.length > MAX_ENTRIES) throw new Error('zip 条目过多')
  const stamp = dosStamp(now)

  const parts: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const flags = /[^\x00-\x7f]/.test(entry.name) ? UTF8_FLAG : 0
    const crc = crc32(entry.data)
    const size = entry.data.byteLength

    const local = Buffer.alloc(30 + name.byteLength)
    local.writeUInt32LE(LOCAL_SIGNATURE, 0)
    local.writeUInt16LE(VERSION_NEEDED, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(METHOD_STORE, 8)
    local.writeUInt16LE(stamp.time, 10)
    local.writeUInt16LE(stamp.date, 12)
    local.writeUInt32LE(crc, 14)
    // STORE：压缩后与压缩前一样长，两个字段都写同一个值。
    local.writeUInt32LE(size, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.byteLength, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)

    const central = Buffer.alloc(46 + name.byteLength)
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0)
    central.writeUInt16LE(VERSION_NEEDED, 4)
    central.writeUInt16LE(VERSION_NEEDED, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(METHOD_STORE, 10)
    central.writeUInt16LE(stamp.time, 12)
    central.writeUInt16LE(stamp.date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(size, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.byteLength, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)

    parts.push(local, entry.data)
    directory.push(central)
    offset += local.byteLength + size
  }

  const centralDirectory = Buffer.concat(directory)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirectory.byteLength, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  const zip = Buffer.concat([...parts, centralDirectory, eocd])
  // 上面写的是 32 位字段，超了会静默回绕，所以宁可报错。
  if (zip.byteLength > MAX_SIZE) throw new Error('zip 体积过大')
  return zip
}
