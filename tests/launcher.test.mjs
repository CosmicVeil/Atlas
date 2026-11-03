import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { buildEnv, isAtlasDir, parseArgs, parsePythonVersion, resolveProjectDir } from '../bin/launcher.mjs'

function makeCheckout(dir) {
  fs.mkdirSync(path.join(dir, 'backend'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'frontend'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'backend', 'wsgi.py'), '')
  fs.writeFileSync(path.join(dir, 'frontend', 'package.json'), '{}')
  fs.writeFileSync(path.join(dir, 'run.py'), '')
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-launcher-'))
}

test('isAtlasDir needs backend, frontend and run.py', () => {
  const dir = tempDir()
  assert.equal(isAtlasDir(dir), false)
  makeCheckout(dir)
  assert.equal(isAtlasDir(dir), true)
  fs.rmSync(path.join(dir, 'run.py'))
  assert.equal(isAtlasDir(dir), false)
})

test('resolveProjectDir uses the current folder when it is a checkout', () => {
  const dir = tempDir()
  makeCheckout(dir)
  assert.deepEqual(resolveProjectDir(dir, null), { dir, clone: false })
})

test('resolveProjectDir clones into ./Atlas from an unrelated folder', () => {
  const cwd = tempDir()
  assert.deepEqual(resolveProjectDir(cwd, null), { dir: path.join(cwd, 'Atlas'), clone: true })
})

test('resolveProjectDir reuses an existing ./Atlas checkout', () => {
  const cwd = tempDir()
  makeCheckout(path.join(cwd, 'Atlas'))
  assert.deepEqual(resolveProjectDir(cwd, null), { dir: path.join(cwd, 'Atlas'), clone: false })
})

test('resolveProjectDir honours an explicit folder', () => {
  const cwd = tempDir()
  assert.deepEqual(resolveProjectDir(cwd, 'my-atlas'), { dir: path.join(cwd, 'my-atlas'), clone: true })
  makeCheckout(path.join(cwd, 'my-atlas'))
  assert.deepEqual(resolveProjectDir(cwd, 'my-atlas'), { dir: path.join(cwd, 'my-atlas'), clone: false })
})

test('buildEnv replaces placeholder secrets and points Mongo at localhost', () => {
  const example = [
    '# comment',
    'SECRET_KEY=dev-secret-change-this',
    'JWT_SECRET_KEY=dev-jwt-secret-change-this',
    'MONGO_URI=mongodb://mongo:27017',
    'OPENAI_API_KEY=',
  ].join('\n')
  let n = 0
  const env = buildEnv(example, () => `random${++n}`)
  assert.equal(
    env,
    ['# comment', 'SECRET_KEY=random1', 'JWT_SECRET_KEY=random2', 'MONGO_URI=mongodb://localhost:27017', 'OPENAI_API_KEY='].join('\n'),
  )
})

test('buildEnv generates different secrets by default', () => {
  const env = buildEnv('SECRET_KEY=x\nJWT_SECRET_KEY=x')
  const [secret, jwt] = env.split('\n').map((line) => line.split('=')[1])
  assert.match(secret, /^[0-9a-f]{64}$/)
  assert.notEqual(secret, jwt)
})

test('parseArgs reads folder and flags', () => {
  assert.deepEqual(parseArgs([]), { target: null, start: true, help: false })
  assert.deepEqual(parseArgs(['dir', '--no-start']), { target: 'dir', start: false, help: false })
  assert.equal(parseArgs(['-h']).help, true)
  assert.throws(() => parseArgs(['--bogus']), /Unknown option/)
})

test('parsePythonVersion reads python --version output', () => {
  assert.deepEqual(parsePythonVersion('Python 3.12.2\n'), [3, 12])
  assert.equal(parsePythonVersion('command not found'), null)
})
