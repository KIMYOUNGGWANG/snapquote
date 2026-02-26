import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const mockDir = path.join(root, 'tests', 'mocks')

const SPECIFIER_MAP = new Map([
  ['next/server', path.join(mockDir, 'next-server.mjs')],
  ['@supabase/supabase-js', path.join(mockDir, 'supabase-js.mjs')],
  ['stripe', path.join(mockDir, 'stripe.mjs')],
  ['resend', path.join(mockDir, 'resend.mjs')],
  ['openai', path.join(mockDir, 'openai.mjs')],
  ['@/lib/openai', path.join(mockDir, 'openai-client.mjs')],
  ['@/lib/rate-limit', path.join(mockDir, 'rate-limit.mjs')],
  ['@/lib/server/usage-quota', path.join(mockDir, 'usage-quota.mjs')],
  ['@/lib/server/route-auth', path.join(mockDir, 'route-auth.mjs')],
  ['@/lib/server/supabase-auth', path.join(mockDir, 'supabase-auth.mjs')],
  ['@/lib/ops-alerts', path.join(mockDir, 'ops-alerts.mjs')],
])

function fileCandidate(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.mjs'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
  }

  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (SPECIFIER_MAP.has(specifier)) {
    const target = SPECIFIER_MAP.get(specifier)
    return {
      url: pathToFileURL(target).href,
      shortCircuit: true,
    }
  }

  if (specifier.startsWith('@/')) {
    const mapped = fileCandidate(path.join(root, specifier.slice(2)))
    if (mapped) {
      return {
        url: pathToFileURL(mapped).href,
        shortCircuit: true,
      }
    }
  }

  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const parentPath = new URL(context.parentURL)
    const parentDir = path.dirname(parentPath.pathname)
    const mapped = fileCandidate(path.resolve(parentDir, specifier))

    if (mapped) {
      return {
        url: pathToFileURL(mapped).href,
        shortCircuit: true,
      }
    }
  }

  return nextResolve(specifier, context)
}

function shouldTranspileTypeScript(url) {
  if (!url.startsWith('file:')) return false
  return (
    url.endsWith('.ts') ||
    url.endsWith('.tsx') ||
    url.endsWith('.mts')
  )
}

export async function load(url, context, nextLoad) {
  if (!shouldTranspileTypeScript(url)) {
    return nextLoad(url, context)
  }

  const filePath = new URL(url)
  const sourceText = await fsp.readFile(filePath, 'utf8')
  const transpiled = ts.transpileModule(sourceText, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.Preserve,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      resolveJsonModule: true,
    },
    fileName: filePath.pathname,
  })

  return {
    format: 'module',
    source: transpiled.outputText,
    shortCircuit: true,
  }
}
