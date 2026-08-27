
const { createApp, reactive, computed, ref } = Vue;

/* ── 线性图标库（stroke 1.8，无填充，圆角端点） ── */
const ICONS = {
  dashboard:'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  layers:'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  rocket:'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
  history:'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2',
  archive:'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  settings:'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  pulse:'M22 12h-4l-3 9L9 3l-3 9H2',
  search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  refresh:'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5',
  plus:'M12 5v14M5 12h14',
  zap:'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  flame:'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  trend:'M22 7l-8.5 8.5-5-5L2 17M16 7h6v6',
  bell:'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  check:'M20 6 9 17l-5-5',
  x:'M18 6 6 18M6 6l12 12',
  alert:'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  ban:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2',
  'chev-r':'m9 18 6-6-6-6',
  'arrow-r':'M5 12h14M12 5l7 7-7 7',
  branch:'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  radar:'M19.07 4.93A10 10 0 0 0 6.99 3.34M4 6h.01M2.29 9.62A10 10 0 1 0 21.31 8.35M16.24 7.76A6 6 0 1 0 8.23 16.67M12 18h.01M17.99 11.66A6 6 0 0 1 15.77 16.67M12 12l7.5-7.5',
  repo:'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20',
  sparkle:'M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z',
  download:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  minus:'M5 12h14',
  shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  db:'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3zM21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5',
};

