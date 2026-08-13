<script setup lang="ts">
// FileTree.vue —— 懒加载目录树（递归节点 FileTreeNode）

import type { FileEntry, TreeNode } from '@bxverse/shared'
import { api } from '../api'
import { useMessage } from 'naive-ui'
import FileTreeNode from './FileTreeNode.vue'

const props = defineProps<{
  pid: string
  rid: string
}>()

const emit = defineEmits<{ select: [path: string, entry: FileEntry] }>()

const message = useMessage()
const root = ref<TreeNode | null>(null)
const childrenMap = ref<Map<string, TreeNode>>(new Map())
const expanded = ref<Set<string>>(new Set())
const loadingSet = ref<Set<string>>(new Set())
const selectedPath = ref('')
const rootLoading = ref(false)

async function loadRoot() {
  rootLoading.value = true
  try {
    root.value = await api.tree(props.pid, props.rid, '')
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    rootLoading.value = false
  }
}

async function loadChildren(dir: string): Promise<void> {
  if (childrenMap.value.has(dir)) return
  const next = new Set(loadingSet.value)
  next.add(dir)
  loadingSet.value = next
  try {
    childrenMap.value.set(dir, await api.tree(props.pid, props.rid, dir))
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    const done = new Set(loadingSet.value)
    done.delete(dir)
    loadingSet.value = done
  }
}

async function toggleDir(dir: string) {
  if (expanded.value.has(dir)) {
    const next = new Set(expanded.value)
    next.delete(dir)
    expanded.value = next
    return
  }
  const next = new Set(expanded.value)
  next.add(dir)
  expanded.value = next
  await loadChildren(dir)
}

function selectFile(path: string, entry: FileEntry) {
  selectedPath.value = path
  emit('select', path, entry)
}

onMounted(loadRoot)
watch(() => props.rid, () => {
  root.value = null
  childrenMap.value = new Map()
  expanded.value = new Set()
  selectedPath.value = ''
  void loadRoot()
})
</script>

<template>
  <div class="py-2">
    <div v-if="rootLoading && !root" class="px-3 py-6 text-center text-text-3">
      <NSpin size="small" />
    </div>
    <template v-else-if="root">
      <FileTreeNode
        v-for="entry in root.entries"
        :key="entry.name"
        :pid="pid"
        :rid="rid"
        :dir="root.path"
        :entry="entry"
        :depth="0"
        :expanded="expanded"
        :children-map="childrenMap"
        :loading-set="loadingSet"
        :selected-path="selectedPath"
        @toggle="toggleDir"
        @open-file="selectFile"
      />
      <div v-if="root.truncated" class="px-3 py-1 text-xs text-text-3">目录过大，已截断显示</div>
      <div v-if="root.entries.length === 0" class="px-3 py-6 text-center text-xs text-text-3">
        空目录
      </div>
    </template>
  </div>
</template>
