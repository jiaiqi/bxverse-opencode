<script setup lang="ts">
// FileTree.vue —— 懒加载目录树（递归节点 FileTreeNode）

import type { FileEntry } from '@bxverse/shared'
import { useMessage } from 'naive-ui'
import FileTreeNode from './FileTreeNode.vue'
import LoadingState from './LoadingState.vue'
import { useLazyTree } from '../composables/useLazyTree'

const props = defineProps<{
  pid: string
  rid: string
}>()

const emit = defineEmits<{ select: [path: string, entry: FileEntry] }>()

const message = useMessage()
const { root, childrenMap, expanded, loadingSet, rootLoading, loadRoot, toggleDir, reset } =
  useLazyTree(
    () => props.pid,
    () => props.rid,
  )
const selectedPath = ref('')

async function wrappedLoadRoot(): Promise<void> {
  try {
    await loadRoot()
  } catch (e) {
    message.error((e as Error).message)
  }
}

async function wrappedToggleDir(dir: string): Promise<void> {
  try {
    await toggleDir(dir)
  } catch (e) {
    message.error((e as Error).message)
  }
}

function selectFile(path: string, entry: FileEntry) {
  selectedPath.value = path
  emit('select', path, entry)
}

onMounted(wrappedLoadRoot)
watch(
  () => props.rid,
  () => {
    reset()
    selectedPath.value = ''
    void wrappedLoadRoot()
  },
)
</script>

<template>
  <div class="py-2">
    <div v-if="rootLoading && !root"><LoadingState pad="compact" /></div>
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
        @toggle="wrappedToggleDir"
        @open-file="selectFile"
      />
      <div v-if="root.truncated" class="px-3 py-1 text-xs text-text-3">目录过大，已截断显示</div>
      <div v-if="root.entries.length === 0" class="px-3 py-6 text-center text-xs text-text-3">
        空目录
      </div>
    </template>
  </div>
</template>
