<script setup lang="ts">
// DirPicker.vue —— 目录选择器：懒加载浏览仓库目录树，点选目录（含仓库根）

import { useMessage } from 'naive-ui'
import DirPickerNode from './DirPickerNode.vue'
import { useLazyTree } from '../composables/useLazyTree'

const props = defineProps<{
  pid: string
  rid: string
  /** 当前选中目录（'' = 仓库根） */
  modelValue: string
}>()

const emit = defineEmits<{ 'update:modelValue': [path: string] }>()

const message = useMessage()
const { root, childrenMap, expanded, loadingSet, rootLoading, loadRoot, toggleDir, reset } = useLazyTree(() => props.pid, () => props.rid)

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

function select(path: string) {
  emit('update:modelValue', path)
}

/** 仓库切换 → 重置并重新加载 */
watch(
  () => props.rid,
  () => {
    reset()
    if (props.modelValue !== '') emit('update:modelValue', '')
    void wrappedLoadRoot()
  },
)
onMounted(wrappedLoadRoot)
</script>

<template>
  <div class="border border-border rounded-md overflow-hidden">
    <!-- 当前选中 -->
    <div class="flex items-center gap-2 px-3 py-2 bg-surface-alt border-b border-border text-xs">
      <i aria-hidden="true" class="i-carbon-folder text-warning text-14px" />
      <span class="code-text text-text-2 flex-1 truncate">{{ modelValue || '（仓库根目录）' }}</span>
      <button
        class="text-text-3 hover:text-brand-500 transition-colors duration-150"
        aria-label="清空为仓库根目录"
        @click="select('')"
      >
        <i aria-hidden="true" class="i-carbon-close" />
      </button>
    </div>
    <div class="max-h-56 overflow-y-auto py-1">
      <!-- 仓库根选项 -->
      <div
        class="tree-row"
        role="button"
        tabindex="0"
        aria-label="选择仓库根目录"
        :class="{ 'tree-row-active': modelValue === '' }"
        @click="select('')"
        @keydown.enter="select('')"
        @keydown.space.prevent="select('')"
      >
        <i aria-hidden="true" class="i-carbon-home text-14px text-text-3" />
        <span class="flex-1 truncate">（仓库根目录）</span>
      </div>
      <div v-if="rootLoading && !root" class="px-3 py-4 text-center text-text-3">
        <NSpin size="small" />
      </div>
      <template v-else-if="root">
        <DirPickerNode
          v-for="entry in root.entries.filter(e => e.type === 'dir')"
          :key="entry.name"
          :pid="pid"
          :rid="rid"
          :dir="root.path"
          :entry="entry"
          :depth="0"
          :expanded="expanded"
          :children-map="childrenMap"
          :loading-set="loadingSet"
          :selected-path="modelValue"
          @toggle="wrappedToggleDir"
          @select="select"
        />
        <div v-if="root.entries.filter(e => e.type === 'dir').length === 0" class="px-3 py-4 text-center text-xs text-text-3">
          仓库中没有子目录（可选用根目录）
        </div>
      </template>
    </div>
  </div>
</template>


