// apps/web/src/composables/useBackup.ts
// 备份业务逻辑抽离（P1 前端收敛）：供 ProjectDetail ?tab=backups 与独立 BackupManage 复用

import type { RepoBackupRef } from '@bxverse/shared'
import { api } from '../api'

export function useBackup(pid: () => string) {
  const backupsByRepo = ref<Record<string, RepoBackupRef[]>>({})
  const loading = ref(false)
  const usage = ref<import('@bxverse/shared').BackupUsage | null>(null)
  const usageLoading = ref(false)

  const retentionForm = reactive<{ keepLast: number | null; maxBytesMB: number | null; keepDays: number | null }>({
    keepLast: null,
    maxBytesMB: null,
    keepDays: null,
  })
  const retentionSaving = ref(false)
  const cleanupLoading = ref(false)

  async function load(projectRepos: { id: string }[]) {
    loading.value = true
    try {
      const next: Record<string, RepoBackupRef[]> = {}
      await Promise.all(
        projectRepos.map(async (repo) => {
          try {
            const { items } = await api.repoBackups(pid(), repo.id)
            next[repo.id] = items
          } catch {
            next[repo.id] = []
          }
        }),
      )
      backupsByRepo.value = next
    } finally {
      loading.value = false
    }
  }

  async function loadUsage() {
    usageLoading.value = true
    try {
      usage.value = await api.backupUsage({ projectId: pid() })
    } catch {
      usage.value = null
    } finally {
      usageLoading.value = false
    }
  }

  async function loadRetention() {
    try {
      const { config } = await api.config()
      const r = config.backup?.retention
      retentionForm.keepLast = r?.keepLast ?? null
      retentionForm.maxBytesMB = r?.maxBytes != null ? Math.round(r.maxBytes / (1024 * 1024)) : null
      retentionForm.keepDays = r?.keepDays ?? null
    } catch { /* ignore */ }
  }

  function buildRetentionFromForm(): Record<string, number> | undefined {
    const retention: Record<string, number> = {}
    if (retentionForm.keepLast != null) retention.keepLast = retentionForm.keepLast
    if (retentionForm.maxBytesMB != null) retention.maxBytes = retentionForm.maxBytesMB * 1024 * 1024
    if (retentionForm.keepDays != null) retention.keepDays = retentionForm.keepDays
    return Object.keys(retention).length ? retention : undefined
  }

  async function saveRetention(): Promise<void> {
    retentionSaving.value = true
    try {
      const retention = buildRetentionFromForm()
      await api.saveConfig({ backup: { retention } as never })
    } finally {
      retentionSaving.value = false
    }
  }

  async function doCleanup(dryRun: boolean): Promise<import('@bxverse/shared').BackupCleanupResult> {
    cleanupLoading.value = true
    try {
      const retention = buildRetentionFromForm()
      const body: Record<string, unknown> = { projectId: pid(), dryRun }
      if (retention) body.retention = retention
      return await api.backupCleanup(body as never)
    } finally {
      cleanupLoading.value = false
    }
  }

  return {
    backupsByRepo,
    loading,
    usage,
    usageLoading,
    retentionForm,
    retentionSaving,
    cleanupLoading,
    load,
    loadUsage,
    loadRetention,
    saveRetention,
    doCleanup,
  }
}
