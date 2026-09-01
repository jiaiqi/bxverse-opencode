// apps/web/src/router/index.ts

import { createRouter, createWebHistory } from 'vue-router'
import { createDiscreteApi } from 'naive-ui'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/Dashboard.vue'),
      meta: { title: '总览' },
    },
    {
      path: '/project/:id',
      name: 'project',
      component: () => import('../views/ProjectDetail.vue'),
      meta: { title: '项目详情' },
    },
    {
      path: '/project/:id/rollback',
      name: 'rollback',
      component: () => import('../views/RollbackWizard.vue'),
      meta: { title: '回退' },
    },
    {
      path: '/project/:id/release',
      name: 'release',
      component: () => import('../views/ReleaseWizard.vue'),
      meta: { title: '发布' },
    },
    {
      path: '/project/:id/backups',
      name: 'backups',
      component: () => import('../views/BackupManage.vue'),
      meta: { title: '备份与对比' },
    },
    {
      path: '/repo/:pid/:rid',
      name: 'repo',
      component: () => import('../views/RepoDetail.vue'),
      meta: { title: '仓库详情' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/Settings.vue'),
      meta: { title: '设置' },
    },
    {
      path: '/ops',
      name: 'ops',
      component: () => import('../views/OpsCenter.vue'),
      meta: { title: '系统健康' },
    },
    {
      path: '/matrix',
      name: 'matrix',
      component: () => import('../views/VersionMatrix.vue'),
      meta: { title: '版本矩阵' },
    },
    {
      path: '/cross',
      name: 'cross-search',
      component: () => import('../views/CrossProjectSearch.vue'),
      meta: { title: '跨项目搜索' },
    },
    {
      path: '/feed',
      name: 'upgrade-feed',
      component: () => import('../views/UpgradeFeed.vue'),
      meta: { title: '升级日志' },
    },
    {
      path: '/ultimate',
      name: 'ultimate',
      component: () => import('../views/UltimateView.vue'),
      meta: { title: 'ULTIMATE 驾驶舱', layout: 'ultimate' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFound.vue'),
      meta: { title: '页面不存在' },
    },
  ],
})

// 全局 loading bar：独立 discrete 实例（不依赖 Provider 注入上下文）
export function setupRouterGuards(): void {
  const { loadingBar } = createDiscreteApi(['loadingBar'])
  router.beforeEach(() => {
    loadingBar.start()
  })
  router.afterEach((to) => {
    loadingBar.finish()
    document.title = `${String(to.meta.title ?? '')} · BX 版本管理台`
  })
  router.onError(() => loadingBar.error())
}

export default router
