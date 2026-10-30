const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { test } = require('node:test')
const ts = require('typescript')

// Exercise the npm index mapping in memory; no database, registry, build or server is needed.
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

const service = load('server/services/npm-plugins.ts', {
  'drizzle-orm': { eq: () => () => true },
  '../db/client': { getDb: async () => { throw new Error('database not used') } },
  '../utils/errors': {
    appError: (statusCode, code, message) =>
      Object.assign(new Error(message), { statusCode, code }),
  },
  '../utils/markdown': { renderMarkdown: (markdown) => (markdown ? `<p>${markdown}</p>` : '') },
  '../../shared/types/plugins': { PLUGIN_SIDES: ['panel', 'daemon'] },
})

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
