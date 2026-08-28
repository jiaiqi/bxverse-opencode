// directives/countUp.ts
// v-count-up="42" — 数字滚动到目标值
// 数据变化时（updated）也会重新滚到新值（短一些 500ms）
// 注册：app.directive('count-up', countUpDirective)
//
// 注意：父组件 mounted 时如果元素已经渲染且 v-count-up 初次绑定，会播一遍从 0→value
// 数据已经是稳态后再变化（updated 阶段）也播一遍（duration 较短）

import type { Directive } from 'vue'
import { animateTo, type CountUpOptions } from '../composables/useCountUp'

interface CountUpHTMLElement extends HTMLElement {
  __countUpValue?: number
}

export const countUpDirective: Directive<CountUpHTMLElement, number | string> = {
  mounted(el, binding) {
    const target = Number(binding.value)
    if (Number.isNaN(target)) return
    el.__countUpValue = target
    const opts: CountUpOptions = {
      duration: typeof binding.arg === 'string' ? parseInt(binding.arg, 10) || 900 : 900,
    }
    animateTo(el, target, opts)
  },
  updated(el, binding) {
    const target = Number(binding.value)
    if (Number.isNaN(target)) return
    if (target === el.__countUpValue) return
    el.__countUpValue = target
    animateTo(el, target, { duration: 500 })
  },
}
