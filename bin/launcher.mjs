// Setup steps behind `npx github:CosmicVeil/Atlas`: find or clone the project,
// install backend and frontend dependencies, create backend/.env, then hand off
// to run.py, which starts Flask and Vite together.
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const REPO_URL = 'https://github.com/CosmicVeil/Atlas.git'
const isWin = process.platform === 'win32'
const MIN_PYTHON = [3, 9]

export function isAtlasDir(dir) {
  return (
    fs.existsSync(path.join(dir, 'backend', 'wsgi.py')) &&
    fs.existsSync(path.join(dir, 'frontend', 'package.json')) &&
    fs.existsSync(path.join(dir, 'run.py'))
  )
}

// Returns { dir, clone }: an existing checkout to use, or where to clone one.
// Order: explicit target, the current folder, then ./Atlas.
export function resolveProjectDir(cwd, target) {
  if (target) {
    const dir = path.resolve(cwd, target)
    return { dir, clone: !isAtlasDir(dir) }
  }
  if (isAtlasDir(cwd)) return { dir: cwd, clone: false }
  const dir = path.join(cwd, 'Atlas')
  return { dir, clone: !isAtlasDir(dir) }
}

// Turns .env.example into a working local .env: fresh signing secrets instead
// of the shared placeholders, and a MONGO_URI that resolves from the host
// (the Docker services override MONGO_URI themselves, so this is safe for them).
export function buildEnv(example, randomHex = () => crypto.randomBytes(32).toString('hex')) {
  return example
    .split('\n')
    .map((line) => {
      if (/^SECRET_KEY=/.test(line)) return `SECRET_KEY=${randomHex()}`
      if (/^JWT_SECRET_KEY=/.test(line)) return `JWT_SECRET_KEY=${randomHex()}`
      if (/^MONGO_URI=/.test(line)) return 'MONGO_URI=mongodb://localhost:27017'
      return line
    })
    .join('\n')
}

export function parseArgs(argv) {
  const opts = { target: null, start: true, help: false }
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--no-start') opts.start = false
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
    else opts.target = arg
  }
  return opts
}

export function parsePythonVersion(output) {
  const match = /Python (\d+)\.(\d+)/.exec(output)
  return match ? [Number(match[1]), Number(match[2])] : null
}

function versionAtLeast([major, minor], [minMajor, minMinor]) {
  return major > minMajor || (major === minMajor && minor >= minMinor)
}

function log(message) {
  console.log(`\x1b[36m[atlas]\x1b[0m ${message}`)
}

function fail(message) {
  console.error(`\x1b[31m[atlas]\x1b[0m ${message}`)
  process.exit(1)
}

// npm is a .cmd shim on Windows, which Node only runs through a shell.
function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin && cmd === 'npm' })
  if (result.error) fail(`Could not run ${cmd}: ${result.error.message}`)
  if (result.status !== 0) fail(`\`${cmd} ${args.join(' ')}\` failed (exit ${result.status}).`)
}

function findPython() {
  const candidates = isWin ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]]
  for (const [cmd, prefix] of candidates) {
    const result = spawnSync(cmd, [...prefix, '--version'], { encoding: 'utf8' })
    const version = parsePythonVersion(`${result.stdout}${result.stderr}`)
    if (version && versionAtLeast(version, MIN_PYTHON)) return { cmd, prefix }
  }
  return null
}

function fileHash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

// Re-runs an install only when its input file (requirements.txt,
// package-lock.json) changed since the last successful install.
function installIfChanged(inputFile, stampFile, install) {
  const hash = fileHash(inputFile)
  if (fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === hash) return false
  install()
  fs.writeFileSync(stampFile, hash)
  return true
}

function setupBackend(root) {
  const backend = path.join(root, 'backend')
  const venvPython = isWin
    ? path.join(backend, '.venv', 'Scripts', 'python.exe')
    : path.join(backend, '.venv', 'bin', 'python')

  if (!fs.existsSync(venvPython)) {
    const python = findPython()
    if (!python) fail(`Python ${MIN_PYTHON.join('.')}+ is required. Install it from https://www.python.org/downloads/ and re-run.`)
    log('Creating Python virtual environment in backend/.venv...')
    run(python.cmd, [...python.prefix, '-m', 'venv', '.venv'], backend)
  }

  const installed = installIfChanged(
    path.join(backend, 'requirements.txt'),
    path.join(backend, '.venv', '.atlas-requirements-sha256'),
    () => {
      log('Installing backend dependencies...')
      run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', 'requirements.txt'], backend)
    },
  )
  if (!installed) log('Backend dependencies up to date.')

  const envFile = path.join(backend, '.env')
  if (!fs.existsSync(envFile)) {
    const example = fs.readFileSync(path.join(backend, '.env.example'), 'utf8')
    fs.writeFileSync(envFile, buildEnv(example))
    log('Created backend/.env. AI and news API keys are optional; add them there to enable those features.')
  }
  return venvPython
}

function setupFrontend(root) {
  const frontend = path.join(root, 'frontend')
  // The stamp lives inside node_modules, so deleting node_modules forces a reinstall.
  const stamp = path.join(frontend, 'node_modules', '.atlas-lock-sha256')
  const installed = installIfChanged(path.join(frontend, 'package-lock.json'), stamp, () => {
    log('Installing frontend dependencies...')
    run('npm', ['install', '--no-audit', '--no-fund'], frontend)
  })
  if (!installed) log('Frontend dependencies up to date.')
}

const HELP = `Usage: npx github:CosmicVeil/Atlas [folder] [--no-start]

Sets up and starts Atlas (Flask backend + Vite frontend).

  folder       Where the project lives or should be cloned (default: current
               folder if it is an Atlas checkout, otherwise ./Atlas)
  --no-start   Install everything but don't start the servers
  -h, --help   Show this help

Needs git, Python ${MIN_PYTHON.join('.')}+ and Node 18+.`

export function main(argv) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (err) {
    fail(`${err.message}\n\n${HELP}`)
  }
  if (opts.help) {
    console.log(HELP)
    return
  }

  const { dir, clone } = resolveProjectDir(process.cwd(), opts.target)
  if (clone) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
      fail(`${dir} exists but isn't an Atlas checkout. Pick another folder: npx github:CosmicVeil/Atlas <folder>`)
    }
    log(`Cloning Atlas into ${dir}...`)
    run('git', ['clone', REPO_URL, dir], process.cwd())
  } else {
    log(`Using Atlas at ${dir}`)
  }

  const venvPython = setupBackend(dir)
  setupFrontend(dir)

  if (!opts.start) {
    log(`Setup complete. Start it later with: cd ${path.relative(process.cwd(), dir) || '.'} && npm start`)
    return
  }

  // Ctrl+C reaches run.py too (same process group); let it stop both servers
  // and exit on its own instead of this process dying first.
  process.on('SIGINT', () => {})
  log('Starting Atlas. Open the frontend URL Vite prints below (backend: http://localhost:5000).')
  const child = spawn(venvPython, ['run.py'], { cwd: dir, stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
}
