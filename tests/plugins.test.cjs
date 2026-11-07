const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { test } = require('node:test')
const zlib = require('node:zlib')
const ts = require('typescript')

// Exercise npm indexing in memory; no database, registry, build or server is needed.
function load(relative, overrides) {
  const filename = path.resolve(__dirname, '..', relative)
  const mod = new Module(filename, module)
  const localRequire = Module.createRequire(filename)
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id))
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

const serviceDependencies = {
  'drizzle-orm': { eq: () => () => true },
  '../db/client': { getDb: async () => { throw new Error('database not used') } },
  '../utils/errors': {
    appError: (statusCode, code, message) =>
      Object.assign(new Error(message), { statusCode, code }),
  },
  '../utils/markdown': { renderMarkdown: (markdown) => (markdown ? `<p>${markdown}</p>` : '') },
  '../../shared/types/plugins': { PLUGIN_SIDES: ['panel', 'daemon'] },
}
const service = load('server/services/npm-plugins.ts', serviceDependencies)

function packument(overrides = {}) {
  return {
    name: 'epanel-plugin-demo',
    description: 'Demo plugin',
    readme: '# Demo',
    homepage: 'https://example.com/demo',
    license: 'Apache-2.0',
    repository: { type: 'git', url: 'https://github.com/example/demo' },
    keywords: ['epanel', 'tools'],
    author: { name: 'Example Author', email: 'author@example.com' },
    time: {
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-02-01T00:00:00.000Z',
      '1.0.0': '2025-01-01T00:00:00.000Z',
      '1.1.0': '2025-02-01T00:00:00.000Z',
    },
    'dist-tags': { latest: '1.1.0' },
    versions: {
      '1.0.0': {
        version: '1.0.0',
        description: 'Demo plugin',
        elementspanel: { id: 'demo', panel: { directory: 'panel', folder: 'demo' } },
        dist: { unpackedSize: 1000, fileCount: 5 },
      },
      '1.1.0': {
        version: '1.1.0',
        description: 'Demo plugin',
        elementspanel: {
          id: 'demo',
          dual: true,
          panel: { directory: 'panel', folder: 'demo' },
          daemon: { directory: 'daemon', folder: 'demo' },
        },
        dist: { unpackedSize: 2000, fileCount: 8 },
      },
    },
    ...overrides,
  }
}

test('plugin ids are derived from scoped and unscoped package names', () => {
  assert.equal(service.pluginIdFromPackageName('epanel-plugin-demo'), 'demo')
  assert.equal(service.pluginIdFromPackageName('@elementspanel/epanel-plugin-market'), 'market')
  assert.equal(service.pluginIdFromPackageName('@someone/epanel-plugin-demo'), 'demo')
  assert.equal(service.pluginIdFromPackageName('epanel-plugin-'), null)
  assert.equal(service.pluginIdFromPackageName('other-package'), null)
})

test('a packument becomes one index row with versions, sides and npm metadata', () => {
  const document = packument()
  Object.assign(document.versions['1.1.0'], {
    displayName: 'Demo Display Name',
    description: 'Description from package.json',
    author: 'Package Author <package@example.com>',
    homepage: 'https://example.com/package',
    license: 'MIT',
    changelog: 'Added daemon support',
  })
  document.versions['1.1.0'].elementspanel.id = 'explicit-id'
  document.versions['1.1.0'].elementspanel.category = 'utilities'
  document.versions['1.1.0'].elementspanel.panel.frontendInject = ['console', 'i18n']
  document.versions['1.1.0'].elementspanel.panel.styles = ['frontend/assets/style.css']
  const record = service.packageRecordFromPackument('epanel-plugin-demo', document, 123)
  assert.equal(record.id, 'explicit-id')
  assert.equal(record.name, 'epanel-plugin-demo')
  assert.equal(record.displayName, 'Demo Display Name')
  assert.equal(record.summary, 'Description from package.json')
  assert.equal(record.description, 'Description from package.json')
  assert.equal(record.category, 'utilities')
  assert.equal(record.authorName, 'Package Author')
  assert.equal(record.homepage, 'https://example.com/package')
  assert.equal(record.license, 'MIT')
  assert.equal(record.repository, 'https://github.com/example/demo')
  assert.equal(record.latestVersion, '1.1.0')
  assert.deepEqual(JSON.parse(record.sides), ['panel', 'daemon'])
  assert.equal(record.publishedAt, Date.parse('2025-01-01T00:00:00.000Z'))
  assert.equal(record.updatedAt, Date.parse('2025-02-01T00:00:00.000Z'))

  const versions = JSON.parse(record.versions)
  assert.deepEqual(
    versions.map((item) => item.version),
    ['1.1.0', '1.0.0']
  )
  assert.deepEqual(versions[0].sides, ['panel', 'daemon'])
  assert.deepEqual(versions[1].sides, ['panel'])
  assert.equal(versions[0].sizeBytes, 2000)
  assert.equal(versions[0].fileCount, 8)
  assert.equal(versions[0].status, 'approved')
  assert.equal(versions[0].changelog, 'Added daemon support')
  assert.equal(versions[1].changelog, '')
})

