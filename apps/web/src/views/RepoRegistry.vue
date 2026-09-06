<script setup lang="ts">
// RepoRegistry.vue —— R33 阶段 1（0 契约）：仓库注册表
// 遍历 projects[].repos 按 path 归并（同 path 视为同一仓库），展示所属项目 membership；
// 阶段 2（注册表契约）落地后切换权威数据源，视图不重写

import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectsStore } from '../stores/projects'
import LoadingState from '../components/LoadingState.vue'
import EmptyState from '../components/EmptyState.vue'

const store = useProjectsStore()
const router = useRouter()

onMounted(() => {
  void store.load()
  void store.loadOverview()
})

interface RegistryRepo {
  key: string
  name: string
  displayName?: string
  path: string
  remote?: string
  members: { pid: string; pname: string; rid: string; version: string }[]
}
const registry = computed<RegistryRepo[]>(() => {
  const map = new Map<string, RegistryRepo>()
  for (const p of store.items) {
    for (const r of p.repos) {
      const key = (r.path || r.remote || r.name).replaceAll('\\', '/')
      const member = { pid: p.id, pname: p.name, rid: r.id, version: p.version }
      const hit = map.get(key)
      if (hit) hit.members.push(member)
      else
        map.set(key, {
          key,
          name: r.name,
          displayName: r.displayName,
          path: r.path,
          remote: r.remote,
          members: [member],
        })
    }
  }
  return [...map.values()]
})
/** 接入位总数（含跨项目重复挂载） */
const totalSlots = computed(() => store.items.reduce((s, p) => s + p.repos.length, 0))
function openRepo(key: string): void {
  const rr = registry.value.find((r) => r.key === key)
  if (!rr) return
  void router.push(`/repo/${rr.members[0].pid}/${rr.members[0].rid}`)
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-xl font-bold text-text-1">仓库注册表</h1>
      <p class="text-sm text-text-3 mt-1">
        全局仓库池（按路径归并，{{ registry.length }} 个仓库 ·
        {{ totalSlots }} 个接入位）。仓库可同时挂到多个项目；跨项目版本对齐在
        <RouterLink to="/matrix" class="text-brand-500 font-semibold hover:underline"
          >对齐矩阵</RouterLink
        >
        查看。
      </p>
    </div>

    <div v-if="store.loading"><LoadingState /></div>
    <EmptyState
      v-else-if="registry.length === 0"
      title="仓库注册表为空"
      description="先创建项目并接入仓库，仓库会按路径自动归并到这里"
    />

    <div v-else class="card overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-[11px] font-semibold text-text-3 border-b border-border-strong">
            <th class="px-4 py-2.5 font-semibold">仓库</th>
            <th class="px-4 py-2.5 font-semibold">本地路径 / 远程</th>
            <th class="px-4 py-2.5 font-semibold">所属项目</th>
            <th class="px-4 py-2.5 font-semibold text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="rr in registry"
            :key="rr.key"
            class="border-b border-border last:border-b-0 hover:bg-surface-hover/60 transition-colors duration-fast"
          >
            <td class="px-4 py-3 align-top">
              <div class="font-mono text-xs font-semibold text-text-1">{{ rr.name }}</div>
              <div class="text-[11px] text-text-3">{{ rr.displayName || '未设中文名' }}</div>
            </td>
            <td class="px-4 py-3 align-top max-w-[280px]">
              <div class="font-mono text-[11px] text-text-2 truncate" :title="rr.path">
                {{ rr.path }}
              </div>
              <div
                v-if="rr.remote"
                class="font-mono text-[10px] text-text-3 truncate"
                :title="rr.remote"
              >
                {{ rr.remote }}
              </div>
            </td>
            <td class="px-4 py-3 align-top">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span
                  v-for="m in rr.members"
                  :key="m.pid"
                  class="px-1.5 py-0.5 rounded bg-brand-soft text-brand-600 text-[10px] font-semibold"
                  >{{ m.pname }} · {{ m.version }}</span
                >
              </div>
            </td>
            <td class="px-4 py-3 align-top text-right">
              <button
                class="btn-ghost h-7 px-2.5 text-xs font-semibold focus-ring cursor-pointer"
                @click="openRepo(rr.key)"
              >
                进入详情
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
