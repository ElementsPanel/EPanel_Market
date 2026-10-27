const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { DatabaseSync } = require('node:sqlite')
const { test } = require('node:test')
const ts = require('typescript')
const { drizzle } = require('drizzle-orm/node-sqlite')
const { eq } = require('drizzle-orm')

// 单独在内存中加载模块；不启动 Nuxt、不生成构建文件、不连接真实数据库或邮件服务。
function load(relative, overrides = {}, globals = {}) {
  const filename = path.resolve(__dirname, '..', relative)
  const localRequire = createRequire(filename)
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const scope = {
    defineEventHandler: (handler) => handler,
    readBody: async (event) => event.body,
    $fetch: async () => { throw new Error('Unexpected network request') },
    ...globals,
  }
  const run = new Function('require', 'module', 'exports', ...Object.keys(scope), code)
  run((id) => Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id), mod, mod.exports, ...Object.values(scope))
  return mod.exports
}

const errors = {
  appError: (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code }),
}
const captchaDefaults = load('shared/utils/captcha.ts')
const defaults = load('shared/utils/mail.ts', { './captcha': captchaDefaults })
const tables = load('server/db/schema.sqlite.ts')
const { ddlFor } = load('server/db/ddl.ts')
const { migrateSchema } = load('server/db/migrations.ts')
const validation = load('server/utils/validation.ts', { './errors': errors })
const password = {
  hashPassword: async (value) => `hashed:${value}`,
  verifyPassword: async (value, hash) => hash === `hashed:${value}`,
}

function siteSettings(mail = {}) {
  return {
    siteUrl: 'https://market.example.com',
    mail: { ...defaults.createDefaultMailSettings(), from: 'Market <mail@example.com>', apiKey: 'test-api-secret', ...mail },
    captcha: captchaDefaults.createDefaultCaptchaSettings(),
  }
}

function settingsFixture(site = siteSettings()) {
  let config = { secret: 'test-token-pepper', site }
  const configService = {
    readConfig: () => config,
    writeConfigAtomic: (next) => { config = next },
  }
  const settings = load('server/utils/settings.ts', {
    '../../shared/utils/captcha': captchaDefaults,
    '../../shared/utils/mail': defaults,
    './errors': errors,
    './config': configService,
  })
  return { settings, configService }
}

test('mail configuration masks secrets and preserves them only for the same connection', () => {
  const { settings, configService } = settingsFixture()
  const original = settings.getSiteSettings()
  const view = settings.toSiteSettingsView(original)
  assert.equal(view.mail.apiKey, '')
  assert.equal(view.mail.smtpPassword, '')
  assert.equal(view.mail.hasApiKey, true)
  assert.equal(original.mail.apiKey, 'test-api-secret')

  const draft = { ...view, siteUrl: 'https://market.example.com/subpath///' }
  const parsed = settings.parseSiteSettings(draft, original)
  assert.equal(parsed.siteUrl, 'https://market.example.com/subpath')
  assert.equal(parsed.mail.apiKey, original.mail.apiKey)
  settings.saveSiteSettings(parsed)
  assert.equal(configService.readConfig().secret, 'test-token-pepper')
  assert.equal(configService.readConfig().site.siteUrl, parsed.siteUrl)
  assert.throws(() => settings.parseSiteSettings({
    ...view, mail: { ...view.mail, preset: 'custom', apiUrl: 'https://other.example.com/send' },
  }, original), { code: 'VALIDATION_ERROR' })

  const smtp = siteSettings({ transport: 'smtp', preset: 'custom', smtpHost: 'smtp.example.com', smtpUsername: 'user', smtpPassword: ' smtp secret ' })
  const smtpView = settings.toSiteSettingsView(smtp)
  assert.equal(smtpView.mail.hasSmtpPassword, true)
  assert.equal(settings.parseSiteSettings(smtpView, smtp).mail.smtpPassword, ' smtp secret ')
  for (const patch of [{ smtpHost: 'other.example.com' }, { smtpPort: 587 }, { smtpSecurity: 'none' }, { smtpUsername: 'other' }]) {
    assert.throws(() => settings.parseSiteSettings({ ...smtpView, mail: { ...smtpView.mail, ...patch } }, smtp), { code: 'VALIDATION_ERROR' })
  }
})

