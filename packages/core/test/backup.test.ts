// R19/M6：备份与一致性对比单测（临时 BX_HOME + fixture 仓库）
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { DataStore, loadAppConfig, saveAppConfig } from '../src/store'
import { git } from '../src/git'
import * as backup from '../src/backup'
import { createArchiveGz } from '../src/backup/source'
import { buildManifest } from '../src/backup/manifest'
import { compareManifests, compareSource, verifyManifest } from '../src/compare'
import { commit, makeRepo } from './helpers/repo'

function gunzipToBuffer(file: string): Buffer {
  return zlib.gunzipSync(fs.readFileSync(file))
}

describe('backup：源码与产物备份（R19）', () => {
  it('源码归档引用不存在时快速失败并清理半成品', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat: 初始', { 'src/a.ts': 'aaa' })
    const outFile = path.join(process.env.BX_HOME!, 'backups', 'invalid', 'source.tar.gz')

    await expect(createArchiveGz(repoPath, 'missing-ref', outFile)).rejects.toThrow()
    expect(fs.existsSync(outFile)).toBe(false)
  })

  it('源码备份：bundle 可验证 + 快照遵循 .gitignore', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat: 初始', { 'src/a.ts': 'aaa', 'README.md': 'readme' })
    // 被 gitignore 的文件不应进入快照
    fs.writeFileSync(path.join(repoPath, '.gitignore'), 'secret.env\nnode_modules/\n')
    fs.writeFileSync(path.join(repoPath, 'secret.env'), 'SECRET')
    fs.mkdirSync(path.join(repoPath, 'node_modules'), { recursive: true })
    fs.writeFileSync(path.join(repoPath, 'node_modules', 'dep.js'), 'dep')
    const head = (await git(['rev-parse', 'HEAD'], { cwd: repoPath }))
    expect(head.ok).toBe(true)
    const commitHash = head.ok ? head.stdout.trim() : ''
    const outDir = path.join(process.env.BX_HOME!, 'backups', 'p1', 'r1', 'v1.0.0')
    fs.mkdirSync(outDir, { recursive: true })

    const ref = await backup.backupRepo({
      projectId: 'p1',
      repoId: 'r1',
      repoName: 'repo1',
      repoPath,
      version: 'v1.0.0',
      releaseId: 'rel_x',
      commit: commitHash,
      backupDir: path.join(process.env.BX_HOME!, 'backups'),
      source: true,
      artifact: false,
    })
    expect(ref).not.toBeNull()
    expect(ref?.items.map(i => i.kind).sort()).toEqual(['source-archive', 'source-bundle'])

    // bundle 可被 git 验证
    const bundle = path.join(outDir, 'source.bundle')
    expect(fs.existsSync(bundle)).toBe(true)
    const verify = await git(['bundle', 'verify', bundle], { cwd: repoPath })
    expect(verify.ok).toBe(true)

    // 快照只含已跟踪文件：含 src/a.ts，不含 secret.env / node_modules
    const raw = gunzipToBuffer(path.join(outDir, 'source.tar.gz')).toString('latin1')
    expect(raw).toContain('src/a.ts')
    expect(raw).toContain('README.md')
    expect(raw).not.toContain('secret.env')
    expect(raw).not.toContain('node_modules')

    // sha256 校验文件存在且含两条记录
    const sha = fs.readFileSync(path.join(outDir, 'source.sha256'), 'utf8')
    expect(sha.trim().split('\n')).toHaveLength(2)
  })

  it('恢复快照：默认要求空目录，overwrite 允许覆盖同名文件（M7 冲突策略）', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat: 初始', { 'src/a.ts': 'aaa', 'README.md': 'readme' })
    const outDir = path.join(process.env.BX_HOME!, 'backups', 'p1', 'r1', 'v1.0.1')
    fs.mkdirSync(outDir, { recursive: true })
    const head = await git(['rev-parse', 'HEAD'], { cwd: repoPath })
    const commitHash = head.ok ? head.stdout.trim() : 'HEAD'
    await backup.backupRepo({
      projectId: 'p1', repoId: 'r1', repoName: 'repo1', repoPath,
      version: 'v1.0.1', releaseId: 'rel_y', commit: commitHash,
      backupDir: path.join(process.env.BX_HOME!, 'backups'),
      source: true, artifact: false,
    })
    const archive = path.join(outDir, 'source.tar.gz')
    expect(fs.existsSync(archive)).toBe(true)

    // 1) 空目录恢复成功
    const target = path.join(process.env.BX_HOME!, 'restores', 'r1')
    const n = await backup.restoreArchive(archive, target)
    expect(n).toBeGreaterThanOrEqual(2)
    expect(fs.readFileSync(path.join(target, 'src/a.ts'), 'utf8')).toBe('aaa')

    // 2) 非空目录默认拒绝
    await expect(backup.restoreArchive(archive, target)).rejects.toThrow('目标目录非空')

    // 3) overwrite 后允许，且覆盖同名文件
    fs.writeFileSync(path.join(target, 'src', 'a.ts'), 'dirty-local-change')
    const n2 = await backup.restoreArchive(archive, target, true)
    expect(n2).toBeGreaterThanOrEqual(2)
    expect(fs.readFileSync(path.join(target, 'src/a.ts'), 'utf8')).toBe('aaa')
  })

  it('产物备份：tar.gz + manifest，未配置目录返回 null', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat: 初始', { 'src/a.ts': 'aaa' })
    fs.mkdirSync(path.join(repoPath, 'dist', 'assets'), { recursive: true })
    fs.writeFileSync(path.join(repoPath, 'dist', 'index.html'), '<html></html>')
    fs.writeFileSync(path.join(repoPath, 'dist', 'assets', 'app.js'), 'console.log(1)')
    const outDir = path.join(process.env.BX_HOME!, 'backups', 'p2', 'r2', 'v1_0_0')

    const r = await backup.backupArtifact(repoPath, 'dist', outDir)
    expect(r).not.toBeNull()
    expect(r?.fileCount).toBe(2)
    expect(fs.existsSync(path.join(outDir, 'artifact.tar.gz'))).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'artifact-manifest.json'), 'utf8'))
    expect(manifest.totals.files).toBe(2)
    expect(manifest.files.map((f: { path: string }) => f.path).sort()).toEqual(['assets/app.js', 'index.html'])
    // 归档内容包含两个文件
    const raw = gunzipToBuffer(path.join(outDir, 'artifact.tar.gz')).toString('latin1')
    expect(raw).toContain('index.html')
    expect(raw).toContain('assets/app.js')

    // 目录不存在 → null
    expect(await backup.backupArtifact(repoPath, 'nonexist', outDir)).toBeNull()
  })
})

