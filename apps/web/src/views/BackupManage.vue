<script setup lang="ts">
// BackupManage.vue —— 独立备份页（保留直接访问 /project/:id/backups），复用 BackupPanel
import BackupPanel from '../components/BackupPanel.vue'

const route = useRoute()
const router = useRouter()
const pid = computed(() => String(route.params.id))
</script>

<template>
  <div class="page max-w-6xl space-y-6">
    <div class="glass-panel p-5 rounded-2xl flex items-center gap-3">
      <button
        class="p-1.5 rounded-lg bg-surface-alt hover:bg-surface-hover text-text-2 hover:text-text-1 border border-border flex items-center gap-1 text-xs font-mono transition-colors cursor-pointer"
        @click="router.push({ path: `/project/${pid}`, query: { tab: 'backups' } })"
      >
        <i aria-hidden="true" class="i-carbon-arrow-left text-12px" />
        <span>返回项目（备份 Tab）</span>
      </button>
      <div class="h-4 w-px bg-border shrink-0" />
      <div>
        <h1 class="text-base font-bold text-text-1 flex items-center gap-2 m-0 font-sans">
          <i aria-hidden="true" class="i-carbon-security text-brand-500" />
          <span>备份归档与三层一致性对比引擎</span>
        </h1>
        <p class="text-xs text-text-3 mt-0.5 m-0 font-mono">独立页：也可通过项目详情 ?tab=backups 访问</p>
      </div>
    </div>
    <BackupPanel :project-id="pid" />
  </div>
</template>