test('invalid mail settings are rejected before saving or sending', () => {
  const { settings } = settingsFixture()
  for (const value of [null, [], {}, { ...siteSettings(), mail: null }]) {
    assert.throws(() => settings.parseSiteSettings(value), { code: 'VALIDATION_ERROR' })
  }
  for (const siteUrl of ['javascript:alert(1)', 'https://user:password@example.com', 'https://example.com/?redirect=x', 'https://example.com/#fragment']) {
    assert.throws(() => settings.parseSiteSettings({ ...siteSettings(), siteUrl }), { code: 'VALIDATION_ERROR' })
  }
  for (const mail of [
    { from: 'Sender <mail@example.com>\r\nBcc: other@example.com' },
    { transport: 'unknown' },
    { preset: 'custom', apiUrl: 'file:///etc/passwd' },
    { preset: 'custom', apiUrl: 'https://user:secret@example.com/send' },
    { apiKey: '' },
    { transport: 'smtp', smtpPort: 0 },
    { transport: 'smtp', smtpPort: 65536 },
    { transport: 'smtp', preset: 'custom', smtpHost: 'smtp://example.com' },
  ]) {
    assert.throws(() => settings.parseSiteSettings(siteSettings(mail)), { code: 'VALIDATION_ERROR' })
  }
  const { settings: unconfigured } = settingsFixture(null)
  assert.throws(() => unconfigured.requireMailSettings(), { code: 'MAIL_NOT_CONFIGURED', statusCode: 503 })
})

function mailFixture({ fail = false, response = { id: 'message-id' } } = {}) {
  const calls = []
  let closed = 0
  const email = load('server/utils/email.ts', {
    'nodemailer': {
      createTransport: (options) => ({
        sendMail: async (message) => {
          calls.push({ options, message })
          if (fail) throw new Error('SMTP error containing test-api-secret')
          return { accepted: message.to }
        },
        close: () => { closed++ },
      }),
    },
    './errors': errors,
    './settings': { requireMailSettings: () => siteSettings() },
  }, {
    $fetch: async (url, options) => {
      calls.push({ url, options })
      if (fail) throw new Error('API error containing test-api-secret')
      return response
    },
  })
  return { email, calls, get closed() { return closed } }
}

test('SMTP supports each encryption mode and closes the transport after success or failure', async () => {
  for (const [smtpSecurity, expected] of [
    ['tls', [true, false, false]], ['starttls', [false, true, false]], ['none', [false, false, true]],
  ]) {
    const fixture = mailFixture()
    await fixture.email.sendTestEmail('admin@example.com', siteSettings({ transport: 'smtp', smtpSecurity }).mail)
    const { options, message } = fixture.calls[0]
    assert.deepEqual([options.secure, options.requireTLS, options.ignoreTLS], expected)
    assert.deepEqual(message.to, ['admin@example.com'])
    assert.equal(options.disableFileAccess, true)
    assert.equal(options.disableUrlAccess, true)
    assert.equal(fixture.closed, 1)
  }
  const failed = mailFixture({ fail: true })
  await assert.rejects(failed.email.sendTestEmail('admin@example.com', siteSettings({ transport: 'smtp' }).mail), (error) => {
    assert.equal(error.code, 'MAIL_SEND_FAILED')
    assert.doesNotMatch(error.message, /test-api-secret/)
    return true
  })
  assert.equal(failed.closed, 1)
})

