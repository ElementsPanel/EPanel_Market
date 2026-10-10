const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { DatabaseSync } = require('node:sqlite')
const { test } = require('node:test')
const ts = require('typescript')
const { drizzle } = require('drizzle-orm/node-sqlite')

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
    setResponseHeader: (event, key, value) => { event.headers[key] = value },
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
const mailDefaults = load('shared/utils/mail.ts', { './captcha': captchaDefaults })
const tables = load('server/db/schema.sqlite.ts')
const { ddlFor } = load('server/db/ddl.ts')
const validation = load('server/utils/validation.ts', { './errors': errors })
const address = 'member@example.com'

function settingsFixture(provider = 'turnstile') {
  const site = {
    siteUrl: 'https://market.example.com',
    mail: { ...mailDefaults.createDefaultMailSettings(), from: 'mail@example.com', apiKey: 'mail-secret' },
    captcha: { enabled: true, provider, siteKey: 'public-site-key', secretKey: 'private-captcha-secret' },
  }
  const settings = load('server/utils/settings.ts', {
    '../../shared/utils/captcha': captchaDefaults,
    '../../shared/utils/mail': mailDefaults,
    './errors': errors,
    './config': {
      readConfig: () => ({ site }),
      writeConfigAtomic: () => { throw new Error('Unexpected configuration write') },
    },
  })
  return { site, settings }
}

function fixture(t, provider = 'turnstile') {
  const client = new DatabaseSync(':memory:')
  t.after(() => client.close())
  client.exec(ddlFor('sqlite'))
  const db = drizzle({ client })
  const { site, settings } = settingsFixture(provider)
  const calls = []
  const control = { result: null, error: null, beforeRespond: null }
  const service = load('server/utils/captcha.ts', {
    '../../shared/utils/mail': mailDefaults,
    '../db/client': { getDb: async () => ({ db, tables }) },
    './settings': settings,
    './errors': errors,
  }, {
    $fetch: async (url, options) => {
      calls.push({ url, options })
      if (control.error) throw control.error
      await control.beforeRespond?.()
      return control.result
    },
  })
  async function issue(action = 'login') {
    const challenge = await service.createAuthCaptchaChallenge(address, action)
    const proof = { requestId: challenge.requestId, token: 'provider-token' }
    control.result = {
      success: true,
      hostname: 'MARKET.example.com',
      action,
      cdata: proof.requestId,
      site_key: site.captcha.siteKey,
      request_id: proof.requestId,
    }
    return { challenge, proof }
  }
  return { client, db, site, service, calls, control, issue }
}

test('captcha settings mask secrets, preserve matching keys, and support older configurations', () => {
  const { site, settings } = settingsFixture()
  const view = settings.toSiteSettingsView(settings.getSiteSettings())
  assert.equal(view.captcha.secretKey, '')
  assert.equal(view.captcha.hasSecretKey, true)
  assert.ok(!JSON.stringify(view).includes(site.captcha.secretKey))
  assert.equal(settings.parseSiteSettings(view, site).captcha.secretKey, site.captcha.secretKey)
  assert.deepEqual(settings.parseSiteSettings({ ...view, captcha: undefined }, site).captcha, site.captcha)

  for (const patch of [
    { provider: 'recaptcha' }, { siteKey: 'another-site-key' }, { enabled: 'true' },
    { provider: 'constructor' }, { siteKey: 'invalid key' }, { secretKey: 'invalid key' },
  ]) {
    assert.throws(() => settings.parseSiteSettings({ ...view, captcha: { ...view.captcha, ...patch } }, site), { code: 'VALIDATION_ERROR' })
  }
  const replacement = settings.parseSiteSettings({
    ...view, captcha: { ...view.captcha, provider: 'recaptcha', secretKey: 'replacement-secret' },
  }, site)
  assert.equal(replacement.captcha.secretKey, 'replacement-secret')

  delete site.captcha
  assert.deepEqual(settings.getSiteSettings().captcha, captchaDefaults.createDefaultCaptchaSettings())
  assert.deepEqual(settings.parseSiteSettings(site).captcha, captchaDefaults.createDefaultCaptchaSettings())
})

test('disabled captcha leaves existing authentication usable without contacting a provider', async (t) => {
  const f = fixture(t)
  f.site.captcha.enabled = false
  assert.deepEqual(await f.service.createAuthCaptchaChallenge(address, 'login'), { enabled: false })
  await f.service.verifyAuthCaptcha(address, undefined, 'login')
  await f.service.verifyAuthCaptcha(address, undefined, 'register')
  assert.deepEqual(await f.db.select().from(tables.authCaptchaChallenges), [])
  assert.deepEqual(f.calls, [])

  f.site.captcha.enabled = true
  f.site.captcha.secretKey = ''
  await assert.rejects(f.service.createAuthCaptchaChallenge(address, 'login'), { code: 'CAPTCHA_UNAVAILABLE' })
  await assert.rejects(f.service.verifyAuthCaptcha(address, undefined, 'login'), { code: 'CAPTCHA_UNAVAILABLE' })
})

