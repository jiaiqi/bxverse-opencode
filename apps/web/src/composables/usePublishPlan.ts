// apps/web/src/composables/usePublishPlan.ts
// 发布计划逻辑抽离（P1 前端收敛）：将向导中 plan/bump/log 的核心操作从 store 中解耦，便于测试与复用

import { usePublishStore } from '../stores/publish'

export function usePublishPlan() {
  const store = usePublishStore()

  const plan = computed(() => store.plan)
  const planning = computed(() => store.planning)
  const bumpOverride = computed({
    get: () => store.bumpOverride,
    set: (v) => { store.bumpOverride = v as never },
  })
  const logs = computed(() => store.logs)
  const bothConfirmed = computed(() => store.bothConfirmed)
  const canExecute = computed(() => store.canExecute)
  const planDirty = computed(() => store.planDirty)

  async function loadPlan() {
    await store.loadPlan()
  }

  function setBump(v: string) {
    store.bumpOverride = v as never
    if (store.step >= 2) void loadPlan()
  }

  function editLog(track: 'internal' | 'external', content: string) {
    store.editLog(track, content)
  }

  function confirmLog(track: 'internal' | 'external') {
    store.confirmLog(track)
  }

  function unconfirmLog(track: 'internal' | 'external') {
    store.unconfirmLog(track)
  }

  function resetLog(track: 'internal' | 'external') {
    store.resetLog(track)
  }

  return {
    plan,
    planning,
    bumpOverride,
    logs,
    bothConfirmed,
    canExecute,
    planDirty,
    loadPlan,
    setBump,
    editLog,
    confirmLog,
    unconfirmLog,
    resetLog,
  }
}
