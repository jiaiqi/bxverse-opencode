<script setup lang="ts">
// VersionExportDropdown.vue —— 版本清单导出（三种方式，R18 通用）
//   1. 另存为文件（File System Access API showSaveFilePicker，回退浏览器下载）
//   2. 写入项目仓库（弹窗内树形目录选择器点选目录）
//   3. 导出到本地目录（showDirectoryPicker 原生选择器 + 句柄直写）

import type { RepoVersionItem } from '@bxverse/shared'
import { useProjectsStore } from '../stores/projects'
import { useFsAccess } from '../composables/useFsAccess'
import { api } from '../api'
import DirPicker from './DirPicker.vue'
import { useMessage } from 'naive-ui'

const props = withDefaults(defineProps<{
  projectId: string
  /** 默认文件名（不含路径，如 versions.json） */
  filename: string
  /** 版本清单数据源（当前版本 / 某次发布快照） */
  loadItems: () => Promise<RepoVersionItem[]>
  /** 触发按钮文案 */
  label?: string
  size?: 'tiny' | 'small' | 'medium'
  quaternary?: boolean
}>(), {
  label: '导出版本清单',
  size: 'medium',
  quaternary: false,
})

const message = useMessage()
const projectsStore = useProjectsStore()
const fs = useFsAccess()

const project = computed(() => projectsStore.byId(props.projectId))
const exporting = ref(false)

// ---------- 方式一：另存为 ----------
async function exportDownload() {
  exporting.value = true
  try {
    const items = await props.loadItems()
    const content = `${JSON.stringify(items, null, 2)}\n`
    const result = await fs.saveTextFile(props.filename, content)
    if (result !== 'cancelled') {
      message.success(result === 'native' ? `已保存 ${items.length} 个仓库的版本清单` : `已下载 ${items.length} 个仓库的版本清单`)
    }
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    exporting.value = false
  }
}

// ---------- 方式二：写入项目仓库 ----------
const showWrite = ref(false)
const writeForm = reactive({ repoId: '', dir: '', filename: 'versions.json' })
const writeSaving = ref(false)

function openWrite() {
  const key = `bxverse-export-${props.projectId}-${props.filename}`
  const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as { repoId?: string; dir?: string; filename?: string }
  writeForm.repoId = saved.repoId && project.value?.repos.some(r => r.id === saved.repoId)
    ? saved.repoId
    : (project.value?.repos[0]?.id ?? '')
  writeForm.dir = saved.dir ?? ''
  writeForm.filename = saved.filename ?? props.filename
  showWrite.value = true
}

const writePath = computed(() => {
  const f = writeForm.filename.trim()
  return writeForm.dir ? `${writeForm.dir}/${f}` : f
})

async function submitWrite() {
  if (!writeForm.repoId || !writeForm.filename.trim()) return
  if (!writeForm.filename.trim().toLowerCase().endsWith('.json')) {
    message.warning('文件名必须以 .json 结尾')
    return
  }
  writeSaving.value = true
  try {
    // 传递快照/当前清单内容，保证写入的是用户所见清单（历史导出不重新采集）
    const items = await props.loadItems()
    const result = await api.exportProjectVersions(props.projectId, {
      repoId: writeForm.repoId,
      path: writePath.value,
      items,
    })
    localStorage.setItem(`bxverse-export-${props.projectId}-${props.filename}`, JSON.stringify({
      repoId: writeForm.repoId,
      dir: writeForm.dir,
      filename: writeForm.filename.trim(),
    }))
    showWrite.value = false
    message.success(`已写入 ${result.count} 个仓库版本 → ${result.path}`)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    writeSaving.value = false
  }
}

// ---------- 方式三：导出到本地目录 ----------
const showLocal = ref(false)
const localForm = reactive({ dirName: '', dirHandle: null as FileSystemDirectoryHandle | null, filename: 'versions.json' })
const localSaving = ref(false)

async function pickLocalDir() {
  const handle = await fs.pickDirectory()
  if (!handle) return
  localForm.dirHandle = handle
  localForm.dirName = handle.name
}