test('dist-tags choose the latest release while pre-releases sort below releases', () => {
  const record = service.packageRecordFromPackument(
    'epanel-plugin-demo',
    packument({
      'dist-tags': { latest: '2.0.0' },
      versions: {
        '2.0.0-beta.1': {
          version: '2.0.0-beta.1',
          elementspanel: { id: 'demo', panel: { directory: 'panel', folder: 'demo' } },
          dist: {},
        },
        '2.0.0': {
          version: '2.0.0',
          elementspanel: { id: 'demo', panel: { directory: 'panel', folder: 'demo' } },
          dist: {},
        },
      },
      time: { '2.0.0': '2025-03-01T00:00:00.000Z' },
    })
  )
  assert.equal(record.latestVersion, '2.0.0')
  assert.deepEqual(
    JSON.parse(record.versions).map((item) => item.version),
    ['2.0.0', '2.0.0-beta.1']
  )
  assert.ok(service.compareVersions('1.10.0', '1.9.0') > 0)
  assert.ok(service.compareVersions('2.0.0-beta.1', '2.0.0') < 0)
  assert.equal(service.compareVersions('1.0.0+build.1', '1.0.0'), 0)
})

test('a package without a usable plugin id is not indexed', () => {
  assert.equal(
    service.packageRecordFromPackument('epanel-plugin-', packument()),
    null
  )
  assert.equal(service.packageRecordFromPackument('other-package', packument()), null)
  assert.equal(
    service.packageRecordFromPackument('epanel-plugin-demo', packument({ versions: {} })),
    null
  )
})

test('requirements stay attached to their release and optional peer metadata is preserved', () => {
  const document = packument()
  Object.assign(document.versions['1.1.0'], {
    dependencies: { marked: '^7.0.0', invalid: 12 },
    peerDependencies: { '@elementspanel/panel': '^1.0.0' },
    peerDependenciesMeta: { '@elementspanel/panel': { optional: true } },
    engines: { node: '>=22' },
    deprecated: 'Use version 2',
  })
  document.versions['1.1.0'].elementspanel.panel.elements = { api: 1, sdk: 1 }
  document.versions['1.1.0'].elementspanel.panel.frontendInject = ['console', 'config']
  const versions = JSON.parse(service.packageRecordFromPackument('epanel-plugin-demo', document).versions)
  assert.deepEqual(versions[0].dependencies, { marked: '^7.0.0' })
  assert.deepEqual(versions[0].peerDependencies, { '@elementspanel/panel': '^1.0.0' })
  assert.deepEqual(versions[0].peerDependenciesMeta, { '@elementspanel/panel': { optional: true } })
  assert.deepEqual(versions[0].engines, { node: '>=22' })
  assert.deepEqual(versions[0].compatibility, { panel: { api: 1, sdk: 1 } })
  assert.deepEqual(versions[0].frontendDependencies, ['console', 'config'])
  assert.equal(versions[0].deprecated, 'Use version 2')
  assert.deepEqual(versions[1].dependencies, {})
  assert.deepEqual(versions[1].compatibility, {})
  assert.equal(versions[1].deprecated, undefined)
})

test('the latest dist-tag remains selectable even outside the fifty highest releases', () => {
  const document = packument({ 'dist-tags': { latest: '1.0.0' }, versions: {} })
  for (let minor = 0; minor < 55; minor++) {
    document.versions[`1.${minor}.0`] = { version: `1.${minor}.0`, elementspanel: { panel: {} } }
  }
  const record = service.packageRecordFromPackument('epanel-plugin-demo', document)
  assert.equal(record.latestVersion, '1.0.0')
  assert.ok(JSON.parse(record.versions).some(version => version.version === '1.0.0'))
})

function pluginDocument(name) {
  const document = packument({ name })
  for (const version of Object.values(document.versions)) {
    version.elementspanel.id = service.pluginIdFromPackageName(name)
  }
  return document
}

function searchResponse(names, total = names.length) {
  return Response.json({ objects: names.map(name => ({ package: { name } })), total })
}

function limitedResponse(retryAfter) {
  return Response.json({}, {
    status: 429,
    statusText: 'Too Many Requests',
    headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter },
  })
}

