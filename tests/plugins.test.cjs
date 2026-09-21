const assert = require('node:assert/strict')
const fs = require('node:fs')
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

function fixture() {
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
    },
    {
      id: 'v2',
      pluginId: 'one',
      version: '2.0.0',
      submittedAt: 2,
      status: 'approved',
    },
    {
      id: 'v3',
      pluginId: 'one',
      version: '3.0.0',
      submittedAt: 3,
      status: 'pending',
    },
    {
      id: 'v4',
      pluginId: 'one',
      version: '4.0.0',
      submittedAt: 4,
      status: 'rejected',
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
    '../utils/artifacts': {},
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