async function submitLocal() {
  if (!localForm.dirHandle || !localForm.filename.trim()) return
  if (!localForm.filename.trim().toLowerCase().endsWith('.json')) {
    message.warning('文件名必须以 .json 结尾')
    return
  }
  localSaving.value = true
  try {
    const items = await props.loadItems()
    const content = `${JSON.stringify(items, null, 2)}\n`
    await fs.writeToDirectory(localForm.dirHandle, localForm.filename.trim(), content)
    showLocal.value = false
    message.success(`已写入 ${items.length} 个仓库版本 → ${localForm.dirName}/${localForm.filename.trim()}`)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    localSaving.value = false
  }
}

const exportOptions = [
  { label: '另存为文件（原生对话框）', key: 'download', icon: () => h('i', { class: 'i-carbon-download text-16px' }) },
  { label: '写入项目仓库（选择目录）', key: 'write', icon: () => h('i', { class: 'i-carbon-folder-add text-16px' }) },
  { label: '导出到本地目录（原生选择器）', key: 'local', icon: () => h('i', { class: 'i-carbon-save text-16px' }) },
]

function onSelect(key: string) {
  if (key === 'download') void exportDownload()
  else if (key === 'write') openWrite()
  else {
    localForm.filename = props.filename
    showLocal.value = true
  }
}
</script>

<template>
  <NDropdown trigger="click" :options="exportOptions" @select="onSelect">
    <slot>
      <NButton :size="size" :quaternary="quaternary" :loading="exporting">
        <template #icon><i class="i-carbon-download" /></template>
        {{ label }}
      </NButton>
    </slot>
  </NDropdown>

  <!-- 写入项目仓库 -->
  <NModal v-model:show="showWrite" preset="card" title="写入版本清单到仓库" class="w-130 max-w-95vw">
    <div class="space-y-4 py-1">
      <div>
        <div class="text-sm font-medium text-text-1 mb-1.5">目标仓库</div>
        <NSelect
          v-model:value="writeForm.repoId"
          :options="(project?.repos ?? []).map(r => ({ label: `${r.displayName || r.name}（${r.name}）`, value: r.id }))"
          placeholder="选择要写入的仓库"
        />
      </div>
      <div>
        <div class="text-sm font-medium text-text-1 mb-1.5">目标目录（点选，可展开子目录）</div>
        <DirPicker
          v-if="writeForm.repoId"
          :pid="projectId"
          :rid="writeForm.repoId"
          v-model="writeForm.dir"
        />
        <div v-else class="text-xs text-text-3 py-3">请先选择目标仓库</div>
      </div>
      <div>
        <div class="text-sm font-medium text-text-1 mb-1.5">文件名</div>
        <NInput v-model:value="writeForm.filename" placeholder="versions.json" />
        <div class="text-xs text-text-3 mt-1.5">
          写入路径：<span class="code-text text-brand-600">{{ writePath }}</span>（不 commit，由你自行提交）
        </div>
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2.5">
        <NButton quaternary @click="showWrite = false">取消</NButton>
        <NButton
          type="primary"
          :loading="writeSaving"
          :disabled="!writeForm.repoId || !writeForm.filename.trim()"
          @click="submitWrite"
        >
          写入
        </NButton>
      </div>
    </template>
  </NModal>

  <!-- 导出到本地目录 -->
  <NModal v-model:show="showLocal" preset="card" title="导出到本地目录" class="w-120 max-w-95vw">
    <div class="space-y-4 py-1">
      <div>
        <div class="text-sm font-medium text-text-1 mb-1.5">目标目录</div>
        <div class="flex items-center gap-2.5">
          <NButton @click="pickLocalDir">
            <template #icon><i class="i-carbon-folder-open" /></template>
            {{ localForm.dirHandle ? '重新选择' : '选择目录…' }}
          </NButton>
          <span class="code-text text-text-2 truncate flex-1">{{ localForm.dirName || '未选择' }}</span>
        </div>
        <div class="text-xs text-text-3 mt-1.5">通过系统资源管理器选择任意本地目录，直接写入文件</div>
      </div>
      <div>
        <div class="text-sm font-medium text-text-1 mb-1.5">文件名</div>
        <NInput v-model:value="localForm.filename" placeholder="versions.json" />
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2.5">
        <NButton quaternary @click="showLocal = false">取消</NButton>
        <NButton
          type="primary"
          :loading="localSaving"
          :disabled="!localForm.dirHandle || !localForm.filename.trim()"
          @click="submitLocal"
        >
          写入
        </NButton>
      </div>
    </template>
  </NModal>
</template>
