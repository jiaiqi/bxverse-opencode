<script setup lang="ts">
// ReleaseWizard.vue —— 发布向导（M4 实现，当前为占位）

import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'
import { useProjectsStore } from '../stores/projects'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const project = computed(() => projectsStore.byId(String(route.params.id)))
</script>

<template>
  <div class="page">
    <PageHeader
      :title="`发布 · ${project?.name ?? ''}`"
      back-to="`/project/${String(route.params.id)}`"
      icon="i-carbon-rocket"
    />
    <div class="card">
      <EmptyState
        icon="i-carbon-rocket"
        title="发布向导即将上线（M4）"
        description="六步流程：检测变更 → 版本号 → 日志编辑 → dry-run 预览 → 执行（实时日志）→ 完成摘要。当前可直接使用 bx-manager 服务端 API 发布。"
      />
      <div class="text-center pb-8">
        <NButton @click="router.push(`/project/${String(route.params.id)}`)">返回项目</NButton>
      </div>
    </div>
  </div>
</template>
