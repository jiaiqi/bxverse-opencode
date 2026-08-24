<script setup lang="ts">
import type { ProjectDef } from '@bxverse/shared'
import { usePublishStore } from '../../stores/publish'
import LogEditor from '../LogEditor.vue'

defineProps<{ project: ProjectDef | undefined }>()
const store = usePublishStore()
</script>

<template>
  <div class="space-y-5">
    <LogEditor
      track="external"
      title="对外日志（用户可见）"
      :content="store.logs.external.content"
      :auto-draft="store.logs.external.autoDraft"
      :state="store.logs.external.state"
      :commits="store.plan?.changed.flatMap(r => r.commits) ?? []"
      :exclude="project?.externalExclude ?? []"
      @update:content="v => store.editLog('external', v)"
      @confirm="store.confirmLog('external')"
      @unconfirm="store.unconfirmLog('external')"
      @reset="store.resetLog('external')"
    />
    <LogEditor
      track="internal"
      title="对内日志（全量技术细节）"
      :content="store.logs.internal.content"
      :auto-draft="store.logs.internal.autoDraft"
      :state="store.logs.internal.state"
      @update:content="v => store.editLog('internal', v)"
      @confirm="store.confirmLog('internal')"
      @unconfirm="store.unconfirmLog('internal')"
      @reset="store.resetLog('internal')"
    />
  </div>
</template>
