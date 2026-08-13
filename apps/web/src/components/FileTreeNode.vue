<script setup lang="ts">
// FileTreeNode.vue —— 递归目录树节点（FileTree 内部使用）

import type { FileEntry, TreeNode } from '@bxverse/shared'
import { fileIcon } from '../constants/icons'

defineOptions({ name: 'FileTreeNode' })

const props = defineProps<{
  pid: string
  rid: string
  /** 父目录路径（根为 ''） */
  dir: string
  entry: FileEntry
  depth: number
  expanded: Set<string>
  childrenMap: Map<string, TreeNode>
  loadingSet: Set<string>
  selectedPath: string
}>()

const emit = defineEmits<{
  toggle: [dirPath: string]
  'open-file': [path: string, entry: FileEntry]
}>()

const fullPath = computed(() => (props.dir ? `${props.dir}/${props.entry.name}` : props.entry.name))
const isDir = computed(() => props.entry.type === 'dir')
const isExpanded = computed(() => isDir.value && props.expanded.has(fullPath.value))
const isLoading = computed(() => props.loadingSet.has(fullPath.value))
const childTree = computed(() => (isDir.value ? props.childrenMap.get(fullPath.value) ?? null : null))
</script>

<template>
  <div>
    <div
      class="tree-row"
      :style="{ paddingLeft: `${10 + depth * 14}px` }"
      :class="{ 'tree-row-selected': !isDir && selectedPath === fullPath }"
      @click="isDir ? emit('toggle', fullPath) : emit('open-file', fullPath, entry)"
    >
      <i
        v-if="isDir"
        class="i-carbon-chevron-right text-12px text-text-3 transition-transform duration-150 shrink-0"
        :class="{ 'rotate-90': isExpanded }"
      />
      <i v-else class="w-3 shrink-0" />
      <i
        class="text-15px shrink-0"
        :class="isDir
          ? (isExpanded ? 'i-carbon-folder-open text-warning' : 'i-carbon-folder text-warning')
          : `${fileIcon(entry.name)} text-text-3`"
      />
      <span class="flex-1 truncate">{{ entry.name }}</span>
    </div>

    <!-- 展开的子目录 -->
    <template v-if="isExpanded">
      <div v-if="isLoading" class="py-1 text-text-3" :style="{ paddingLeft: `${24 + depth * 14}px` }">
        <NSpin size="small" />
      </div>
      <template v-else-if="childTree">
        <FileTreeNode
          v-for="child in childTree.entries"
          :key="child.name"
          :pid="pid"
          :rid="rid"
          :dir="fullPath"
          :entry="child"
          :depth="depth + 1"
          :expanded="expanded"
          :children-map="childrenMap"
          :loading-set="loadingSet"
          :selected-path="selectedPath"
          @toggle="p => emit('toggle', p)"
          @open-file="(p, e) => emit('open-file', p, e)"
        />
        <div v-if="childTree.truncated" class="py-0.5 text-xs text-text-3" :style="{ paddingLeft: `${24 + depth * 14}px` }">
          目录过大，已截断显示
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-right: 10px;
  font-size: 13px;
  color: var(--bx-text-2);
  cursor: pointer;
  transition: background-color var(--bx-dur-fast) var(--bx-ease);
  border-left: 2px solid transparent;
}
.tree-row:hover {
  background: var(--bx-surface-hover);
  color: var(--bx-text-1);
}
.tree-row-selected {
  background: var(--bx-brand-soft);
  border-left-color: var(--bx-brand-500);
  color: var(--bx-brand-600);
}
</style>
