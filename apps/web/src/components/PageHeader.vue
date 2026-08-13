<script setup lang="ts">
// PageHeader.vue —— 页头

withDefaults(defineProps<{
  title: string
  description?: string
  backTo?: string
  icon?: string
}>(), {
  icon: undefined,
})

const router = useRouter()
</script>

<template>
  <div class="page-header">
    <div class="flex items-center gap-3 min-w-0">
      <button
        v-if="backTo"
        class="shrink-0 w-9 h-9 flex items-center justify-center rounded-md border border-border text-text-2 hover:bg-surface-hover hover:text-text-1 transition-colors duration-150 focus-ring"
        aria-label="返回上一页"
        @click="router.push(backTo)"
      >
        <i aria-hidden="true" class="i-carbon-arrow-left" />
      </button>
      <div class="min-w-0">
        <h1 class="flex items-center gap-2.5 text-22px font-semibold text-text-1 m-0 leading-7">
          <i v-if="icon" class="text-brand-500" :class="icon" />
          <span class="truncate">{{ title }}</span>
          <slot name="badges" />
        </h1>
        <p v-if="description" class="text-sm text-text-2 m-0 mt-0.5 truncate">{{ description }}</p>
      </div>
    </div>
    <div class="flex items-center gap-2.5 shrink-0">
      <slot />
    </div>
  </div>
</template>
