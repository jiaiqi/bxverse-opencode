<script setup lang="ts">
import { usePublishStore } from '../../stores/publish'
import PublishConsole from '../PublishConsole.vue'
import type { PublishEventLike } from '../../api'

const store = usePublishStore()

function onConsoleEvent(e: PublishEventLike) {
  store.pushEvent(e)
}
function onFinished(_result: { releaseId: string | null; version: string; failedRepos: string[] } | null) {
  store.step = 6
}
function onFailed(_msg: string) {
  store.step = 6
}
</script>

<template>
  <div>
    <PublishConsole
      v-if="store.taskId"
      :task-id="store.taskId"
      @event="onConsoleEvent"
      @finished="onFinished"
      @failed="onFailed"
    />
    <div v-if="store.phase === 'error'" class="mt-4">
      <NAlert type="error" :show-icon="true">
        <div class="flex items-center gap-3 justify-between flex-wrap">
          <span>{{ store.error || '发布失败' }}</span>
          <NButton size="tiny" @click="store.goTo(2)">回到版本号重试</NButton>
        </div>
      </NAlert>
    </div>
  </div>
</template>