test('challenges bind the address, action, configuration and expiry without storing raw credentials', async (t) => {
  const f = fixture(t)
  const started = Date.now()
  const { challenge, proof } = await f.issue()
  const [row] = await f.db.select().from(tables.authCaptchaChallenges)
  assert.match(challenge.requestId, /^[a-f0-9]{64}$/)
  assert.notEqual(row.requestHash, challenge.requestId)
  assert.notEqual(row.emailHash, address)
  assert.ok(row.expiresAt >= started + 5 * 60_000)
  assert.ok(!JSON.stringify(row).includes(f.site.captcha.secretKey))
  assert.equal(challenge.secretKey, undefined)
  await assert.rejects(f.service.verifyAuthCaptcha('other@example.com', proof, 'login'), { code: 'CAPTCHA_INVALID' })
  await assert.rejects(f.service.verifyAuthCaptcha(address, proof, 'register'), { code: 'CAPTCHA_INVALID' })

  const previousKey = f.site.captcha.secretKey
  f.site.captcha.secretKey = 'rotated-secret'
  await assert.rejects(f.service.verifyAuthCaptcha(address, proof, 'login'), { code: 'CAPTCHA_INVALID' })
  f.site.captcha.secretKey = previousKey
  await f.db.update(tables.authCaptchaChallenges).set({ expiresAt: Date.now() - 1 })
  await assert.rejects(f.service.verifyAuthCaptcha(address, proof, 'login'), { code: 'CAPTCHA_INVALID' })
  assert.deepEqual(f.calls, [])

  const next = await f.issue()
  assert.notEqual(next.proof.requestId, proof.requestId)
  assert.equal((await f.db.select().from(tables.authCaptchaChallenges)).length, 1)
})

test('malformed and unknown proofs are rejected before any provider request', async (t) => {
  const f = fixture(t)
  const { proof } = await f.issue()
  for (const input of [
    undefined, null, [], {}, { ...proof, requestId: 'invalid' },
    { ...proof, token: '' }, { ...proof, token: ' ' }, { ...proof, token: 123 },
    { ...proof, token: 'a'.repeat(16385) },
  ]) {
    await assert.rejects(f.service.verifyAuthCaptcha(address, input, 'login'), { code: 'CAPTCHA_REQUIRED' })
  }
  await assert.rejects(f.service.verifyAuthCaptcha(address, { ...proof, requestId: '0'.repeat(64) }, 'login'), { code: 'CAPTCHA_INVALID' })
  assert.deepEqual(f.calls, [])
})