describe('compare：三层一致性对比（R19）', () => {
  it('compareManifests：added/removed/modified/same 分类正确', async () => {
    const dirA = path.join(process.env.BX_HOME!, 'cmp', 'a')
    const dirB = path.join(process.env.BX_HOME!, 'cmp', 'b')
    fs.mkdirSync(dirA, { recursive: true })
    fs.mkdirSync(dirB, { recursive: true })
    fs.writeFileSync(path.join(dirA, 'same.txt'), 'same')
    fs.writeFileSync(path.join(dirB, 'same.txt'), 'same')
    fs.writeFileSync(path.join(dirA, 'modified.txt'), 'old')
    fs.writeFileSync(path.join(dirB, 'modified.txt'), 'new')
    fs.writeFileSync(path.join(dirA, 'removed.txt'), 'gone')
    fs.writeFileSync(path.join(dirB, 'added.txt'), 'fresh')

    const result = compareManifests(await buildManifest(dirA), await buildManifest(dirB))
    expect(result.totals).toEqual({ added: 1, removed: 1, modified: 1, same: 1 })
    const byPath = Object.fromEntries(result.files.map(f => [f.path, f.status]))
    expect(byPath['same.txt']).toBe('same')
    expect(byPath['modified.txt']).toBe('modified')
    expect(byPath['removed.txt']).toBe('removed')
    expect(byPath['added.txt']).toBe('added')
  })

  it('verifyManifest：校验级——缺失/篡改/一致', async () => {
    const dir = path.join(process.env.BX_HOME!, 'cmp', 'v')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'ok.txt'), 'ok')
    fs.writeFileSync(path.join(dir, 'bad.txt'), 'good')
    const manifest = await buildManifest(dir)

    // 篡改 + 删除
    fs.writeFileSync(path.join(dir, 'bad.txt'), 'tampered')
    fs.rmSync(path.join(dir, 'ok.txt'))
    fs.writeFileSync(path.join(dir, 'extra.txt'), 'extra')

    const result = await verifyManifest(dir, manifest)
    const byPath = Object.fromEntries(result.files.map(f => [f.path, f.status]))
    expect(byPath['bad.txt']).toBe('modified')
    expect(byPath['ok.txt']).toBe('removed')
    expect(byPath['extra.txt']).toBe('added')
  })

  it('compareSource：两 commit 间源码 diff 与 git 一致', async () => {
    const repoPath = makeRepo()
    // 关掉全局 autocrlf，保证 numstat 确定性（用户机器可能开启 autocrlf=true）
    await git(['config', 'core.autocrlf', 'false'], { cwd: repoPath })
    const first = commit(repoPath, 'feat: 初始', { 'src/a.ts': 'aaa\n' })
    commit(repoPath, 'feat: 变更', { 'src/a.ts': 'bbb', 'src/new.ts': 'new' })

    const result = await compareSource(repoPath, first, 'HEAD')
    expect(result.files).toHaveLength(2)
    const byPath = Object.fromEntries(result.files.map(f => [f.path, f]))
    expect(byPath['src/a.ts'].status).toBe('modified')
    expect(byPath['src/a.ts'].insertions).toBe(1)
    expect(byPath['src/new.ts'].status).toBe('added')

    // 空 range（无差异）→ 空数组
    const empty = await compareSource(repoPath, 'HEAD', 'HEAD')
    expect(empty.files).toHaveLength(0)
  })

  it('executePublish 集成：发布产出备份并挂载到记录', async () => {
    const repoPath = makeRepo()
    commit(repoPath, 'feat: 功能', { 'src/a.ts': 'aaa' })
    const project = {
      id: 'p_bak_1',
      name: '备份项目',
      version: 'v1.0.0',
      bump: 'auto' as const,
      repoVersionScheme: 'hybrid' as const,
      externalExclude: [],
      repos: [
        { id: 'r_bak_1', name: 'bak-repo', path: repoPath, writeVersionFile: true, outputDir: 'public', lastPublishCommit: null },
      ],
      createdAt: new Date().toISOString(),
    }
    await saveAppConfig({ ...(await loadAppConfig()), projects: [project] })

    const { executePublish } = await import('../src/engine')
    const events: unknown[] = []
    const result = await executePublish(
      { projectId: 'p_bak_1', bump: 'minor', backupSource: true, backupArtifacts: false },
      { onEvent: e => events.push(e) },
    )
    expect(result.failedRepos).toEqual([])

    const store = new DataStore()
    const records = await store.listRecords('p_bak_1', 5)
    expect(records).toHaveLength(1)
    expect(records[0].backups).toHaveLength(1)
    expect(records[0].backups![0].items.map(i => i.kind).sort()).toEqual(['source-archive', 'source-bundle'])

    const metas = await store.listBackupMeta()
    expect(metas).toHaveLength(1)
    expect(metas[0].repoId).toBe('r_bak_1')

    const repoRec = await store.listRecords('r_bak_1', 5)
    expect(repoRec[0].backups).toHaveLength(1)
  })
})
