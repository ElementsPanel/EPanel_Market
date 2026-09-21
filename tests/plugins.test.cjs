const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { test } = require('node:test')
const ts = require('typescript')

// Exercise public catalogue rules in memory; no database, build or server is needed.
function load(relative, overrides) {
  const filename = path.resolve(__dirname, '..', relative)
  const mod = new Module(filename, module)
  const localRequire = Module.createRequire(filename)
  mod.require = (id) =>
    Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id)
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename
  )
  return mod.exports
}

function fixture({ readme = '' } = {}) {
  const plugin = {
    id: 'one',
    name: 'one',
    authorId: 'author',
    visibility: 'listed',
    description: 'Full description',
  }
  const versions = [
    {
      id: 'v1',
      pluginId: 'one',
      version: '1.0.0',
      submittedAt: 1,
      status: 'approved',
      artifactPath: 'data/artifacts/one/v1',
    },
    {
      id: 'v2',
      pluginId: 'one',
      version: '2.0.0',
      submittedAt: 2,
      status: 'approved',
      artifactPath: 'data/artifacts/one/v2',
    },
    {
      id: 'v3',
      pluginId: 'one',
      version: '3.0.0',
      submittedAt: 3,
      status: 'pending',
      artifactPath: 'data/artifacts/one/v3',
    },
    {
      id: 'v4',
      pluginId: 'one',
      version: '4.0.0',
      submittedAt: 4,
      status: 'rejected',
      artifactPath: 'data/artifacts/one/v4',
    },
  ]
  const rows = {
    plugins: [plugin],
    pluginVersions: versions,
    users: [{ id: 'author', displayName: 'Author' }],
  }
  const tables = Object.fromEntries(
    Object.keys(rows).map((name) => [
      name,
      new Proxy(
        { name },
        { get: (target, key) => (key === 'name' ? target.name : key) }
      ),
    ])
  )
  const db = {
    select() {
      let items
      return {
        from(table) {
          items = rows[table.name]
          return this
        },
        where(predicate) {
          items = items.filter(predicate)
          return this
        },
        limit(count) {
          return Promise.resolve(items.slice(0, count))
        },
        then(resolve, reject) {
          return Promise.resolve(items).then(resolve, reject)
        },
      }
    },
  }
  const service = load('server/services/plugins.ts', {
    'drizzle-orm': {
      eq: (field, value) => (row) => row[field] === value,
      inArray: (field, values) => (row) => values.includes(row[field]),
      and:
        (...conditions) =>
        (row) =>
          conditions.every((check) => check(row)),
    },
    '../db/client': { getDb: async () => ({ db, tables }) },
    '../utils/errors': {
      appError: (statusCode, code, message) =>
        Object.assign(new Error(message), { statusCode, code }),
    },
    // 端与自述都是从产物目录推导的；这里不碰文件系统。
    '../utils/artifacts': { listArtifactSides: () => ['panel'], readArtifactReadme: () => readme },
    // 渲染 markdown 需要 marked/sanitize-html，这里只关心服务把原文递了出去。
    '../utils/markdown': {
      renderMarkdown: (markdown) => (markdown ? `<p>${markdown}</p>` : ''),
    },
  })
  return { service, plugin, versions }
}

test('public details select the newest approved release and expose approved history only', async () => {
  const { service } = fixture()
  const result = await service.getPluginDetail('one')
  assert.equal(result.selectedVersion.version, '2.0.0')
  assert.equal(result.latestVersion.version, '2.0.0')
  assert.deepEqual(
    result.versions.map((item) => item.version),
    ['2.0.0', '1.0.0']
  )
  assert.equal(result.description, 'Full description')
  assert.equal(result.author.displayName, 'Author')
  // 卡片用插件级字段，详情页用选中版本的字段，两者都来自产物目录。
  assert.deepEqual(result.sides, ['panel'])
  assert.deepEqual(result.selectedVersion.sides, ['panel'])
})

test('a requested historical release matches the version returned for download', async () => {
  const { service } = fixture()
  const detail = await service.getPluginDetail('one', '1.0.0')
  const download = await service.resolveDownloadVersion(
    'one',
    detail.selectedVersion.version
  )
  assert.equal(detail.selectedVersion.version, '1.0.0')
  assert.equal(detail.latestVersion.version, '2.0.0')
  assert.equal(download.version.id, detail.selectedVersion.id)
})