createApp({
  components: {
    icon: { props:['name','size'], template:`<svg :width="size||16" :height="size||16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="d"/></svg>`,
      computed:{ d(){ return ICONS[this.name] || ICONS.dashboard } } }
  },
  setup(){
    const view = ref('dashboard');
    const palette = ref(false), paletteQ = ref('');
    const toasts = ref([]); let tid = 0;
    const toast = (text, kind='ok') => { const id=++tid; toasts.value.push({id,text,kind}); setTimeout(()=>{ toasts.value = toasts.value.filter(t=>t.id!==id) }, 3200); };
    const go = v => view.value = v;
    const viewTitle = computed(()=>({dashboard:'总览驾驶舱',project:'主产品线',wizard:'发布向导',history:'历史与审计',backup:'备份与对比',health:'系统健康',settings:'设置'}[view.value]));

    /* ── 数据 ── */
    const mkCommits = arr => arr.map(c=>({...c, included:true}));
    const repos = ref([
      { id:'l-pc-front', name:'PC 前端主站', branch:'main', dirty:0, files:18, version:'2.4.0', nextVer:'2.4.1', scheme:'semver', pipeline:'pnpm build', backup:true, open:false, included:true, state:'idle',
        commits: mkCommits([{hash:'a3f9c21',type:'feat',msg:'工作台新增数据卡片组'},{hash:'b81d4e7',type:'fix',msg:'修复表格分页边界溢出问题'},{hash:'c55a1f0',type:'refactor',msg:'抽离公共请求拦截器'}]) },
      { id:'l-data-v', name:'数据可视化平台', branch:'main', dirty:2, files:6, version:'2.4.0', nextVer:'2.4.1', scheme:'semver', pipeline:'pnpm build', backup:true, open:false, included:true, state:'idle',
        commits: mkCommits([{hash:'e77b3a9',type:'fix',msg:'大屏图表暗色主题对比度修正'}]) },
      { id:'saas', name:'SaaS 管理后台', branch:'main', dirty:0, files:31, version:'V2608221430', nextVer:'V2608251700', scheme:'V', pipeline:'pnpm build', backup:false, open:false, included:true, state:'idle',
        commits: mkCommits([{hash:'f02c8d1',type:'feat',msg:'租户套餐配置页'},{hash:'9a41e55',type:'feat',msg:'操作日志审计列表'},{hash:'77df201',type:'fix',msg:'权限树勾选状态丢失'},{hash:'6c8b3aa',type:'perf',msg:'菜单接口缓存优化'},{hash:'12ef998',type:'chore',msg:'升级 vite 至 8.x'}]) },
      { id:'im-web', name:'IM 即时通讯', branch:'main', dirty:0, files:9, version:'2.4.0', nextVer:'2.4.1', scheme:'semver', pipeline:'', backup:true, open:false, included:true, state:'idle',
        commits: mkCommits([{hash:'8d3e6b2',type:'feat',msg:'消息撤回与重新编辑'},{hash:'4fa77c1',type:'fix',msg:'群公告 @ 提醒失效'}]) },
      { id:'l-mp-weixin-reface', name:'微信小程序（重构）', branch:'feature/redesign', dirty:0, files:0, version:'2.3.0', nextVer:'—', scheme:'semver', pipeline:'pnpm build:mp', backup:false, open:false, included:false, state:'idle', commits: mkCommits([]) },
      { id:'vr-fornt', name:'VR 展厅前端', branch:'main', dirty:0, files:0, version:'2.4.0', nextVer:'2.4.1', scheme:'semver', pipeline:'', backup:true, open:false, included:false, state:'idle', commits: mkCommits([]) },
    ]);
    const changedRepos = computed(()=> repos.value.filter(r=>r.commits.length||r.dirty));
    const releases = ref([
      { id:1, version:'2.4.0', pre:'', date:'2026-08-22 16:40', repos:6, deprecated:false, failed:0, backup:'6 仓全量' },
      { id:2, version:'2.4.0', pre:'beta.2', date:'2026-08-20 11:02', repos:4, deprecated:false, failed:0, backup:'4 仓全量' },
      { id:3, version:'2.3.1', date:'2026-08-15 09:31', repos:5, deprecated:false, failed:1, backup:'4 仓（1 跳过）' },
      { id:4, version:'2.3.0', date:'2026-08-08 15:12', repos:6, deprecated:true, reason:'小程序白屏回滚', failed:0, backup:'6 仓全量' },
    ]);
    const notices = ref([
      { ok:true, text:'钉钉群「发布通知」：2.4.0 发布完成推送成功', t:'08-22 16:41' },
      { ok:true, text:'飞书 webhook：2.4.0-beta.2 灰度发布推送成功', t:'08-20 11:03' },
      { ok:false, text:'企微 webhook 超时（5s），已自动重试 1 次成功', t:'08-15 09:33' },
    ]);
    const kpis = computed(()=>[
      { label:'管理项目', value:2, sub:'主产品线 · 实验平台', icon:'layers', hot:false },
      { label:'托管仓库', value:6, sub:'5 仓在主发布分支', icon:'repo', hot:false },
      { label:'待发布变动', value:changedRepos.value.length, sub:'11 个新提交 · 64 个文件', icon:'flame', hot:true },
      { label:'备份覆盖率', value:'83%', sub:'2 仓未配置产物目录', icon:'archive', hot:false },
    ]);
    const healthCards = [
      { label:'数据仓库', value:'clean · ahead 0', sub:'远端已同步', icon:'db', ok:true },
      { label:'journal 残留', value:'1 个 interrupted', sub:'08-19 发布中断可续跑', icon:'clock', ok:false },
      { label:'备份目录', value:'1.28 GB', sub:'backups/ · 配额 10 GB', icon:'archive', ok:true },
      { label:'轮询检测', value:'运行中 · 30s', sub:'页面隐藏自动暂停', icon:'pulse', ok:true },
    ];

    /* ── 向导状态机 ── */
    const wizardSteps = ['检测','版本','日志','dry-run','执行','完成'];
    const wizard = reactive({
      step:0, quick:false, bump:'patch', prerelease:'release', format:'X.Y.Z',
      repos: repos.value, logTab:'internal', phase:'idle', console:[], interrupted:false,
      logs: { internal:'', external:'' }, logState: { internal:'auto', external:'auto' },
    });
    const suggestBump = computed(()=> wizard.repos.some(r=>r.included && r.commits.some(c=>c.included&&c.type==='feat')) ? 'minor' : 'patch');
    const suggestReason = computed(()=> suggestBump.value==='minor' ? '检测到 feat 类提交' : '仅 fix/chore 类提交');
    const prereleaseOpts = [{id:'release',label:'正式版'},{id:'beta',label:'Beta'},{id:'rc',label:'RC'},{id:'alpha',label:'自定义 alpha'}];
    const previewVersion = computed(()=>{
      let v = '2.4.1';
      if (wizard.bump==='minor') v='2.5.0'; if (wizard.bump==='major') v='3.0.0';
      if (wizard.format==='V 时间戳') return 'V2608251730';
      return wizard.prerelease==='release' ? v : `${v}-${wizard.prerelease}.1`;
    });
    const milestoneTag = computed(()=> wizard.format==='V 时间戳' ? 'V2608251730' : previewVersion.value);
    const buildTag = computed(()=> 'build/' + (wizard.format==='V 时间戳' ? 'V2608251730' : previewVersion.value));
    const bothConfirmed = computed(()=> wizard.logState.internal==='confirmed' && wizard.logState.external==='confirmed');
    const activeCommits = r => r.commits.filter(c=>c.included);
    const logState = t => wizard.logState[t];
    const showDiff = ref(false), aiBusy = ref(false);

    function startWizard(quick){
      wizard.quick = quick; wizard.step = 0; wizard.phase='idle'; wizard.console=[]; wizard.interrupted=false;
      wizard.logState = { internal:'auto', external:'auto' };
      wizard.repos.forEach(r=>{ r.included = !!(r.commits.length||r.dirty); r.state='idle'; r.open=false; });
      wizard.bump = suggestBump.value;
      if (quick) toast('已预填上次配置：4 仓 · patch · 离线 · 跳过构建','info');
      go('wizard');
    }
    function wizardStepClick(i){
      if (i < wizard.step && wizard.phase!=='running') wizard.step = i;
      else if (i===3 && !bothConfirmed.value) toast('双轨日志均未确认，门禁不可绕过','warn');
    }
    function genLogs(){
      const n = wizard.repos.filter(r=>r.included).length;
      wizard.logs.internal = `# ${previewVersion.value} 内部发布日志\n\n## 提交明细（${n} 仓 · 11 提交）\n- l-pc-front: feat 工作台新增数据卡片组 (a3f9c21)\n- l-pc-front: fix 修复表格分页边界溢出 (b81d4e7)\n- saas: feat 租户套餐配置页 (f02c8d1)\n- saas: perf 菜单接口缓存优化 (6c8b3aa)\n- im-web: feat 消息撤回与重新编辑 (8d3e6b2)\n…\n\n## 影响文件\n共 64 个文件，+1,204 / −389 行\n\n## 构建与备份\n- 构建：离线跳过（默认）\n- 备份：源码 bundle + archive；saas / l-mp 未配置产物目录已跳过`;
      wizard.logs.external = `## ${previewVersion.value} 更新公告\n\n### 新功能\n- 工作台全新数据卡片组，关键指标一屏尽览\n- SaaS 后台支持租户套餐灵活配置\n- IM 支持消息撤回与重新编辑\n\n### 修复\n- 修复表格分页边界情况下的显示异常\n- 修复大屏图表暗色主题对比度问题\n- 修复群公告 @ 提醒偶发失效`;
    }
    function markEdited(t){ if (wizard.logState[t]==='auto') wizard.logState[t]='edited'; }
    function confirmLog(t){ wizard.logState[t]='confirmed'; toast((t==='internal'?'对内':'对外')+'日志已确认'); }
    function tryGoDryRun(){
      if (!bothConfirmed.value) return toast('请先确认双轨日志（人审为终，不可绕过）','warn');
      wizard.step=3; runDry();
    }
    /* dry-run */
    const dryChecks = [
      { name:'仓库路径与 .git 校验（6 仓）', ok:true, note:'' },
      { name:'HEAD 非 detached · 分支可达', ok:true, note:'' },
      { name:'lastPublishCommit 可达性（4 仓基准正常）', ok:true, note:'' },
      { name:'里程碑标签冲突检测', ok:true, note: milestoneTag.value+' 未占用' },
      { name:'构建标签撞名检测（撞名自动追加序号）', ok:true, note:'' },
      { name:'工作区 dirty 提示（l-data-v 2 个文件，不阻断）', ok:false, blocker:false, note:'仅警告' },
      { name:'离线模式：跳过远程推送，降级为纯本地发布', ok:false, blocker:false, note:'已声明 offline' },
    ];
    const dryProgress = ref(0);
    const dryBlockers = computed(()=> dryChecks.filter(c=>!c.ok&&c.blocker).length);
    const dryWarnings = computed(()=> dryChecks.filter(c=>!c.ok&&!c.blocker).length);
    function runDry(){ dryProgress.value=0; const t=setInterval(()=>{ dryProgress.value++; if(dryProgress.value>=dryChecks.length) clearInterval(t); }, 380); }
    /* 执行模拟（SSE） */
    let execTimer=null;
    function ts(){ const d=new Date(); return d.toTimeString().slice(0,8); }
    function clog(text, cls='t-info'){ wizard.console.push({t:ts(),text,cls}); requestAnimationFrame(()=>{ const el=document.querySelector('.console'); if(el) el.scrollTop=el.scrollHeight; }); }
    function startExecute(){
      wizard.step=4; wizard.phase='running'; wizard.console=[];
      const queue = wizard.repos.filter(r=>r.included);
      const script = [
        ['t-info','[plan] 发布计划锁定 · 版本 '+previewVersion.value+' · bump '+wizard.bump],
        ['t-info','[preflight] 预检通过（0 阻断 / 2 警告）'],
        ['t-info','[journal] journal 初始化 · task pub_'+Date.now().toString(36)],
      ];
      queue.forEach(r=>{
        script.push(['t-info','['+r.id+'] repo-start · preflight ok']);
        script.push(['t-info','['+r.id+'] 离线模式跳过构建']);
        script.push(['t-ok','['+r.id+'] tag '+milestoneTag.value+' 创建（幂等）']);
        script.push(['t-ok','['+r.id+'] tag '+buildTag.value+' 创建']);
        script.push(['t-ok','['+r.id+'] version.json 写入 · lastPublishCommit 回写']);
        if(r.backup) script.push(['t-ok','['+r.id+'] 源码 bundle + archive 备份完成 · manifest 入数据仓库']);
        else script.push(['t-warn','['+r.id+'] 未配置 artifactDir，产物备份跳过']);
        script.push(['t-warn','['+r.id+'] offline · 跳过远程标签推送']);
      });
      script.push(['t-info','[sync] 未变动仓库同步基版（syncedOnly）']);
      script.push(['t-info','[records] ReleaseRecord 落盘 · 数据仓库 commit']);
      script.push(['t-ok','[webhook] 钉钉 / 飞书 done 事件推送成功']);
      script.push(['t-ok','[done] 发布完成 · '+previewVersion.value+' · failedRepos: 0']);
      let i=0, ri=0;
      execTimer=setInterval(()=>{
        if (i>=script.length){ clearInterval(execTimer); wizard.phase='done'; wizard.step=5;
          releases.value.unshift({id:Date.now(),version:previewVersion.value.split('-')[0],pre:wizard.prerelease==='release'?'':wizard.prerelease+'.1',date:'刚刚',repos:queue.length,deprecated:false,failed:0,backup:queue.filter(r=>r.backup).length+' 仓全量'});
          return; }
        const line = script[i++];
        if (line[1].includes('repo-start')) { if(ri>0) queue[ri-1].state='done'; queue[ri].state='running'; ri++; }
        if (i===script.length) queue.forEach(r=>r.state='done');
        clog(line[1], line[0]);
      }, 420);
    }
    function interrupt(){
      clearInterval(execTimer); wizard.phase='idle'; wizard.interrupted=true;
      clog('[interrupt] 用户中断 · journal 已标记 interrupted，随时可一键续跑','t-err');
      toast('发布已中断，journal 已落盘，可从系统健康页续跑','warn');
    }
    function finishWizard(){ go('project'); toast('发布记录已归档，版本清单可随时导出'); }

    /* ── 历史 / 备份 ── */
    function deprecate(h){ h.deprecated=true; h.reason='人工标记废弃'; toast(h.version+' 已标记废弃，业务仓库标签已可选清理','warn'); }
    const backups = ref([
      { id:1, version:'2.4.0', date:'08-22', artifacts:'4 仓', size:'486 MB', verified:true },
      { id:2, version:'2.4.0-beta.2', date:'08-20', artifacts:'4 仓', size:'402 MB', verified:true },
      { id:3, version:'2.3.1', date:'08-15', artifacts:'3 仓', size:'391 MB', verified:false },
    ]);
    const selBackup = ref(backups.value[0]);
    function verifyBackup(b){ b.verified=true; toast(b.version+' manifest 校验通过 · SHA-256 全量一致'); }
    const cmpA = ref('2.3.1'), cmpB = ref('2.4.0');
    const cmpRunning = ref(false), cmpDone = ref(false);
    const cmpStats = ref([]);
    const cmpFiles = ref([]);
    function runCompare(){
      cmpRunning.value=true; cmpDone.value=false;
      setTimeout(()=>{ cmpRunning.value=false; cmpDone.value=true;
        cmpStats.value=[{label:'新增',n:14,color:'#00C96E'},{label:'删除',n:3,color:'#FF4D4F'},{label:'修改',n:47,color:'#FFA940'},{label:'一致',n:'2,846',color:'#6E7571'}];
        cmpFiles.value=[
          {k:'新增',p:'src/views/Dashboard/cards/MetricGroup.vue',d:'+212 行'},
          {k:'新增',p:'src/api/tenant/package.ts',d:'+88 行'},
          {k:'修改',p:'src/components/DataTable/pagination.ts',d:'+34 / −12'},
          {k:'修改',p:'src/styles/themes/dark.css',d:'对比度 token 调整'},
          {k:'删除',p:'src/legacy/notice-bar.ts',d:'已迁移'},
          {k:'一致',p:'packages/shared/types.ts',d:'SHA-256 匹配'},
        ];
      }, 1100);
    }

    /* ── 健康 / 设置 ── */
    const healthPanels = [
      { title:'数据仓库', icon:'db', ok:true, action:'立即同步', rows:[{k:'状态',v:'clean'},{k:'ahead / behind',v:'0 / 0'},{k:'最近提交',v:'release: 2.4.0'},{k:'远端',v:'git@…/bxverse-data.git'}] },
      { title:'journal 断点', icon:'clock', ok:false, action:'一键续跑', rows:[{k:'interrupted 任务',v:'1',warn:true},{k:'任务',v:'pub_m3k9x2 · 2.4.0-beta.3'},{k:'断点',v:'saas 仓 tag 步骤前'},{k:'扫描策略',v:'启动时 running→interrupted'}] },
      { title:'备份存储', icon:'archive', ok:true, rows:[{k:'占用',v:'1.28 GB / 10 GB'},{k:'备份数',v:'17 份（3 版本）'},{k:'完整性',v:'全部通过 manifest 校验'},{k:'大文件',v:'不进数据仓库'}] },
      { title:'webhook 通道', icon:'bell', ok:true, rows:[{k:'启用通道',v:'2 / 3'},{k:'24h 投递',v:'5 成功 / 1 重试'},{k:'超时',v:'5s · 重试 1 次'},{k:'失败影响',v:'仅记 structuredLog'}] },
      { title:'轮询检测', icon:'pulse', ok:true, rows:[{k:'间隔',v:'30s · TTL 缓存'},{k:'页面隐藏',v:'自动暂停'},{k:'提交解析上限',v:'3000 条'},{k:'执行中项目',v:'暂停轮询'}] },
      { title:'发布队列', icon:'layers', ok:true, rows:[{k:'模式',v:'单 FIFO'},{k:'当前',v:'空闲'},{k:'忙时策略',v:'409 + 排队位置'},{k:'优雅退出',v:'SIGINT 全量关闭 SSE'}] },
    ];
    const secBaseline = ['仅绑定 127.0.0.1','Host 头白名单（防 DNS rebinding）','Origin 白名单 + 非 GET 强制 JSON','X-BX-Token timingSafeEqual','凭据 0600 不进数据仓库','路径穿越与符号链接拦截','非 GET 发布中 409 互斥','token 只走 Header'];
    const aiProviders = ref([
      {name:'DeepSeek 官方',model:'deepseek-chat',active:true},{name:'Kimi coding',model:'kimi-k2',active:false},
      {name:'MiniMax coding',model:'MiniMax-M2',active:false},{name:'Ollama 本地',model:'qwen3:14b',active:false},
      {name:'OpenAI',model:'gpt-5',active:false},{name:'小米 MiMo',model:'mimo-v2',active:false},
      {name:'硅基流动',model:'Qwen3-Coder',active:false},{name:'自定义 baseUrl',model:'…',active:false},
    ]);
    const aiRoutes = ref([
      {scene:'commit',desc:'提交信息生成 · 极速',model:'DeepSeek-V3.2'},
      {scene:'polish',desc:'日志润色',model:'Kimi-K2'},
      {scene:'explain',desc:'变更解读 · 深度推理',model:'MiniMax-M2'},
    ]);
    const webhooks = ref([
      {name:'钉钉 · 发布通知群',url:'https://oapi.dingtalk.com/robot/send?…',events:'done + error',on:true,ok:true},
      {name:'飞书 · 研发协同',url:'https://open.feishu.cn/open-apis/bot/…',events:'done',on:true,ok:true},
      {name:'企微 · 运维告警',url:'https://qyapi.weixin.qq.com/…',events:'error',on:false,ok:false},
    ]);

    function alignAll(){ toast('批量对齐完成：l-mp-weixin-reface 已切回 main 并快进拉取（其余 5 仓已在 main）'); }
    function repoDetail(r){ toast('进入 '+r.name+' 仓库工作台：文件树 / Git 面板 / AI 提交信息 / 流水线配置（原型聚焦主链路）','info'); }

    /* ── 命令面板 ── */
    const paletteItems = computed(()=>{
      const all = [
        {label:'发起详细发布向导',icon:'rocket',hint:'向导',run:()=>startWizard(false)},
        {label:'快速发布（复用上次配置）',icon:'zap',hint:'R28',run:()=>startWizard(true)},
        {label:'跳转到 总览驾驶舱',icon:'dashboard',hint:'页面',run:()=>go('dashboard')},
        {label:'跳转到 项目 · 主产品线',icon:'layers',hint:'页面',run:()=>go('project')},
        {label:'跳转到 发布历史与审计',icon:'history',hint:'页面',run:()=>go('history')},
        {label:'跳转到 备份与一致性对比',icon:'archive',hint:'页面',run:()=>go('backup')},
        {label:'跳转到 系统健康',icon:'pulse',hint:'页面',run:()=>go('health')},
        {label:'跳转到 设置',icon:'settings',hint:'页面',run:()=>go('settings')},
        {label:'同步数据仓库',icon:'refresh',hint:'操作',run:()=>toast('数据仓库已同步')},
        {label:'批量对齐主分支',icon:'branch',hint:'R25',run:alignAll},
        {label:'AI 解读本次待发布变更',icon:'sparkle',hint:'explain 路由',run:()=>toast('AI 解读（explain · MiniMax-M2）：本次以 feat 为主，建议 minor；saas 的 vite 8 升级需关注构建兼容性','info')},
      ];
      const q = paletteQ.value.trim();
      return q ? all.filter(c=>c.label.includes(q)) : all;
    });

    const queueBusy = computed(()=> wizard.phase==='running');
    const nav = [
      {id:'dashboard',label:'总览驾驶舱',icon:'dashboard'},
      {id:'wizard',label:'发布向导',icon:'rocket'},
      {id:'history',label:'历史与审计',icon:'history'},
      {id:'backup',label:'备份与对比',icon:'archive'},
      {id:'health',label:'系统健康',icon:'pulse'},
      {id:'settings',label:'设置',icon:'settings'},
    ];

    return { view, go, viewTitle, nav, palette, paletteQ, paletteItems, toasts, toast,
      kpis, changedRepos, repos, releases, notices, healthCards, wizard, wizardSteps, suggestBump, suggestReason,
      prereleaseOpts, previewVersion, milestoneTag, buildTag, bothConfirmed, activeCommits, logState, showDiff, aiBusy,
      startWizard, wizardStepClick, genLogs, markEdited, confirmLog, tryGoDryRun, dryChecks, dryProgress, dryBlockers, dryWarnings,
      startExecute, interrupt, finishWizard, deprecate, backups, selBackup, verifyBackup, cmpA, cmpB, cmpRunning, cmpDone, cmpStats, cmpFiles, runCompare,
      healthPanels, secBaseline, aiProviders, aiRoutes, webhooks, alignAll, repoDetail, queueBusy };
  }
}).mount('#app');
