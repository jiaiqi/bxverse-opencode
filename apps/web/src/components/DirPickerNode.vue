<script setup lang="ts">
// DirPickerNode.vue —— 目录选择器递归节点（DirPicker 内部使用，仅目录）

import type { FileEntry, TreeNode } from '@bxverse/shared'

defineOptions({ name: 'DirPickerNode' })

const props = defineProps<{
  pid: string
  rid: string
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
  select: [dirPath: string]
}>()

const fullPath = computed(() => (props.dir ? `${props.dir}/${props.entry.name}` : props.entry.name))
const isExpanded = computed(() => props.expanded.has(fullPath.value))
const isLoading = computed(() => props.loadingSet.has(fullPath.value))
const childTree = computed(() => props.childrenMap.get(fullPath.value) ?? null)
const childDirs = computed(() => childTree.value?.entries.filter(e => e.type === 'dir') ?? [])

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight' && !isExpanded.value) {
    e.preventDefault()
    emit('toggle', fullPath.value)
  } else if (e.key === 'ArrowLeft' && isExpanded.value) {
    e.preventDefault()
    emit('toggle', fullPath.value)
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('select', fullPath.value)
  }
}
</script>

<template>
  <div>
    <div
      class="tree-row"
      role="button"
      tabindex="0"
      :aria-expanded="isExpanded"
      :aria-label="`目录 ${entry.name}`"
      :style="{ paddingLeft: `${10 + depth * 14}px` }"
      :class="{ 'tree-row-active': selectedPath === fullPath }"
      @keydown="onKeydown"
    >
      <i aria-hidden="true" class="i-carbon-chevron-right text-12px text-text-3 transition-transform duration-150 shrink-0 cursor-pointer hover:text-brand-500"
        :class="{ 'rotate-90': isExpanded }"
        @click.stop="emit('toggle', fullPath)"
      />
      <i
        class="text-14px shrink-0"
        :class="isExpanded ? 'i-carbon-folder-open text-warning' : 'i-carbon-folder text-warning'"
      />
      <span class="flex-1 truncate" @click="emit('select', fullPath)">{{ entry.name }}</span>
    </div>
    <template v-if="isExpanded">
      <div v-if="isLoading" class="py-1 text-text-3" :style="{ paddingLeft: `${24 + depth * 14}px` }">
        <NSpin size="small" />
      </div>
      <template v-else-if="childTree">
        <DirPickerNode
          v-for="child in childDirs"
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
          @select="p => emit('select', p)"
        />
      </template>
    </template>
  </div>
</template>