test('a successful proof can authenticate only once, including concurrent submissions', async (t) => {
  const f = fixture(t)
  const { proof } = await f.issue()
  const results = await Promise.allSettled([
    f.service.verifyAuthCaptcha(address, proof, 'login'),
    f.service.verifyAuthCaptcha(address, proof, 'login'),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'CAPTCHA_INVALID')
  const [row] = await f.db.select().from(tables.authCaptchaChallenges)
  assert.equal(typeof row.consumedAt, 'number')
  const requests = f.calls.length
  await assert.rejects(f.service.verifyAuthCaptcha(address, proof, 'login'), { code: 'CAPTCHA_INVALID' })
  assert.equal(f.calls.length, requests)
})

test('provider rejection, mismatched Turnstile claims and outages fail closed', async (t) => {
  const f = fixture(t)
  const { proof } = await f.issue()
  const valid = f.control.result
  for (const result of [
    null, { success: false }, { ...valid, success: 'true' },
    { ...valid, hostname: 'another.example.com' }, { ...valid, hostname: undefined },
    { ...valid, action: 'register' }, { ...valid, cdata: 'another-request' },
  ]) {
    f.control.result = result
    await assert.rejects(f.service.verifyAuthCaptcha(address, proof, 'login'), { code: 'CAPTCHA_INVALID' })
  }
  f.control.error = new Error('Provider error: ' + f.site.captcha.secretKey)
  await assert.rejects(f.service.verifyAuthCaptcha(address, proof, 'login'), (error) => {
    assert.equal(error.code, 'CAPTCHA_UNAVAILABLE')
    assert.equal(error.statusCode, 502)
    assert.ok(!error.message.includes(f.site.captcha.secretKey))
    return true
  })
  assert.equal((await f.db.select().from(tables.authCaptchaChallenges))[0].consumedAt, null)
})

test('a challenge that expires during provider verification cannot authenticate', async (t) => {
  const f = fixture(t)
  const { proof } = await f.issue()
  f.control.beforeRespond = () => f.db.update(tables.authCaptchaChallenges).set({ expiresAt: Date.now() - 1 })
  await assert.rejects(f.service.verifyAuthCaptcha(address, proof, 'login'), { code: 'CAPTCHA_INVALID' })
})

test('reCAPTCHA uses form verification and validates the configured hostname', async (t) => {
  const f = fixture(t, 'recaptcha')
  const { proof } = await f.issue('register')
  f.control.result = { success: true, hostname: 'MARKET.example.com' }
  await f.service.verifyAuthCaptcha(address, proof, 'register')
  const { url, options } = f.calls[0]
  assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify')
  assert.deepEqual(Object.fromEntries(new URLSearchParams(options.body)), {
    secret: f.site.captcha.secretKey, response: proof.token,
  })
  assert.equal(options.redirect, 'error')
  assert.equal(options.retry, 0)
  assert.equal(options.timeout, 10000)
})

test('BotFlush sends the action and request ID and rejects mismatched returned claims', async (t) => {
  const f = fixture(t, 'botflush')
  const { proof } = await f.issue('register')
  for (const claim of [{ site_key: 'another-site' }, { action: 'login' }, { request_id: 'another-request' }]) {
    f.control.result = { success: true, ...claim }
    await assert.rejects(f.service.verifyAuthCaptcha(address, proof, 'register'), { code: 'CAPTCHA_INVALID' })
  }
  f.control.result = { success: true }
  await f.service.verifyAuthCaptcha(address, proof, 'register')
  assert.equal(f.calls[0].url, 'https://challenge.botflush.com/api/siteverify')
  assert.deepEqual(f.calls[0].options.body, {
    secret: f.site.captcha.secretKey, token: proof.token, action: 'register', request_id: proof.requestId,
  })
})

test('challenge endpoint normalizes email, validates the action, limits requests and disables caching', async () => {
  const calls = []
  const limits = []
  const endpoint = load('server/api/auth/captcha.post.ts', {
    '../../utils/captcha': { createAuthCaptchaChallenge: async (...args) => { calls.push(args); return { enabled: false } } },
    '../../utils/errors': errors,
    '../../utils/rate-limit': { enforceRateLimit: (...args) => { limits.push(args) } },
    '../../utils/validation': validation,
  }).default
  const event = { body: { email: ' Member@Example.com ', action: 'register' }, headers: {} }
  assert.deepEqual(await endpoint(event), { enabled: false })
  assert.deepEqual(calls, [[address, 'register']])
  assert.equal(event.headers['Cache-Control'], 'no-store')
  assert.deepEqual(limits[0].slice(1), ['auth-captcha', 30, 60])
  for (const body of [null, { email: 'invalid' }, { email: address, action: 'reset' }]) {
    await assert.rejects(endpoint({ body, headers: {} }), { code: 'VALIDATION_ERROR' })
  }
  assert.equal(calls.length, 1)
})

test('login and registration require valid proofs before user, session or email operations', async (t) => {
  for (const action of ['login', 'register']) {
    const f = fixture(t)
    const effects = []
    const user = { id: 'member', email: address, emailVerified: true, passwordHash: 'hash' }
    const endpoint = load('server/api/auth/' + action + '.post.ts', {
      '../../utils/captcha': f.service,
      '../../utils/errors': errors,
      '../../utils/validation': validation,
      '../../utils/password': { verifyPassword: async () => { effects.push('password'); return true } },
      '../../utils/settings': { requireMailSettings: () => { effects.push('mail-settings') } },
      '../../utils/rate-limit': { enforceMailRateLimit: () => { effects.push('mail-limit') } },
      '../../utils/session': {
        createSession: async () => { effects.push('session'); return 'session-token' },
        setSessionCookie: (event, token) => { event.cookie = token },
      },
      '../../services/users': {
        findUserByEmail: async () => { effects.push('lookup'); return action === 'login' ? user : null },
        createUser: async () => { effects.push('create'); return user },
        toAuthUser: async (value) => value,
      },
      '../../services/email-verification': { sendUserVerification: async () => { effects.push('email') } },
    }).default
    const event = { body: { email: ' Member@Example.com ', password: 'password-123' } }
    await assert.rejects(endpoint(event), { code: 'CAPTCHA_REQUIRED' })
    assert.deepEqual(effects, [])
    assert.equal(event.cookie, undefined)

    const wrongAction = await f.issue(action === 'login' ? 'register' : 'login')
    await assert.rejects(endpoint({ body: { ...event.body, captcha: wrongAction.proof } }), { code: 'CAPTCHA_INVALID' })
    assert.deepEqual(effects, [])

    const { proof } = await f.issue(action)
    event.body.captcha = proof
    await endpoint(event)
    if (action === 'login') {
      assert.equal(event.cookie, 'session-token')
      assert.deepEqual(effects, ['lookup', 'password', 'session'])
    } else {
      assert.equal(event.cookie, undefined)
      assert.deepEqual(effects, ['mail-settings', 'mail-limit', 'lookup', 'create', 'email'])
    }
    const previousEffects = effects.length
    await assert.rejects(endpoint(event), { code: 'CAPTCHA_INVALID' })
    assert.equal(effects.length, previousEffects)
  }
})