function syncFixture(t, respond, initialRows = []) {
  let now = Date.parse('2026-10-31T00:00:00.000Z')
  let dbReads = 0
  const requests = []
  const waits = []
  const rows = new Map(initialRows.map(row => [row.id, { ...row }]))
  t.mock.method(Date, 'now', () => now)
  t.mock.method(global, 'fetch', async (input) => {
    const request = { url: new URL(input), at: now }
    requests.push(request)
    const response = await respond(request, requests)
    if (response) return response
    if (request.url.pathname === '/-/v1/search') return searchResponse([])
    return Response.json(pluginDocument(decodeURIComponent(request.url.pathname.slice(1))))
  })
  const index = load('server/services/npm-plugins.ts', {
    ...serviceDependencies,
    'node:timers/promises': {
      setTimeout: async (ms) => {
        waits.push(ms)
        await new Promise(resolve => setImmediate(resolve))
        now += ms
      },
    },
    'drizzle-orm': { eq: (field, value) => row => row[field] === value },
    '../db/client': {
      getDb: async () => {
        dbReads += 1
        return {
          tables: { npmPlugins: { id: 'id' } },
          db: {
            select: () => ({ from: async () => [...rows.values()] }),
            insert: () => ({ values: async row => { rows.set(row.id, row) } }),
            update: () => ({
              set: row => ({ where: async () => { rows.set(row.id, row) } }),
            }),
            delete: () => ({
              where: async predicate => {
                for (const [id, row] of rows) if (predicate(row)) rows.delete(id)
              },
            }),
          },
        }
      },
    },
  })
  return { index, requests, waits, rows, get dbReads() { return dbReads } }
}

test('discovery uses focused searches, filters names and deduplicates scoped packages', async (t) => {
  const fixture = syncFixture(t, ({ url }) => {
    const query = url.searchParams.get('text')
    if (query === 'epanel') {
      return searchResponse(['epanel-plugin-demo', '@other/epanel-plugin-example', 'unrelated-plugin'])
    }
    if (query === '@elementspanel') {
      return searchResponse(['@other/epanel-plugin-example', '@elementspanel/epanel-plugin-demo'])
    }
    assert.notEqual(query, 'epanel-plugin')
  })
  const pending = fixture.index.syncNpmIndex()
  assert.equal(fixture.index.syncNpmIndex(), pending)
  const result = await pending
  assert.equal(result.total, 2)
  assert.equal(fixture.rows.get('demo').name, '@elementspanel/epanel-plugin-demo')
  assert.equal(fixture.rows.get('example').name, '@other/epanel-plugin-example')
  const searches = fixture.requests.filter(({ url }) => url.pathname === '/-/v1/search')
  assert.deepEqual(searches.map(({ url }) => url.searchParams.get('text')), ['epanel', '@elementspanel'])
  assert.equal(fixture.requests.length, 5)
  for (let index = 1; index < fixture.requests.length; index += 1) {
    assert.ok(fixture.requests[index].at - fixture.requests[index - 1].at >= 500)
  }
})

test('focused searches still discover matching packages on later pages', async (t) => {
  const fixture = syncFixture(t, ({ url }) => {
    if (url.searchParams.get('text') !== 'epanel') return
    if (url.searchParams.get('from') === '0') {
      return searchResponse(['epanel-plugin-demo', ...Array(249).fill('unrelated-plugin')], 251)
    }
    return searchResponse(['@other/epanel-plugin-example'], 251)
  })
  assert.equal((await fixture.index.syncNpmIndex()).total, 2)
  const pages = fixture.requests.filter(({ url }) => url.searchParams.get('text') === 'epanel')
  assert.deepEqual(pages.map(({ url }) => url.searchParams.get('from')), ['0', '250'])
})

test('429 search retries honor Retry-After seconds and HTTP dates', async (t) => {
  for (const format of ['seconds', 'date']) {
    await t.test(format, async (t) => {
      let attempts = 0
      const fixture = syncFixture(t, ({ url, at }) => {
        if (url.searchParams.get('text') !== 'epanel') return
        if (attempts++ === 0) {
          return limitedResponse(format === 'seconds' ? '5' : new Date(at + 5000).toUTCString())
        }
        return searchResponse(['epanel-plugin-demo'])
      })
      assert.equal((await fixture.index.syncNpmIndex()).total, 1)
      const searches = fixture.requests.filter(({ url }) => url.searchParams.get('text') === 'epanel')
      assert.equal(searches.length, 2)
      assert.equal(searches[0].url.href, searches[1].url.href)
      assert.ok(searches[1].at - searches[0].at >= 5000)
    })
  }
})

