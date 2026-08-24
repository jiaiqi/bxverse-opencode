<script setup lang="ts">
import { usePublishStore } from '../../stores/publish'
import VersionExportDropdown from '../VersionExportDropdown.vue'
import { api } from '../../api'

const props = defineProps<{ projectId: string }>()

const store = usePublishStore()
const router = useRouter()
const resultReleaseId = computed(() => store.result?.releaseId ?? '')

const emit = defineEmits<{ again: [] }>()
</script>

<template>
  <div>
    <template v-if="store.result">
      <div class="text-center py-8">
        <i aria-hidden="true" class="i-carbon-checkmark-filled text-48px text-success" />
        <div class="mt-3 stat-value text-2xl">{{ store.result.version }}</div>
        <div class="text-sm text-text-2 mt-1">统一发布完成</div>
        <div v-if="store.result.failedRepos.length" class="mt-4">
          <NAlert type="warning" :show-icon="true" class="text-left">
            以下仓库发布失败（未更新检测基准，可下次重新发布）：
            {{ store.result.failedRepos.join('、') }}
          </NAlert>
        </div>
        <div v-if="store.result.syncFailedRepos?.length" class="mt-3">
          <NAlert type="warning" :show-icon="true" class="text-left">
            以下仓库基版同步失败（version.json 未更新为最新项目版本）：
            {{ store.result.syncFailedRepos.join('、') }}
          </NAlert>
        </div>
      </div>
    </template>
    <template v-else>
      <NResult status="success" title="发布完成" />
    </template>
    <div class="flex justify-center gap-3 mt-6">
      <NButton @click="router.push(`/project/${projectId}`)">返回项目</NButton>
      <NButton
        v-if="resultReleaseId && (store.backupSource || store.backupArtifacts)"
        @click="router.push(`/project/${projectId}/backups`)"
      >
        <template #icon><i class="i-carbon-document-protected" /></template>
        查看本次备份
      </NButton>
      <VersionExportDropdown
        v-if="resultReleaseId"
        :project-id="projectId"
        :filename="`${store.result!.version}-version.json`"
        :load-items="() => api.releaseVersions(resultReleaseId)"
      />
      <NButton type="primary" secondary @click="emit('again')">再次发布</NButton>
    </div>
  </div>
</template>
