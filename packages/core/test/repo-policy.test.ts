import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import * as policy from '../src/repo-policy'
import { makeRepo, commit } from './helpers/repo'

describe('repo-policy: package manager detection (R26)', () => {
  it('按锁文件优先级探测', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bxverse-pm-'))
    expect(policy.detectPackageManager(dir)).toBeNull()
    writeFileSync(path.join(dir, 'package-lock.json'), '{}')
    expect(policy.detectPackageManager(dir)).toBe('npm')
    writeFileSync(path.join(dir, 'yarn.lock'), '')
    // bun > pnpm > yarn > npm，已有 yarn.lock 时仍为 yarn（yarn 优先于 npm）
    expect(policy.detectPackageManager(dir)).toBe('yarn')
    writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '')
    expect(policy.detectPackageManager(dir)).toBe('pnpm')
    writeFileSync(path.join(dir, 'bun.lockb'), '')
    expect(policy.detectPackageManager(dir)).toBe('bun')
  })

  it('getDefaultInstallCommand 映射', () => {
    expect(policy.getDefaultInstallCommand('pnpm')).toBe('pnpm install --frozen-lockfile')
    expect(policy.getDefaultInstallCommand('npm')).toBe('npm ci')
    expect(policy.getDefaultInstallCommand('yarn')).toBe('yarn install --frozen-lockfile')
    expect(policy.getDefaultInstallCommand('bun')).toBe('bun install --frozen-lockfile')
    expect(policy.getDefaultInstallCommand(null)).toBeNull()
  })

  it('resolveInstallCommand 显式优先与 skip', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bxverse-resolve-'))
    writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '')
    expect(policy.resolveInstallCommand(dir, 'skip')).toBeNull()
    expect(policy.resolveInstallCommand(dir, 'SKIP')).toBeNull()
    expect(policy.resolveInstallCommand(dir, 'pnpm install')).toBe('pnpm install')
    // 未显式时按探测推导
    expect(policy.resolveInstallCommand(dir, undefined)).toBe('pnpm install --frozen-lockfile')
    // pmOverride 覆盖探测
    expect(policy.resolveInstallCommand(dir, undefined, 'npm')).toBe('npm ci')
  })

  it('listLockFiles 列出已存在锁文件', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bxverse-locks-'))
    writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '')
    writeFileSync(path.join(dir, 'package-lock.json'), '{}')
    const locks = policy.listLockFiles(dir)
    expect(locks).toContain('pnpm-lock.yaml')
    expect(locks).toContain('package-lock.json')
  })
})

describe('repo-policy: package.json version (R26)', () => {
  it('readPackageVersion / updatePackageVersion 写入 X.Y.Z 核心', () => {
    const dir = makeRepo()
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2))
    execFileSync('git', ['add', 'package.json'], { cwd: dir })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir })

    expect(policy.readPackageVersion(dir)).toBe('1.0.0')
    const r1 = policy.updatePackageVersion(dir, 'v1.2.0')
    expect(r1).toEqual({ previous: '1.0.0', next: '1.2.0' })
    expect(policy.readPackageVersion(dir)).toBe('1.2.0')
    // 幂等：同版本再次调用不改文件
    const r2 = policy.updatePackageVersion(dir, 'v1.2.0')
    expect(r2.previous).toBe('1.2.0')
  })

  it('updatePackageVersion 无 package.json 抛错', () => {
    const dir = makeRepo()
    expect(() => policy.updatePackageVersion(dir, 'v1.0.0')).toThrow('未找到仓库根 package.json')
  })

  it('commitVersionFiles 仅提交白名单文件', async () => {
    const dir = makeRepo()
    commit(dir, 'init', { 'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2) })
    // 模拟发布前 bump：先写 package.json
    policy.updatePackageVersion(dir, 'v1.2.0')
    // 写一个非白名单文件（不应被提交）
    writeFileSync(path.join(dir, 'README.md'), 'hello')
    const res = await policy.commitVersionFiles(dir, 'chore(release): 1.2.0')
    expect(res.committed).toBe(true)
    // 验证 README 未被提交（仍在工作区）
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir }).toString()
    expect(status).toContain('README.md')
    // package.json 已干净
    const pkgStatus = execFileSync('git', ['diff', '--name-only'], { cwd: dir }).toString().trim()
    expect(pkgStatus).toBe('')
  })

  it('commitVersionFiles 无变更返回 committed=false', async () => {
    const dir = makeRepo()
    commit(dir, 'init', { 'package.json': JSON.stringify({ name: 'demo', version: '1.2.0' }, null, 2) })
    const res = await policy.commitVersionFiles(dir, 'chore(release): 1.2.0')
    expect(res.committed).toBe(false)
  })
})
