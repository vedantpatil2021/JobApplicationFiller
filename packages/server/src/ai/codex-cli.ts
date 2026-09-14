import { spawn } from 'node:child_process'
import { CliError, parseClaudeJsonOutput } from './claude-cli.js'

/** Fallback when Claude is rate-limited or unauthenticated — same argv-array rule. */
export function runCodex(args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new CliError('Codex CLI timed out after 60s', 'timeout'))
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', err => {
      clearTimeout(timer)
      reject(new CliError(err.message, 'failed'))
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new CliError(stderr.trim() || `codex exited ${code}`, 'failed'))
        return
      }
      resolve(stdout)
    })
  })
}

export async function codexMapFields(prompt: string, schema: object): Promise<unknown> {
  const stdout = await runCodex([
    'exec',
    '--json',
    '--schema', JSON.stringify(schema),
    prompt,
  ])
  // codex exec --json may return a single object or Claude-like stream; try both.
  try {
    return parseClaudeJsonOutput(stdout)
  } catch {
    return JSON.parse(stdout) as unknown
  }
}