test('missing or invalid Retry-After uses bounded exponential retries', async (t) => {
  for (const retryAfter of [undefined, 'invalid']) {
    await t.test(String(retryAfter), async (t) => {
      const fixture = syncFixture(t, () => limitedResponse(retryAfter))
      await assert.rejects(fixture.index.syncNpmIndex(), { status: 429 })
      assert.equal(fixture.requests.length, 4)
      assert.deepEqual(fixture.waits, [2000, 4000, 8000])
      assert.equal(fixture.dbReads, 0)
    })
  }
})

test('package retries recover from 429 and delay other queued package requests', async (t) => {
  let attempts = 0
  const fixture = syncFixture(t, ({ url }) => {
    if (url.searchParams.get('text') === 'epanel') {
      return searchResponse(['epanel-plugin-demo', 'epanel-plugin-example', 'epanel-plugin-other'])
    }
    if (url.pathname === '/epanel-plugin-demo' && attempts++ === 0) return limitedResponse('5')
  })
  assert.equal((await fixture.index.syncNpmIndex()).total, 3)
  const limited = fixture.requests.findIndex(({ url }) => url.pathname === '/epanel-plugin-demo')
  assert.ok(fixture.requests[limited + 1].at - fixture.requests[limited].at >= 5000)
  assert.equal(fixture.requests.filter(({ url }) => url.pathname === '/epanel-plugin-demo').length, 2)
})

test('exhausted package rate limits fail the sync before changing the existing index', async (t) => {
  const original = service.packageRecordFromPackument('epanel-plugin-demo', pluginDocument('epanel-plugin-demo'), 123)
  const fixture = syncFixture(t, ({ url }) => {
    if (url.searchParams.get('text') === 'epanel') {
      return searchResponse(['epanel-plugin-demo', 'epanel-plugin-example'])
    }
    if (url.pathname === '/epanel-plugin-example') return limitedResponse()
  }, [original])
  await assert.rejects(fixture.index.syncNpmIndex(), { status: 429 })
  assert.equal(fixture.dbReads, 0)
  assert.deepEqual([...fixture.rows.values()], [original])
  assert.equal(fixture.requests.filter(({ url }) => url.pathname === '/epanel-plugin-example').length, 4)
})

test('transient package failures preserve cached entries while absent packages are removed', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const cached = ['demo', 'example', 'removed'].map(id => {
    const name = `epanel-plugin-${id}`
    return service.packageRecordFromPackument(name, pluginDocument(name), 123)
  })
  const fixture = syncFixture(t, ({ url }) => {
    if (url.searchParams.get('text') === 'epanel') {
      return searchResponse(['epanel-plugin-demo', 'epanel-plugin-example'])
    }
    if (url.pathname === '/epanel-plugin-example') return Response.json({}, { status: 503 })
  }, cached)
  assert.equal((await fixture.index.syncNpmIndex()).total, 1)
  assert.ok(fixture.rows.get('demo').syncedAt > 123)
  assert.equal(fixture.rows.get('example').syncedAt, 123)
  assert.equal(fixture.rows.has('removed'), false)
})

test('non-429 search errors fail without retrying or changing the index', async (t) => {
  const fixture = syncFixture(t, () => Response.json({}, { status: 503 }))
  await assert.rejects(fixture.index.syncNpmIndex(), { status: 503 })
  assert.equal(fixture.requests.length, 1)
  assert.equal(fixture.dbReads, 0)
})

function tarEntry(name, content, { prefix = '', type = '0' } = {}) {
  const header = Buffer.alloc(512)
  header.write(name, 0)
  header.write(content.length.toString(8).padStart(11, '0'), 124)
  header.write(type, 156)
  header.write('ustar', 257)
  header.write(prefix, 345)
  return Buffer.concat([header, content, Buffer.alloc((512 - (content.length % 512)) % 512)])
}

function tarball(...entries) {
  return zlib.gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]))
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('image')])

test('the icon comes from icon.png in the package root only', async () => {
  const icon = await service.extractPackageIcon(tarball(
    tarEntry('package/package.json', Buffer.from('{}')),
    tarEntry('package/assets/icon.png', Buffer.from('nested')),
    tarEntry('package/icon.png', PNG),
  ))
  assert.deepEqual(icon, PNG)
})

test('packages with a missing, non-PNG or unreadable icon have no icon', async () => {
  assert.equal(await service.extractPackageIcon(tarball(tarEntry('package/index.js', Buffer.from('x')))), null)
  assert.equal(await service.extractPackageIcon(tarball(tarEntry('package/icon.png', Buffer.from('<svg/>')))), null)
  assert.equal(await service.extractPackageIcon(tarball(tarEntry('package/icon.png', Buffer.alloc(0), { type: '5' }))), null)
  assert.equal(await service.extractPackageIcon(Buffer.from('not gzip')), null)
})