test('missing, pending and rejected versions cannot be selected or downloaded', async () => {
  const { service } = fixture()
  for (const version of ['missing', '3.0.0', '4.0.0']) {
    await assert.rejects(service.getPluginDetail('one', version), {
      statusCode: 404,
    })
    await assert.rejects(service.resolveDownloadVersion('one', version), {
      statusCode: 404,
    })
  }
})

test('hidden plugins and plugins without approved releases have no public detail or download', async () => {
  const { service, plugin, versions } = fixture()
  plugin.visibility = 'hidden'
  await assert.rejects(service.getPluginDetail('one'), { statusCode: 404 })
  await assert.rejects(service.resolveDownloadVersion('one'), {
    statusCode: 404,
  })
  plugin.visibility = 'listed'
  versions.forEach((version) => {
    version.status = 'pending'
  })
  await assert.rejects(service.getPluginDetail('one'), { statusCode: 404 })
  await assert.rejects(service.resolveDownloadVersion('one'), {
    statusCode: 404,
  })
})

test('equal publication times give details and download the same latest release', async () => {
  const { service, versions } = fixture()
  versions[0].submittedAt = versions[1].submittedAt
  const detail = await service.getPluginDetail('one')
  const download = await service.resolveDownloadVersion('one')
  assert.equal(detail.versions[0].id, detail.latestVersion.id)
  assert.equal(detail.selectedVersion.id, download.version.id)
})

test('a download side is inferred only when the version has exactly one', () => {
  const { service } = fixture()
  assert.equal(service.resolveDownloadSide(['panel']), 'panel')
  assert.equal(service.resolveDownloadSide(['daemon']), 'daemon')
  assert.equal(service.resolveDownloadSide(['panel', 'daemon'], 'daemon'), 'daemon')
  // 双端插件不替用户挑一半。
  assert.throws(() => service.resolveDownloadSide(['panel', 'daemon']), { statusCode: 400 })
  assert.throws(() => service.resolveDownloadSide(['panel'], 'daemon'), { statusCode: 404 })
  assert.throws(() => service.resolveDownloadSide([], 'panel'), { statusCode: 404 })
})

function artifactFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'market-artifacts-'))
  const dataDir = path.join(root, 'data')
  const write = (relative, content) => {
    const target = path.join(dataDir, 'artifacts', relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  const artifacts = load('server/utils/artifacts.ts', {
    './paths': { getDataDir: () => dataDir },
    // 真实的 shared/types 是 .ts，这里的 CJS 加载器解析不了，只取用到的常量。
    '../../shared/types/plugins': { PLUGIN_SIDES: ['panel', 'daemon'] },
  })
  return { root, write, artifacts }
}

test('sides come from the first path segment, and a side download drops that prefix', () => {
  const { root, write, artifacts } = artifactFixture()
  try {
    assert.deepEqual(artifacts.listArtifactSides('data/artifacts/p/missing'), [])

    write('p/only-panel/panel/plugin.json', '{}')
    assert.deepEqual(artifacts.listArtifactSides('data/artifacts/p/only-panel'), ['panel'])

    write('p/both/plugin.json', '{}')
    assert.deepEqual(artifacts.listArtifactSides('data/artifacts/p/both'), [])

    write('p/both/panel/plugin.json', '{}')
    write('p/both/panel/frontend/空 格.js', 'y')
    write('p/both/daemon/backend/index.cjs', 'x')
    assert.deepEqual(artifacts.listArtifactSides('data/artifacts/p/both'), ['panel', 'daemon'])

    const panel = artifacts.listSideEntries('data/artifacts/p/both', 'panel')
    assert.deepEqual(panel.map((entry) => entry.name), ['frontend/空 格.js', 'plugin.json'])
    assert.equal(panel[1].data.toString(), '{}')
    assert.deepEqual(
      artifacts.listSideEntries('data/artifacts/p/both', 'daemon').map((entry) => entry.name),
      ['backend/index.cjs']
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

/** 够用来读回自己写出的 zip：反查 EOCD，再顺着中央目录找每个条目的数据。 */
function readZip(buffer) {
  const eocd = buffer.length - 22
  assert.equal(buffer.readUInt32LE(eocd), 0x06054b50)
  const total = buffer.readUInt16LE(eocd + 10)
  const directorySize = buffer.readUInt32LE(eocd + 12)
  const directoryOffset = buffer.readUInt32LE(eocd + 16)
  assert.equal(directoryOffset + directorySize, eocd)

  const entries = []
  let cursor = directoryOffset
  for (let index = 0; index < total; index += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50)
    const flags = buffer.readUInt16LE(cursor + 8)
    const method = buffer.readUInt16LE(cursor + 10)
    const crc = buffer.readUInt32LE(cursor + 16)
    const size = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength)

    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50)
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26)
    entries.push({ name, method, flags, crc, data: buffer.subarray(dataStart, dataStart + size) })
    cursor += 46 + nameLength
  }
  return entries
}

test('the zip writer stores entries a reader can take back byte for byte', () => {
  const { createZip, crc32 } = load('server/utils/zip.ts', {})
  const written = [
    { name: 'plugin.json', data: Buffer.from('{"name":"one"}') },
    { name: 'backend/空 格.cjs', data: Buffer.from('module.exports = 1') },
    { name: 'empty.txt', data: Buffer.alloc(0) },
  ]
  const read = readZip(createZip(written, new Date('2026-01-02T03:04:05Z')))

  assert.deepEqual(
    read.map((entry) => entry.name),
    written.map((entry) => entry.name)
  )
  for (const [index, entry] of read.entries()) {
    // 全部走 STORE：不压缩，也就不需要数据描述符，长度与 CRC 在头里就写死了。
    assert.equal(entry.method, 0)
    assert.equal(entry.crc, crc32(entry.data))
    assert.deepEqual(Buffer.from(entry.data), written[index].data)
    assert.equal(entry.flags, /[^\x00-\x7f]/.test(entry.name) ? 0x0800 : 0)
  }
})

test('the detail carries the selected release README, raw and rendered', async () => {
  const readme = '# Hello\n\nsome text'
  const { service } = fixture({ readme })
  const detail = await service.getPluginDetail('one')
  assert.equal(detail.readme, readme)
  assert.equal(detail.readmeHtml, `<p>${readme}</p>`)
})

test('a package without a README leaves both fields empty', async () => {
  const { service } = fixture()
  const detail = await service.getPluginDetail('one')
  assert.equal(detail.readme, '')
  assert.equal(detail.readmeHtml, '')
})

test('the upload manifest is taken from the package plugin.json', () => {
  const { service } = fixture()
  assert.deepEqual(
    service.manifestFromPluginJson({
      id: 'demo',
      displayName: 'Demo',
      version: '1.2.0',
      description: 'long text',
      category: 'tools',
      changelog: 'notes',
    }),
    {
      name: 'demo',
      displayName: 'Demo',
      version: '1.2.0',
      // summary 缺失时退到 description，和发布脚本原来的取值顺序一致
      summary: 'long text',
      description: 'long text',
      category: 'tools',
      changelog: 'notes',
    }
  )
})

test('a plugin.json without the market fields falls back to what it has, and a bad id is refused', () => {
  const { service } = fixture()
  const manifest = service.manifestFromPluginJson({
    id: 'demo',
    name: 'Demo plugin',
    version: '1.0.0',
  })
  assert.equal(manifest.name, 'demo')
  assert.equal(manifest.displayName, 'Demo plugin')
  assert.equal(manifest.summary, '')

  assert.throws(() => service.manifestFromPluginJson({ id: 'Bad Id', version: '1.0.0' }), {
    statusCode: 400,
  })
  assert.throws(() => service.manifestFromPluginJson({ id: 'demo' }), { statusCode: 400 })
})

// 依赖装好后这条会自动开始跑（package.json 里已经声明了 marked 与 sanitize-html）。
const markdownDepsInstalled = (() => {
  try {
    const from = path.resolve(__dirname, '..')
    require.resolve('marked', { paths: [from] })
    require.resolve('sanitize-html', { paths: [from] })
    return true
  } catch {
    return false
  }
})()

test(
  'a README is rendered to markdown and stripped of anything unsafe',
  { skip: markdownDepsInstalled ? false : 'marked / sanitize-html 尚未安装' },
  () => {
    const { renderMarkdown } = load('server/utils/markdown.ts', {})
    const html = renderMarkdown('# Title\n\n**bold** and <script>alert(1)</script>\n\n- one\n- two')
    assert.match(html, /<h1>Title<\/h1>/)
    assert.match(html, /<strong>bold<\/strong>/)
    assert.match(html, /<li>one<\/li>/)
    assert.equal(html.includes('<script'), false, 'script tags are dropped')
    assert.equal(renderMarkdown('   '), '', 'a blank README renders to nothing')
  }
)
