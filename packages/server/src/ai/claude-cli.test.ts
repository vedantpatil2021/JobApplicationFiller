import { describe, it, expect } from 'vitest'
import { parseClaudeJsonOutput, buildClaudeArgs } from './claude-cli.js'

describe('parseClaudeJsonOutput', () => {
  it('prefers structured_output over the string result', () => {
    const raw = JSON.stringify([
      { type: 'assistant', message: {} },
      {
        type: 'result', subtype: 'success',
        result: '{"answers":[{"ref":"a","value":"Yes","confidence":0.9}]}',
        structured_output: { answers: [{ ref: 'a', value: 'Yes', confidence: 0.9 }] },
      },
    ])
    expect(parseClaudeJsonOutput(raw)).toEqual({
      answers: [{ ref: 'a', value: 'Yes', confidence: 0.9 }],
    })
  })

  it('parses result when structured_output is absent', () => {
    const raw = JSON.stringify([
      { type: 'result', subtype: 'success', result: '{"answers":[]}' },
    ])
    expect(parseClaudeJsonOutput(raw)).toEqual({ answers: [] })
  })

  it('throws when there is no result event', () => {
    expect(() => parseClaudeJsonOutput('[]')).toThrow(/no result/)
  })
})

describe('buildClaudeArgs', () => {
  it('isolates the CLI from the user global MCP/plugin config — M4.6 finding', () => {
    const args = buildClaudeArgs({ prompt: 'p', systemPrompt: 's', schema: { type: 'object' } })

    expect(args).toContain('--strict-mcp-config')
    expect(args).toContain('--tools')
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args).not.toContain('--bare')
    expect(args).not.toContain('--mcp-config')   // no config file passed + strict = zero MCP servers
  })
})
