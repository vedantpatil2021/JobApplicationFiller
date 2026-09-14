import { spawn } from 'node:child_process'

interface StreamEvent {
  type: string
  subtype?: string
  structured_output?: unknown
  result?: string
}

/** Spec §5: `--output-format json` returns an array of stream events. */
export function parseClaudeJsonOutput(raw: string): unknown {
  const events = JSON.parse(raw) as StreamEvent[]
  if (!Array.isArray(events)) throw new Error('CLI output is not a JSON array')
  const hit = [...events].reverse().find(e => e.type === 'result')
  if (!hit) throw new Error('CLI output has no result event')
  if (hit.structured_output !== undefined) return hit.structured_output
  if (hit.result) return JSON.parse(hit.result) as unknown
  throw new Error('CLI result event is empty')
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly code: 'auth' | 'rate_limit' | 'timeout' | 'failed',
  ) {
    super(message)
    this.name = 'CliError'
  }
}

function classifyStderr(stderr: string): CliError['code'] {
  const s = stderr.toLowerCase()
  if (/not logged in|authentication|login required|unauthorized/.test(s)) return 'auth'
  if (/rate.?limit|too many requests|resetsat/.test(s)) return 'rate_limit'
  return 'failed'
}

/**
 * Spawn claude with an argv array — never a shell string (PLAN.md hard rule).
 * Kills the child after 60s (spec §4.21).
 */
export function runClaude(args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new CliError('Claude CLI timed out after 60s', 'timeout'))
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
        reject(new CliError(stderr.trim() || `claude exited ${code}`, classifyStderr(stderr)))
        return
      }
      resolve(stdout)
    })
  })
}

export interface ClaudeMapFieldsArgs {
  prompt: string
  systemPrompt: string
  schema: object
}

/** Verified invocation from spec §5 — never uses --bare. */
export async function claudeMapFields(args: ClaudeMapFieldsArgs): Promise<unknown> {
  const stdout = await runClaude([
    '-p', args.prompt,
    '--system-prompt', args.systemPrompt,
    '--json-schema', JSON.stringify(args.schema),
    '--tools', '',
    '--no-session-persistence',
    '--output-format', 'json',
    '--model', 'sonnet',
  ])
  return parseClaudeJsonOutput(stdout)
}