test('API verification mail has the configured link, escaped HTML and a plain text alternative', async () => {
  const { email, calls } = mailFixture()
  await email.sendVerificationEmail({ email: 'member@example.com', displayName: '<img src=x onerror=alert(1)>' }, 'a'.repeat(43))
  const { url, options } = calls[0]
  assert.equal(url, 'https://api.resend.com/emails')
  assert.equal(options.headers.Authorization, 'Bearer test-api-secret')
  assert.equal(options.redirect, 'error')
  assert.equal(options.retry, 0)
  assert.deepEqual(options.body.to, ['member@example.com'])
  assert.match(options.body.html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(options.body.html, /<img/)
  assert.ok(options.body.text.includes(`https://market.example.com/verify-email?token=${'a'.repeat(43)}`))
  for (const response of [{ error: 'private provider error' }, { ok: false }, { success: false }]) {
    await assert.rejects(mailFixture({ response }).email.sendTestEmail('admin@example.com', siteSettings().mail), { code: 'MAIL_SEND_FAILED' })
  }
})

async function verificationFixture(t, { verified = false, configured = true } = {}) {
  const client = new DatabaseSync(':memory:')
  t.after(() => client.close())
  client.exec('PRAGMA foreign_keys = ON')
  const db = drizzle({ client })
  const context = {
    db, tables, dialect: 'sqlite',
    execDdl: async (sql) => client.exec(sql),
    raw: async (sql) => client.prepare(sql).all(),
  }
  await context.execDdl(ddlFor('sqlite'))
  await migrateSchema(context)
  const { settings, configService } = settingsFixture(configured ? siteSettings() : null)
  const captcha = load('server/utils/captcha.ts', {
    '../../shared/utils/mail': defaults,
    '../db/client': { getDb: async () => context },
    './errors': errors,
    './settings': settings,
  })
  const users = load('server/services/users.ts', {
    '../db/client': { getDb: async () => context },
    '../utils/errors': errors,
    '../utils/password': password,
    './avatars': { findAvatarVersion: async () => null },
  })
  const user = await users.createUser({ email: 'member@example.com', password: 'password-123', displayName: 'Member', emailVerified: verified })
  const sent = []
  const control = { failMail: false }
  const service = load('server/services/email-verification.ts', {
    '../db/client': { getDb: async () => context },
    '../utils/config': configService,
    '../utils/errors': errors,
    '../utils/settings': settings,
    '../utils/email': {
      sendVerificationEmail: async (recipient, token, mailSettings, changingEmail) => {
        if (control.failMail) throw errors.appError(502, 'MAIL_SEND_FAILED', 'Simulated mail failure')
        sent.push({ recipient, token, mailSettings, changingEmail })
      },
    },
  })
  const sessions = []
  const rateChecks = []
  const sessionService = {
    createSession: async (userId) => { sessions.push(userId); return 'session-token' },
    setSessionCookie: (event, token) => { event.cookie = token },
    resolveSessionUser: () => users.findUserById(user.id),
    destroyOtherSessions: async () => {},
  }
  function endpoint(name) {
    return load(`server/api/auth/${name}.ts`, {
      '../../services/users': users,
      '../../services/email-verification': service,
      '../../utils/captcha': captcha,
      '../../utils/errors': errors,
      '../../utils/password': password,
      '../../utils/rate-limit': { enforceMailRateLimit: (event, address) => rateChecks.push(address) },
      '../../utils/settings': settings,
      '../../utils/session': sessionService,
      '../../utils/validation': validation,
    }).default
  }
  return { client, db, context, configService, user, users, service, control, sent, sessions, rateChecks, endpoint }
}

test('existing SQLite accounts remain verified and newly created accounts require verification', async (t) => {
  const client = new DatabaseSync(':memory:')
  t.after(() => client.close())
  client.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  ); INSERT INTO users VALUES ('old', 'old@example.com', 'Old member', 'hash', 0, 1);`)
  const context = {
    dialect: 'sqlite', db: drizzle({ client }), tables,
    raw: async (sql) => client.prepare(sql).all(),
    execDdl: async (sql) => client.exec(sql),
  }
  await context.execDdl(ddlFor('sqlite'))
  await migrateSchema(context)
  await migrateSchema(context)
  const users = load('server/services/users.ts', {
    '../db/client': { getDb: async () => context },
    '../utils/errors': errors,
    '../utils/password': password,
    './avatars': { findAvatarVersion: async () => null },
  })
  assert.equal((await users.findUserById('old')).emailVerified, true)
  assert.equal((await users.createUser({ email: 'new@example.com', password: 'password-123' })).emailVerified, false)
  assert.equal((await users.createUser({ email: 'admin@example.com', password: 'password-123', isAdmin: true, emailVerified: true })).emailVerified, true)
})

test('verification stores only a hash, is single-use and removes other outstanding links', async (t) => {
  const f = await verificationFixture(t)
  await f.service.sendUserVerification(f.user)
  await f.service.sendUserVerification(f.user)
  const stored = await f.db.select().from(tables.emailVerificationTokens)
  assert.equal(stored.length, 2)
  assert.equal(stored[0].expiresAt - stored[0].createdAt, 24 * 60 * 60 * 1000)
  assert.ok(stored.every((row) => /^[a-f0-9]{64}$/.test(row.tokenHash)))
  assert.ok(stored.every((row) => !Object.values(row).includes(f.sent[0].token)))
  const results = await Promise.allSettled([
    f.service.verifyEmailToken(f.sent[0].token),
    f.service.verifyEmailToken(f.sent[0].token),
  ])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal((await f.users.findUserById(f.user.id)).emailVerified, true)
  assert.deepEqual(await f.db.select().from(tables.emailVerificationTokens), [])
  await assert.rejects(f.service.verifyEmailToken(f.sent[1].token), { code: 'TOKEN_INVALID' })
})

test('expired or malformed links cannot verify an account', async (t) => {
  const f = await verificationFixture(t)
  await f.service.sendUserVerification(f.user)
  await f.db.update(tables.emailVerificationTokens).set({ expiresAt: Date.now() - 1 })
  await assert.rejects(f.service.verifyEmailToken(f.sent[0].token), { code: 'TOKEN_EXPIRED', statusCode: 410 })
  for (const token of [null, [], {}, '', 'bad-token', 'a'.repeat(43)]) {
    await assert.rejects(f.service.verifyEmailToken(token), { code: 'TOKEN_INVALID' })
  }
  assert.equal((await f.users.findUserById(f.user.id)).emailVerified, false)
})

test('a failed resend removes only its token and leaves a previously delivered link usable', async (t) => {
  const f = await verificationFixture(t)
  await f.service.sendUserVerification(f.user)
  f.control.failMail = true
  await assert.rejects(f.service.sendUserVerification(f.user), { code: 'MAIL_SEND_FAILED' })
  assert.equal((await f.db.select().from(tables.emailVerificationTokens)).length, 1)
  await f.service.verifyEmailToken(f.sent[0].token)
  assert.equal((await f.users.findUserById(f.user.id)).emailVerified, true)
})

test('a token revoked after being claimed cannot update the account', async (t) => {
  const f = await verificationFixture(t)
  await f.service.sendUserVerification(f.user)
  const update = f.db.update.bind(f.db)
  f.db.update = (table) => {
    if (table === tables.users) f.client.exec('DELETE FROM email_verification_tokens')
    return update(table)
  }
  await assert.rejects(f.service.verifyEmailToken(f.sent[0].token), { code: 'TOKEN_INVALID' })
  assert.equal((await f.users.findUserById(f.user.id)).emailVerified, false)
})

test('email changes keep the old binding until confirmation and cannot revive old links', async (t) => {
  const f = await verificationFixture(t, { verified: true })
  const patch = f.endpoint('me.patch')
  const result = await patch({ body: { email: 'new@example.com', currentPassword: 'password-123', displayName: 'Renamed' } })
  assert.equal(result.pendingEmail, 'new@example.com')
  assert.equal(result.user.email, f.user.email)
  assert.equal(result.user.displayName, 'Renamed')
  assert.equal(f.sent[0].recipient.email, 'new@example.com')
  await f.service.sendUserVerification(await f.users.findUserById(f.user.id), 'new@example.com')
  assert.equal((await f.service.verifyEmailToken(f.sent[0].token)).changingEmail, true)
  const changed = await f.users.findUserById(f.user.id)
  assert.equal(changed.email, 'new@example.com')
  await f.service.sendUserVerification(changed, f.user.email)
  await f.service.verifyEmailToken(f.sent[2].token)
  await assert.rejects(f.service.verifyEmailToken(f.sent[1].token), { code: 'TOKEN_INVALID' })
})

test('mail delivery failures do not apply profile changes or change the current email', async (t) => {
  const f = await verificationFixture(t, { verified: true })
  f.control.failMail = true
  await assert.rejects(f.endpoint('me.patch')({ body: {
    email: 'new@example.com', currentPassword: 'password-123', displayName: 'Should not be saved',
  } }), { code: 'MAIL_SEND_FAILED' })
  assert.deepEqual(await f.users.findUserById(f.user.id), f.user)
  assert.deepEqual(await f.db.select().from(tables.emailVerificationTokens), [])
})

test('email claims that race with another registration return EMAIL_TAKEN', async (t) => {
  const f = await verificationFixture(t, { verified: true })
  await f.service.sendUserVerification(f.user, 'new@example.com')
  const update = f.db.update.bind(f.db)
  let raced = false
  f.db.update = (table) => {
    if (table === tables.users && !raced) {
      raced = true
      f.client.prepare('INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
        .run('competitor', 'new@example.com', 'Other member', 'hash', Date.now())
    }
    return update(table)
  }
  await assert.rejects(f.service.verifyEmailToken(f.sent[0].token), { code: 'EMAIL_TAKEN', statusCode: 409 })
  assert.equal((await f.users.findUserById(f.user.id)).email, f.user.email)
})

test('registration sends mail without a session and login requires verification', async (t) => {
  const f = await verificationFixture(t)
  const event = { body: { email: 'another@example.com', password: 'new-password' } }
  const result = await f.endpoint('register.post')(event)
  assert.equal(result.ok, true)
  assert.equal(event.cookie, undefined)
  assert.deepEqual(f.sessions, [])
  const registered = await f.users.findUserByEmail('another@example.com')
  assert.equal(registered.emailVerified, false)
  const login = f.endpoint('login.post')
  await assert.rejects(login(event), { code: 'EMAIL_NOT_VERIFIED', statusCode: 403 })
  assert.deepEqual(f.sessions, [])
  await f.service.verifyEmailToken(f.sent[0].token)
  await login(event)
  assert.equal(event.cookie, 'session-token')
  assert.deepEqual(f.sessions, [registered.id])
})

test('resending and retrying a pending registration require the original password', async (t) => {
  const f = await verificationFixture(t)
  const resend = f.endpoint('resend-verification.post')
  await resend({ body: { email: f.user.email, password: 'wrong-password' } })
  await resend({ body: { email: 'unknown@example.com', password: 'password-123' } })
  assert.equal(f.sent.length, 0)
  await resend({ body: { email: f.user.email, password: 'password-123' } })
  assert.equal(f.sent.length, 1)
  await assert.rejects(f.endpoint('register.post')({ body: { email: f.user.email, password: 'wrong-password' } }), { code: 'EMAIL_TAKEN' })
  await f.endpoint('register.post')({ body: { email: f.user.email, password: 'password-123', displayName: 'Overwrite attempt' } })
  assert.equal((await f.users.findUserById(f.user.id)).displayName, 'Member')
  assert.equal(f.sent.length, 2)
  await f.service.verifyEmailToken(f.sent[0].token)
  await resend({ body: { email: f.user.email, password: 'password-123' } })
  assert.equal(f.sent.length, 2)
})

test('missing mail settings prevent account creation and a failed send can be retried', async (t) => {
  const unconfigured = await verificationFixture(t, { configured: false })
  await assert.rejects(unconfigured.endpoint('register.post')({ body: { email: 'new@example.com', password: 'password-123' } }), { code: 'MAIL_NOT_CONFIGURED' })
  assert.equal(await unconfigured.users.findUserByEmail('new@example.com'), null)
  const f = await verificationFixture(t)
  f.control.failMail = true
  const event = { body: { email: 'new@example.com', password: 'password-123' } }
  await assert.rejects(f.endpoint('register.post')(event), { code: 'MAIL_SEND_FAILED' })
  assert.equal((await f.users.findUserByEmail('new@example.com')).emailVerified, false)
  assert.deepEqual(f.sessions, [])
  f.control.failMail = false
  await f.endpoint('register.post')(event)
  assert.equal(f.sent.length, 1)
})

test('changing a password invalidates pending email links', async (t) => {
  const f = await verificationFixture(t, { verified: true })
  await f.service.sendUserVerification(f.user, 'new@example.com')
  await f.endpoint('me.patch')({ body: { currentPassword: 'password-123', newPassword: 'changed-password' } })
  await assert.rejects(f.service.verifyEmailToken(f.sent[0].token), { code: 'TOKEN_INVALID' })
  assert.equal((await f.users.findUserById(f.user.id)).passwordHash, 'hashed:changed-password')
})

test('unverified users cannot use session cookies', async (t) => {
  const f = await verificationFixture(t)
  const session = load('server/utils/session.ts', {
    '../db/client': { getDb: async () => f.context },
    '../services/users': f.users,
    './config': f.configService,
    'h3': {
      getCookie: (event) => event.cookie,
      setCookie: (event, name, value) => { event.cookie = value },
      deleteCookie: (event) => { delete event.cookie },
      getRequestURL: () => new URL('https://market.example.com'),
    },
  })
  const event = {
    cookie: await session.createSession(f.user.id),
  }
  assert.equal(await session.resolveSessionUser(event), null)
  await f.db.update(tables.users).set({ emailVerified: true }).where(eq(tables.users.id, f.user.id))
  assert.equal((await session.resolveSessionUser(event)).id, f.user.id)

  const otherUser = await f.users.createUser({ email: 'other@example.com', password: 'other-password', emailVerified: true })
  const otherEvent = { cookie: await session.createSession(otherUser.id) }
  const otherCookie = otherEvent.cookie
  await session.destroyUserSessions(otherEvent, f.user.id)
  assert.equal(otherEvent.cookie, otherCookie)
  assert.equal(await session.resolveSessionUser(event), null)
  assert.equal((await session.resolveSessionUser(otherEvent)).id, otherUser.id)
  await session.destroyUserSessions(otherEvent, otherUser.id)
  assert.equal(otherEvent.cookie, undefined)
})

test('only an administrator can read, save or test mail settings, and tests use the current draft', async () => {
  const { settings, configService } = settingsFixture()
  const sent = []
  let allowed = false
  const access = {
    requireAdminUser: async () => {
      if (!allowed) throw errors.appError(403, 'FORBIDDEN', 'Admin required')
      return { id: 'admin', email: 'admin@example.com' }
    },
  }
  const globals = { setResponseHeader: (event, key, value) => { event.headers[key] = value } }
  const get = load('server/api/console/settings.get.ts', {
    '../../utils/api-token': access, '../../utils/settings': settings,
  }, globals).default
  const put = load('server/api/console/settings.put.ts', {
    '../../utils/api-token': access, '../../utils/settings': settings,
  }, globals).default
  const send = load('server/api/console/settings/test-email.post.ts', {
    '../../../utils/api-token': access,
    '../../../utils/settings': settings,
    '../../../utils/rate-limit': { enforceRateLimit: () => {} },
    '../../../utils/email': { sendTestEmail: async (to, mail) => { sent.push({ to, mail }) } },
  }, globals).default
  const event = { body: siteSettings(), headers: {} }
  for (const endpoint of [get, put, send]) await assert.rejects(endpoint(event), { code: 'FORBIDDEN' })
  assert.equal(sent.length, 0)

  allowed = true
  const view = await get(event)
  assert.equal(view.mail.apiKey, '')
  assert.equal(event.headers['Cache-Control'], 'no-store')
  const draft = { ...view, mail: { ...view.mail, from: 'Draft <draft@example.com>' } }
  await send({ ...event, body: draft })
  assert.equal(sent[0].to, 'admin@example.com')
  assert.equal(sent[0].mail.from, 'Draft <draft@example.com>')
  assert.equal(sent[0].mail.apiKey, 'test-api-secret')
  assert.equal(configService.readConfig().site.mail.from, 'Market <mail@example.com>')
  const saved = await put({ ...event, body: draft })
  assert.equal(saved.mail.apiKey, '')
  assert.equal(configService.readConfig().site.mail.from, 'Draft <draft@example.com>')
})

test('mail throttling shares an address cooldown and returns a retry interval', () => {
  const rate = load('server/utils/rate-limit.ts', {
    './errors': errors,
    'h3': {
      getRequestIP: (event) => event.ip,
      setResponseHeader: (event, key, value) => { event.headers[key] = value },
    },
  })
  assert.equal(rate.takeRateLimit('fixed-window', 1, 60, 1000), 0)
  assert.equal(rate.takeRateLimit('fixed-window', 1, 60, 2000), 59)
  assert.equal(rate.takeRateLimit('fixed-window', 1, 60, 61000), 0)
  rate.enforceMailRateLimit({ ip: 'first-client', headers: {} }, 'Member@Example.com')
  const event = { ip: 'another-client', headers: {} }
  assert.throws(() => rate.enforceMailRateLimit(event, 'member@example.com'), { code: 'RATE_LIMITED', statusCode: 429 })
  assert.ok(Number(event.headers['Retry-After']) > 0)
})
