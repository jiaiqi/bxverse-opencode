import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2),
    )
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
    commit(dir, 'init', {
      'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2),
    })
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
    commit(dir, 'init', {
      'package.json': JSON.stringify({ name: 'demo', version: '1.2.0' }, null, 2),
    })
    const res = await policy.commitVersionFiles(dir, 'chore(release): 1.2.0')
    expect(res.committed).toBe(false)
  })
})

describe('repo-policy: B 方向多栈 versionSource (gradle/cargo/goModule)', () => {
  it('detectVersionSource 按文件优先级探测（gradle > cargo > goModule > packageJson > derived）', () => {
    // 空仓库 → derived
    const dir1 = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-'))
    expect(policy.detectVersionSource(dir1)).toBe('derived')

    // 只有 package.json → packageJson
    const dir2 = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-'))
    writeFileSync(path.join(dir2, 'package.json'), '{"name":"x","version":"1.0.0"}')
    expect(policy.detectVersionSource(dir2)).toBe('packageJson')

    // 同时有 package.json + Cargo.toml → cargo 优先
    const dir3 = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-'))
    writeFileSync(path.join(dir3, 'package.json'), '{}')
    writeFileSync(path.join(dir3, 'Cargo.toml'), '[package]\nname="x"\nversion="1.0.0"\n')
    expect(policy.detectVersionSource(dir3)).toBe('cargo')

    // build.gradle 优先于 Cargo.toml
    const dir4 = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-'))
    writeFileSync(path.join(dir4, 'build.gradle'), 'version = "1.0.0"')
    writeFileSync(path.join(dir4, 'Cargo.toml'), '[package]\nversion="1.0.0"\n')
    expect(policy.detectVersionSource(dir4)).toBe('gradle')

    // build.gradle.kts 也算 gradle
    const dir5 = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-'))
    writeFileSync(path.join(dir5, 'build.gradle.kts'), 'version = "1.0.0"')
    expect(policy.detectVersionSource(dir5)).toBe('gradle')

    // go.mod
    const dir6 = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-'))
    writeFileSync(path.join(dir6, 'go.mod'), 'module example.com/x\n\ngo 1.21\n')
    expect(policy.detectVersionSource(dir6)).toBe('goModule')
  })

  it('readVersionBySource + writeVersionBySource round-trip（packageJson/gradle/cargo）', () => {
    // packageJson round-trip
    const dirP = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-pj-'))
    writeFileSync(path.join(dirP, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }))
    expect(policy.readVersionBySource(dirP, 'packageJson')).toBe('1.0.0')
    const w1 = policy.writeVersionBySource(dirP, 'packageJson', 'v1.2.0')
    expect(w1).toEqual({ previous: '1.0.0', next: '1.2.0' })
    expect(policy.readVersionBySource(dirP, 'packageJson')).toBe('1.2.0')

    // gradle（Groovy DSL）
    const dirG = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-gr-'))
    writeFileSync(
      path.join(dirG, 'build.gradle'),
      '// 顶层注释\nplugins { id "java" }\ngroup = "com.example"\nversion = "1.0.0-SNAPSHOT"\n',
    )
    expect(policy.readVersionBySource(dirG, 'gradle')).toBe('1.0.0-SNAPSHOT')
    const w2 = policy.writeVersionBySource(dirG, 'gradle', 'v1.1.0')
    expect(w2).toEqual({ previous: '1.0.0-SNAPSHOT', next: '1.1.0' })
    expect(policy.readVersionBySource(dirG, 'gradle')).toBe('1.1.0')
    // 注释行未被破坏
    const after = readFileSync(path.join(dirG, 'build.gradle'), 'utf8')
    expect(after).toContain('// 顶层注释')
    expect(after).toContain('plugins { id "java" }')

    // cargo
    const dirC = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-ca-'))
    writeFileSync(
      path.join(dirC, 'Cargo.toml'),
      '[package]\nname = "x"\nversion = "1.0.0"\nedition = "2021"\n\n[dependencies]\nserde = "1"\n',
    )
    expect(policy.readVersionBySource(dirC, 'cargo')).toBe('1.0.0')
    const w3 = policy.writeVersionBySource(dirC, 'cargo', '2.0.0')
    expect(w3).toEqual({ previous: '1.0.0', next: '2.0.0' })
    expect(policy.readVersionBySource(dirC, 'cargo')).toBe('2.0.0')
    // edition 字段未变
    const cargoAfter = readFileSync(path.join(dirC, 'Cargo.toml'), 'utf8')
    expect(cargoAfter).toContain('edition = "2021"')
  })

  it('cargo 写时只动 [package] section，不动 [workspace.package] / [dependencies]', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-ca-iso-'))
    writeFileSync(
      path.join(dir, 'Cargo.toml'),
      '[workspace]\nmembers = ["a", "b"]\n\n[workspace.package]\nversion = "0.1.0"\n\n[package]\nname = "x"\nversion = "1.0.0"\n',
    )
    expect(policy.readVersionBySource(dir, 'cargo')).toBe('1.0.0')
    const w = policy.writeVersionBySource(dir, 'cargo', '1.1.0')
    expect(w).toEqual({ previous: '1.0.0', next: '1.1.0' })
    const after = readFileSync(path.join(dir, 'Cargo.toml'), 'utf8')
    // [package].version 已更新
    expect(after).toMatch(/\[package\][\s\S]*?version = "1\.1\.0"[\s\S]*?$/m)
    // [workspace.package].version 保持
    expect(after).toContain('[workspace.package]')
    expect(after).toMatch(/\[workspace\.package\][\s\S]*?version = "0\.1\.0"[\s\S]*?$/m)
  })

  it('gradle 写时跳过 // 注释行内的 version 字面量（不误改）', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-gr-com-'))
    writeFileSync(
      path.join(dir, 'build.gradle'),
      '// version = "0.0.0"（注释里说明历史值）\ngroup = "com.x"\nversion = "1.0.0"\n',
    )
    const w = policy.writeVersionBySource(dir, 'gradle', '1.1.0')
    expect(w).toEqual({ previous: '1.0.0', next: '1.1.0' })
    const after = readFileSync(path.join(dir, 'build.gradle'), 'utf8')
    // 注释里的 0.0.0 未被改
    expect(after).toContain('// version = "0.0.0"（注释里说明历史值）')
    // 实际 version 行被改
    expect(after).toMatch(/^version = "1\.1\.0"$/m)
  })

  it('writeVersionBySource 拒绝 goModule / derived（go.mod 无 version 字段）', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-go-'))
    writeFileSync(path.join(dir, 'go.mod'), 'module example.com/x\n\ngo 1.21\n')
    // readVersionBySource 永远返回 null
    expect(policy.readVersionBySource(dir, 'goModule')).toBeNull()
    // write 抛错
    expect(() => policy.writeVersionBySource(dir, 'goModule', '1.0.0')).toThrow(
      /goModule 模式不支持写版本/,
    )
    // derived 同理
    expect(policy.readVersionBySource(dir, 'derived')).toBeNull()
    expect(() => policy.writeVersionBySource(dir, 'derived', '1.0.0')).toThrow(
      /derived 模式不维护版本文件/,
    )
  })

  it('writeVersionBySource 在缺文件时抛清晰错（无 build.gradle / Cargo.toml）', () => {
    const dirG = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-gr-miss-'))
    expect(() => policy.writeVersionBySource(dirG, 'gradle', '1.0.0')).toThrow(
      /未找到 build\.gradle/,
    )
    const dirC = mkdtempSync(path.join(tmpdir(), 'bxverse-vs-ca-miss-'))
    expect(() => policy.writeVersionBySource(dirC, 'cargo', '1.0.0')).toThrow(/未找到 Cargo\.toml/)
  })
})
