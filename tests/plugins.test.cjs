const assert = require('node:assert/strict')
const crypto = require('node:crypto')
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

const TABLE = Symbol('table')

function fixture({ readme = '', hasIcon = false, compatibility = {}, manifests = {} } = {}) {
  const plugin = {
    id: 'one',
    name: 'one',
    authorId: 'author',
    displayName: 'One',
    summary: 'First summary',
    description: 'Full description',
    category: 'tools',
    visibility: 'listed',
    updatedAt: 0,
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
  // 列名就是属性名；表名藏在一个 symbol 里，免得和 `name` 这样的列撞上。
  const tables = Object.fromEntries(
    Object.keys(rows).map((name) => [
      name,
      new Proxy({ [TABLE]: name }, { get: (target, key) => (key === TABLE ? target[TABLE] : key) }),
    ])
  )
  const db = {
    select() {
      let items
      return {
        from(table) {
          items = rows[table[TABLE]]
          return this
        },
        where(predicate) {
          items = items.filter(predicate)
          return this
        },
        orderBy() {
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
    update(table) {
      return {
        set: (patch) => ({
          where: async (predicate) => {
            for (const row of rows[table[TABLE]].filter(predicate)) Object.assign(row, patch)
          },
        }),
      }
    },
    insert(table) {
      return {
        values: (value) => ({
          returning: async () => {
            rows[table[TABLE]].push(value)
            return [value]
          },
        }),
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
      desc: () => undefined,
    },
    '../db/client': { getDb: async () => ({ db, tables }) },
    '../utils/errors': {
      appError: (statusCode, code, message) =>
        Object.assign(new Error(message), { statusCode, code }),
    },
    // 端、自述、图标、兼容性与清单都是从产物目录推导的；这里不碰文件系统。
    '../utils/artifacts': {
      listArtifactSides: () => ['panel'],
      readArtifactReadme: () => readme,
      hasArtifactIcon: () => hasIcon,
      readArtifactCompatibility: () => compatibility,
      readArtifactManifest: (artifactPath) => manifests[artifactPath] ?? null,
    },
    // 渲染 markdown 需要 marked/sanitize-html，这里只关心服务把原文递了出去。
    '../utils/markdown': {
      renderMarkdown: (markdown) => (markdown ? `<p>${markdown}</p>` : ''),
    },
  })
  return { service, plugin, versions, rows }
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
  assert.equal(result.hasIcon, false)
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

// 真实的 shared/types 是 .ts，这里的 CJS 加载器解析不了，只取用到的常量。
const sharedTypes = { PLUGIN_SIDES: ['panel', 'daemon'] }
const errors = {
  appError: (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code }),
}

function loadPackageRules() {
  return load('server/utils/package-rules.ts', {
    '../../shared/types/plugins': sharedTypes,
    './errors': errors,
  })
}

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
    '../../shared/types/plugins': sharedTypes,
    './package-rules': loadPackageRules(),
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

test('the package icon is found panel-side first, and only a real PNG is served', () => {
  const { root, write, artifacts } = artifactFixture()
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
  try {
    assert.equal(artifacts.hasArtifactIcon('data/artifacts/p/none'), false)
    assert.equal(artifacts.readArtifactIcon('data/artifacts/p/none'), null)

    // daemon-only 工作区：图标落在 daemon 端也能找到
    write('p/daemon-only/daemon/plugin.json', '{}')
    write('p/daemon-only/daemon/icon.png', png)
    assert.equal(artifacts.findArtifactIcon('data/artifacts/p/daemon-only'), 'daemon/icon.png')
    assert.equal(artifacts.hasArtifactIcon('data/artifacts/p/daemon-only'), true)

    // 双端：panel 优先，与 plugin.json / README.md 的取用顺序一致
    write('p/both/panel/icon.png', png)
    write('p/both/daemon/icon.png', png)
    assert.equal(artifacts.findArtifactIcon('data/artifacts/p/both'), 'panel/icon.png')

    const icon = artifacts.readArtifactIcon('data/artifacts/p/both')
    assert.equal(icon.contentType, 'image/png')
    assert.deepEqual(icon.data, png)

    // 名字叫 icon.png 但内容不是 PNG：文件在，但不能当图片发出去
    write('p/bogus/panel/icon.png', 'not a png')
    assert.equal(artifacts.hasArtifactIcon('data/artifacts/p/bogus'), true)
    assert.equal(artifacts.readArtifactIcon('data/artifacts/p/bogus'), null)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a package icon is reported on the plugin summary', async () => {
  const withIcon = fixture({ hasIcon: true })
  assert.equal((await withIcon.service.getPluginDetail('one')).hasIcon, true)
  assert.equal((await fixture().service.getPluginDetail('one')).hasIcon, false)
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
    assert.match(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |'), /<thead>/)
  }
)

test('the latest release is the highest version, not the one submitted last', async () => {
  const { service, versions } = fixture()
  // 给旧版本线补发的修复版：提交得最晚，版本号却更低，不能让「安装最新版」降级。
  versions.push({
    id: 'v5',
    pluginId: 'one',
    version: '1.9.1',
    submittedAt: 5,
    status: 'approved',
    artifactPath: 'data/artifacts/one/v5',
  })
  const detail = await service.getPluginDetail('one')
  assert.equal(detail.latestVersion.version, '2.0.0')
  assert.equal(detail.selectedVersion.version, '2.0.0')
  assert.deepEqual(
    detail.versions.map((item) => item.version),
    ['2.0.0', '1.9.1', '1.0.0']
  )
  assert.equal((await service.resolveDownloadVersion('one')).version.version, '2.0.0')
})

test('versions compare like semver, and any other string still sorts stably', () => {
  const { service } = fixture()
  const sorted = [
    '1.0.0-beta.10',
    '1.9.0',
    '0.9',
    '1.0.0',
    '1.10.0',
    '1.0.0-beta.2',
    '2.0.0-rc.1',
    '1.0.0-alpha',
    '10.0.0',
  ].sort(service.compareVersions)
  assert.deepEqual(sorted, [
    '0.9',
    '1.0.0-alpha',
    '1.0.0-beta.2',
    '1.0.0-beta.10',
    '1.0.0',
    '1.9.0',
    '1.10.0',
    '2.0.0-rc.1',
    '10.0.0',
  ])
  assert.equal(service.compareVersions('1.0', '1.0.0'), 0)
  assert.equal(service.compareVersions('1.0.0+build.5', '1.0.0'), 0)
})

test('/files hands a declared package only to a client with the same API and SDK', () => {
  const { assertClientCompatible } = fixture().service
  const client = { pluginApi: '1', pluginSdk: '1' }
  // 没有声明兼容性的旧包：新旧客户端都能取
  assert.doesNotThrow(() => assertClientCompatible({}, {}))
  assert.doesNotThrow(() => assertClientCompatible({}, client))
  assert.doesNotThrow(() =>
    assertClientCompatible({ panel: { api: 1, sdk: 1 }, daemon: { api: 1 } }, client)
  )
  // 声明了兼容性的包：不带参数的旧客户端、版本不一致的客户端都拿到 409
  for (const [compatibility, query] of [
    [{ panel: { api: 1, sdk: 1 } }, {}],
    [{ daemon: { api: 2 } }, client],
    [{ panel: { api: 1, sdk: 2 } }, client],
    [{ panel: { api: 1, sdk: 1 } }, { pluginApi: '1' }],
  ]) {
    assert.throws(() => assertClientCompatible(compatibility, query), { statusCode: 409 })
  }
})

test("version summaries carry each side's declared compatibility", async () => {
  const compatibility = { panel: { api: 1, sdk: 1 }, daemon: { api: 1 } }
  const { service } = fixture({ compatibility })
  const detail = await service.getPluginDetail('one')
  assert.deepEqual(detail.selectedVersion.compatibility, compatibility)
  assert.deepEqual(detail.latestVersion.compatibility, compatibility)
})

test('an id that is a Windows device name or does not start with a letter is refused', () => {
  const { service } = fixture()
  for (const id of ['aux', 'com1', 'nul', '2fa', 'a']) {
    assert.throws(() => service.manifestFromPluginJson({ id, version: '1.0.0' }), { statusCode: 400 }, id)
  }
  assert.equal(service.manifestFromPluginJson({ id: 'auxiliary', version: '1.0.0' }).name, 'auxiliary')
})

test('a plugin id belongs to one author across the whole market', async () => {
  const { service, rows } = fixture()
  const taken = service.manifestFromPluginJson({ id: 'one', version: '9.0.0' })
  await assert.rejects(service.resolvePluginForUpload('someone-else', taken), { statusCode: 409 })
  assert.equal(rows.plugins.length, 1)

  const fresh = service.manifestFromPluginJson({ id: 'two', displayName: 'Two', version: '1.0.0' })
  const created = await service.resolvePluginForUpload('someone-else', fresh)
  assert.equal(created.name, 'two')
  assert.equal(rows.plugins.length, 2)
})

test('uploading a new version does not change what a published plugin shows', async () => {
  const { service, plugin } = fixture()
  const manifest = service.manifestFromPluginJson({
    id: 'one',
    displayName: 'Renamed',
    summary: 'New summary',
    version: '5.0.0',
  })
  const resolved = await service.resolvePluginForUpload('author', manifest)
  assert.equal(resolved.displayName, 'One')
  assert.equal(plugin.displayName, 'One')
  assert.equal(plugin.summary, 'First summary')
  assert.equal(plugin.updatedAt, 0, 'the public update date waits for approval as well')
})

test('an unpublished plugin takes the details of its latest upload', async () => {
  const { service, plugin, versions } = fixture()
  for (const version of versions) version.status = 'pending'
  const manifest = service.manifestFromPluginJson({ id: 'one', displayName: 'Renamed', version: '5.0.0' })
  await service.resolvePluginForUpload('author', manifest)
  assert.equal(plugin.displayName, 'Renamed')
})

test('approving a version publishes the details of the newest approved release', async () => {
  const manifests = {
    'data/artifacts/one/v3': {
      id: 'one',
      version: '3.0.0',
      displayName: 'Three',
      summary: 'Third',
      description: 'Long third',
      category: 'games',
    },
  }
  const { service, plugin, versions } = fixture({ manifests })
  await service.reviewVersion({ versionId: 'v3', action: 'approve', reviewerId: 'admin' })
  assert.equal(versions[2].status, 'approved')
  assert.equal(plugin.displayName, 'Three')
  assert.equal(plugin.summary, 'Third')
  assert.equal(plugin.description, 'Long third')
  assert.equal(plugin.category, 'games')
  assert.ok(plugin.updatedAt > 0)
})

test("approving an older release keeps the newest approved release's details", async () => {
  const manifests = {
    'data/artifacts/one/v2': { id: 'one', version: '2.0.0', displayName: 'Two' },
    'data/artifacts/one/v5': { id: 'one', version: '1.5.0', displayName: 'Old line' },
  }
  const { service, plugin, versions } = fixture({ manifests })
  versions.push({
    id: 'v5',
    pluginId: 'one',
    version: '1.5.0',
    submittedAt: 5,
    status: 'pending',
    artifactPath: 'data/artifacts/one/v5',
  })
  await service.reviewVersion({ versionId: 'v5', action: 'approve', reviewerId: 'admin' })
  assert.equal(plugin.displayName, 'Two')
})

test('rejecting a version leaves the published plugin untouched', async () => {
  const manifests = { 'data/artifacts/one/v3': { id: 'one', version: '3.0.0', displayName: 'Three' } }
  const { service, plugin, versions } = fixture({ manifests })
  await service.reviewVersion({ versionId: 'v3', action: 'reject', note: 'no', reviewerId: 'admin' })
  assert.equal(versions[2].status, 'rejected')
  assert.equal(plugin.displayName, 'One')
  assert.equal(plugin.updatedAt, 0)
})

test('the review queue shows what approving a version would change', async () => {
  const manifests = {
    'data/artifacts/one/v3': {
      id: 'one',
      version: '3.0.0',
      displayName: 'Three',
      summary: 'First summary',
      description: 'Rewritten',
      category: 'tools',
    },
  }
  const { service } = fixture({ manifests })
  const [item] = await service.listReviewQueue()
  assert.equal(item.versionId, 'v3')
  assert.equal(item.plugin.displayName, 'One')
  assert.equal(item.submitted.displayName, 'Three')
  assert.deepEqual(item.submitted.changes, ['displayName', 'description'])
})

test('the readme is the README.md at the root of a side, never a nested one', () => {
  const { root, write, artifacts } = artifactFixture()
  try {
    write('p/r/panel/backend/readme.md', 'nested')
    write('p/r/panel/README.md', 'root')
    assert.equal(artifacts.readArtifactReadme('data/artifacts/p/r'), 'root')

    write('p/d/panel/plugin.json', '{}')
    write('p/d/daemon/Readme.md', 'daemon side')
    assert.equal(artifacts.readArtifactReadme('data/artifacts/p/d'), 'daemon side')

    write('p/n/panel/docs/README.md', 'nested only')
    assert.equal(artifacts.readArtifactReadme('data/artifacts/p/n'), '')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('the file list carries the size and SHA-256 of every file', () => {
  const { root, write, artifacts } = artifactFixture()
  try {
    write('p/s/panel/plugin.json', '{"id":"s"}')
    write('p/s/panel/backend/index.cjs', 'module.exports = 1')
    const listed = artifacts.listArtifactFileDigests('data/artifacts/p/s')
    assert.deepEqual(
      listed.map((file) => file.path),
      ['panel/backend/index.cjs', 'panel/plugin.json']
    )
    for (const file of listed) {
      const data = fs.readFileSync(path.join(root, 'data', 'artifacts', 'p', 's', ...file.path.split('/')))
      assert.equal(file.size, data.length)
      assert.equal(file.sha256, crypto.createHash('sha256').update(data).digest('hex'))
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("compatibility and the describing manifest are read from each side's plugin.json", () => {
  const { root, write, artifacts } = artifactFixture()
  try {
    write('p/c/panel/plugin.json', JSON.stringify({ id: 'c', elements: { api: 1, sdk: 1 } }))
    write('p/c/daemon/plugin.json', JSON.stringify({ id: 'c-daemon' }))
    assert.deepEqual(artifacts.readArtifactCompatibility('data/artifacts/p/c'), {
      panel: { api: 1, sdk: 1 },
    })
    assert.equal(artifacts.readArtifactManifest('data/artifacts/p/c').id, 'c')

    // 声明了却读不懂的兼容性，不能当成旧包放行
    write('p/bad/daemon/plugin.json', JSON.stringify({ id: 'bad', elements: { api: '1' } }))
    assert.deepEqual(artifacts.readArtifactCompatibility('data/artifacts/p/bad'), {
      daemon: { api: 0 },
    })
    assert.equal(artifacts.readArtifactManifest('data/artifacts/p/missing'), null)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

/** 一个编译脚本产出的双端包；`overrides` 里值为 undefined 的文件会被拿掉。 */
function packageEntries(overrides = {}) {
  const files = {
    'panel/plugin.json': JSON.stringify({
      id: 'demo',
      version: '1.0.0',
      elements: { api: 1, sdk: 1 },
      backend: 'backend/index.cjs',
      frontend: 'frontend/index.js',
    }),
    'panel/backend/index.cjs': 'module.exports = {}',
    'panel/frontend/index.js': 'export {}',
    'panel/README.md': '# demo',
    'panel/icon.png': pngBytes,
    'daemon/plugin.json': JSON.stringify({
      id: 'demo',
      version: '1.0.0',
      elements: { api: 1 },
      backend: 'backend/index.cjs',
    }),
    'daemon/backend/index.cjs': 'module.exports = {}',
    ...overrides,
  }
  return Object.entries(files)
    .filter(([, data]) => data !== undefined)
    .map(([file, data]) => ({ path: file, data: Buffer.from(data) }))
}

test('a compiled package passes the upload check with its sides and compatibility', () => {
  const { checkPluginPackage } = loadPackageRules()
  const checked = checkPluginPackage(packageEntries())
  assert.deepEqual(checked.sides, ['panel', 'daemon'])
  assert.equal(checked.manifest.frontend, 'frontend/index.js', 'the panel manifest describes the package')
  assert.deepEqual(checked.compatibility, { panel: { api: 1, sdk: 1 }, daemon: { api: 1 } })

  const panelFiles = packageEntries()
    .map((entry) => entry.path)
    .filter((file) => file.startsWith('panel/'))
  const daemonOnly = checkPluginPackage(
    packageEntries(Object.fromEntries(panelFiles.map((file) => [file, undefined])))
  )
  assert.deepEqual(daemonOnly.sides, ['daemon'])
  assert.deepEqual(daemonOnly.compatibility, { daemon: { api: 1 } })
})

test('the upload refuses every package the panel or a daemon could not install', () => {
  const { checkPluginPackage } = loadPackageRules()
  const cases = {
    'a file outside both sides': { 'README.md': 'x' },
    'an unknown side': { 'web/index.js': 'x' },
    'a side without its manifest': { 'daemon/plugin.json': undefined },
    'a declared entry that is missing': { 'panel/backend/index.cjs': undefined },
    'an entry outside its side': {
      'panel/plugin.json': JSON.stringify({ id: 'demo', version: '1.0.0', backend: '../daemon/backend/index.cjs' }),
    },
    'an absolute entry': {
      'panel/plugin.json': JSON.stringify({ id: 'demo', version: '1.0.0', backend: '/backend/index.cjs' }),
    },
    'malformed compatibility': {
      'daemon/plugin.json': JSON.stringify({ id: 'demo', version: '1.0.0', elements: { api: '1' } }),
    },
    'a manifest that is not an object': { 'daemon/plugin.json': '[]' },
    'the install marker': { 'panel/.market-install.json': '{}' },
    'a Windows device name': { 'panel/aux.js': 'x' },
    'a segment ending in a dot': { 'panel/lib./x.js': 'x' },
    'a colon in a name': { 'panel/a:b.js': 'x' },
    'names that differ only in case': { 'panel/Backend/index.cjs': 'x' },
    'TypeScript source': { 'daemon/src/index.ts': 'x' },
    'an image other than the icon': { 'panel/assets/logo.png': pngBytes },
    'an icon that is not a PNG': { 'panel/icon.png': 'GIF89a' },
    'an oversized icon': { 'panel/icon.png': Buffer.concat([pngBytes, Buffer.alloc(1024 * 1024)]) },
  }
  for (const [label, overrides] of Object.entries(cases)) {
    assert.throws(() => checkPluginPackage(packageEntries(overrides)), { statusCode: 400 }, label)
  }
})

test('an artifact is read and hashed once, and re-read when it changes', () => {
  const { root, write, artifacts } = artifactFixture()
  try {
    write('p/cache/panel/plugin.json', JSON.stringify({ id: 'c', elements: { api: 1 } }))
    const first = artifacts.listArtifactFileDigests('data/artifacts/p/cache')
    // 产物不变就只算一次：/files 是公开接口，不能每个请求都把整个包哈希一遍。
    assert.equal(artifacts.listArtifactFileDigests('data/artifacts/p/cache'), first)
    assert.equal(
      artifacts.readArtifactCompatibility('data/artifacts/p/cache'),
      artifacts.readArtifactCompatibility('data/artifacts/p/cache')
    )
    assert.equal(
      artifacts.listArtifactSides('data/artifacts/p/cache'),
      artifacts.listArtifactSides('data/artifacts/p/cache')
    )

    // 目录变了（哪怕是绕过接口直接写的）就要重算，缓存只省掉真正重复的工作
    write('p/cache/daemon/plugin.json', '{}')
    const second = artifacts.listArtifactFileDigests('data/artifacts/p/cache')
    assert.notEqual(second, first)
    assert.deepEqual(
      second.map((file) => file.path),
      ['daemon/plugin.json', 'panel/plugin.json']
    )
    assert.deepEqual(artifacts.listArtifactSides('data/artifacts/p/cache'), ['panel', 'daemon'])

    // 内容改了而文件数与大小不变：修改时间让指纹跟着变
    const target = path.join(root, 'data', 'artifacts', 'p', 'cache', 'daemon', 'plugin.json')
    const later = new Date(Date.now() + 5000)
    fs.writeFileSync(target, '{]')
    fs.utimesSync(target, later, later)
    assert.notEqual(artifacts.listArtifactFileDigests('data/artifacts/p/cache'), second)

    // 删掉后重建同名目录，读到的必须是新内容
    artifacts.removeArtifactDir('data/artifacts/p/cache')
    write('p/cache/daemon/plugin.json', '{}')
    assert.deepEqual(artifacts.listArtifactSides('data/artifacts/p/cache'), ['daemon'])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a package whose declared compatibility cannot be read matches no client at all', () => {
  const { assertClientCompatible } = fixture().service
  const unreadable = { panel: { api: 0 } }
  for (const query of [
    {},
    { pluginApi: '0' },
    { pluginApi: '1' },
    { pluginApi: '0', pluginSdk: '0' },
    { pluginApi: '' },
    { pluginApi: 'abc' },
    { pluginApi: '1.5' },
    { pluginApi: '-1' }
  ]) {
    assert.throws(() => assertClientCompatible(unreadable, query), { statusCode: 409 }, JSON.stringify(query))
  }
  // 客户端给的版本号必须是正整数，否则声明了兼容性的包一律不给
  assert.doesNotThrow(() => assertClientCompatible({ panel: { api: 1 } }, { pluginApi: '1' }))
})

/** api-token.ts 只用到 oauth_codes 与 api_tokens 两张表，这里给它一份内存实现。 */
function tokenFixture() {
  const rows = { oauthCodes: [], apiTokens: [] }
  const tables = Object.fromEntries(
    Object.keys(rows).map((name) => [
      name,
      new Proxy({ [TABLE]: name }, { get: (t, key) => (key === TABLE ? t[TABLE] : key) }),
    ])
  )
  const db = {
    select() {
      let items
      return {
        from(table) {
          items = rows[table[TABLE]]
          return this
        },
        where(predicate) {
          items = items.filter(predicate)
          return this
        },
        orderBy() {
          return this
        },
        limit: (count) => Promise.resolve(items.slice(0, count)),
        then: (resolve, reject) => Promise.resolve(items).then(resolve, reject),
      }
    },
    insert(table) {
      const list = rows[table[TABLE]]
      return {
        values(value) {
          const conflict = () => list.some((row) => row.state && row.state === value.state)
          const chain = {
            onConflictDoNothing() {
              chain.blocked = conflict()
              return chain
            },
            async returning() {
              if (chain.blocked) return []
              list.push({ consumedAt: null, lastUsedAt: null, ...value })
              return [value]
            },
            then(resolve, reject) {
              return chain.returning().then(resolve, reject)
            },
          }
          return chain
        },
      }
    },
    update(table) {
      return {
        set: (patch) => ({
          where: (predicate) => {
            const matched = rows[table[TABLE]].filter(predicate)
            const apply = async () => {
              for (const row of matched) Object.assign(row, patch)
              return matched
            }
            // 真实代码既有 `.where(...)` 直接 await 的，也有 `.where(...).returning()` 的
            return { returning: apply, then: (resolve, reject) => apply().then(resolve, reject) }
          },
        }),
      }
    },
    delete(table) {
      return {
        where: (predicate) => {
          const list = rows[table[TABLE]]
          const matched = list.filter(predicate)
          const chain = {
            async returning() {
              for (const row of matched) list.splice(list.indexOf(row), 1)
              return matched
            },
            then: (resolve, reject) => chain.returning().then(resolve, reject),
          }
          return chain
        },
      }
    },
  }
  const service = load('server/utils/api-token.ts', {
    'drizzle-orm': {
      eq: (field, value) => (row) => row[field] === value,
      and:
        (...conditions) =>
        (row) =>
          conditions.every((check) => check(row)),
      isNull: (field) => (row) => row[field] === null || row[field] === undefined,
      desc: () => undefined,
    },
    'h3': { getHeader: () => '' },
    '../db/client': { getDb: async () => ({ db, tables }) },
    '../services/users': { findUserById: async (id) => ({ id }) },
    './errors': {
      appError: (statusCode, code, message) =>
        Object.assign(new Error(message), { statusCode, code }),
    },
    './config': { readConfig: () => ({ secret: 'pepper' }) },
    './session': { resolveSessionUser: async () => null },
  })
  return { service, rows }
}

test('a connect code is bound once, and a code already exchanged is not reported as success', async () => {
  const { service, rows } = tokenFixture()
  const state = 'a'.repeat(24)

  await service.createOAuthCode('author', state)
  assert.equal(rows.oauthCodes.length, 1)
  // 同一个人在令牌被取走之前重复授权（刷新后再点）什么也不改
  await service.createOAuthCode('author', state)
  assert.equal(rows.oauthCodes.length, 1)
  // 别人的连接码不能被接管
  await assert.rejects(service.createOAuthCode('someone-else', state), { statusCode: 409 })

  const token = await service.consumeOAuthCode(state)
  assert.match(token, /^epm_/)
  assert.equal(rows.apiTokens.length, 1)
  // 同一个 state 换不出第二个令牌
  assert.equal(await service.consumeOAuthCode(state), null)
  // 令牌已经被取走后再点「授权」，必须说清楚，否则用户会守着一个永远等不到令牌的终端
  await assert.rejects(service.createOAuthCode('author', state), { statusCode: 409 })
  assert.equal(rows.apiTokens.length, 1)
})

test('an expired connect code is refused, and a publish token can be listed and revoked', async () => {
  const { service, rows } = tokenFixture()
  const expired = 'b'.repeat(24)
  await service.createOAuthCode('author', expired)
  rows.oauthCodes[0].expiresAt = Date.now() - 1
  await assert.rejects(service.createOAuthCode('author', expired), { statusCode: 409 })
  assert.equal(await service.consumeOAuthCode(expired), null)

  await service.issueApiToken('author', '测试令牌')
  const [listed] = await service.listApiTokens('author')
  assert.equal(listed.name, '测试令牌')
  assert.equal(listed.lastUsedAt, undefined)
  // 只能撤销自己名下的
  assert.equal(await service.revokeApiToken('someone-else', listed.id), false)
  assert.equal(await service.revokeApiToken('author', listed.id), true)
  assert.equal(await service.revokeApiToken('author', listed.id), false)
  assert.deepEqual(await service.listApiTokens('author'), [])
})
