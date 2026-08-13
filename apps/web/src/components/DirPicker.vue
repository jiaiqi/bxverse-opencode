<script setup lang="ts">
// DirPicker.vue —— 目录选择器：懒加载浏览仓库目录树，点选目录（含仓库根）

import type { TreeNode } from '@bxverse/shared'
import { api } from '../api'
import { useMessage } from 'naive-ui'
import DirPickerNode from './DirPickerNode.vue'

const props = defineProps<{
  pid: string
  rid: string
  /** 当前选中目录（'' = 仓库根） */
  modelValue: string
}>()

const emit = defineEmits<{ 'update:modelValue': [path: string] }>()

const message = useMessage()
const root = ref<TreeNode | null>(null)
const childrenMap = ref<Map<string, TreeNode>>(new Map())
const expanded = ref<Set<string>>(new Set())
const loadingSet = ref<Set<string>>(new Set())
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

function select(path: string) {
  emit('update:modelValue', path)
}

/** 仓库切换 → 重置并重新加载 */
watch(
  () => props.rid,
  () => {
    root.value = null
    childrenMap.value = new Map()
    expanded.value = new Set()
    loadingSet.value = new Set()
    if (props.modelValue !== '') emit('update:modelValue', '')
    void loadRoot()
  },
)
onMounted(loadRoot)
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
        class="picker-row"
        role="button"
        tabindex="0"
        aria-label="选择仓库根目录"
        :class="{ 'picker-row-active': modelValue === '' }"
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
          @toggle="toggleDir"
          @select="select"
        />
        <div v-if="root.entries.filter(e => e.type === 'dir').length === 0" class="px-3 py-4 text-center text-xs text-text-3">
          仓库中没有子目录（可选用根目录）
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.picker-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 13px;
  color: var(--bx-text-2);
  cursor: pointer;
  transition: background-color var(--bx-dur-fast) var(--bx-ease);
  border-left: 2px solid transparent;
}
.picker-row:focus-visible {
  outline: 2px solid var(--bx-brand-500);
  outline-offset: -2px;
}
.picker-row:hover {
  background: var(--bx-surface-hover);
  color: var(--bx-text-1);
}
.picker-row-active {
  background: var(--bx-brand-soft);
  border-left-color: var(--bx-brand-500);
  color: var(--bx-brand-600);
}
</style>
