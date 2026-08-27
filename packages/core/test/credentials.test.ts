// loadCredentials 容错：credentials.json 损坏时备份并重新生成，而非裸抛 SyntaxError
// 注意：store.ts 在模块加载时固化 BX_HOME，因此每个用例通过
// vi.resetModules() + 动态 import 在新临时目录下重新初始化。
import fs, { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

async function loadWithCorruptFile(
  content: string,
): Promise<{ token: string; backupExists: boolean; home: string }> {
  const home = mkdtempSync(path.join(tmpdir(), 'bx-cred-'))
  fs.writeFileSync(path.join(home, 'credentials.json'), content, 'utf8')
  process.env.BX_HOME = home
  vi.resetModules()
  const store = await import('../src/store')
  const cred = await store.loadCredentials()
  const files = fs.readdirSync(home).filter((f) => f.startsWith('credentials.json.corrupt-'))
  return { token: cred.token, backupExists: files.length > 0, home }
}

describe('loadCredentials 容错', () => {
  it('损坏 JSON：不抛异常并重新生成 token，坏文件已备份', async () => {
    const r = await loadWithCorruptFile('{ this is not json !!!')
    expect(r.backupExists).toBe(true)
    expect(r.token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('token 非字符串：轮换 token 但保留 dataRemote', async () => {
    const r = await loadWithCorruptFile(
      JSON.stringify({ token: 123, dataRemote: 'https://example.com/data.git' }),
    )
    expect(r.backupExists).toBe(true)
    const saved = JSON.parse(fs.readFileSync(path.join(r.home, 'credentials.json'), 'utf8')) as {
      token: string
      dataRemote: string
    }
    expect(saved.dataRemote).toBe('https://example.com/data.git')
    expect(saved.token).toBe(r.token)
  })

  it('正常文件：原样读取不触发备份', async () => {
    const r = await loadWithCorruptFile(JSON.stringify({ token: 'a'.repeat(64), dataRemote: null }))
    expect(r.backupExists).toBe(false)
    expect(r.token).toBe('a'.repeat(64))
  })
})
