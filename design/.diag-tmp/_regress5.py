# -*- coding: utf-8 -*-
# 回归：终极形态原型 v2.1 —— 合并 ultimate-state 增量后的新功能验证
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'
FAILED = []

def check(name, ok):
    print(('PASS' if ok else 'FAIL') + ' | ' + name)
    if not ok: FAILED.append(name)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:150]))
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(1000)
    def has(txt):
        return page.evaluate("(t)=>document.body.innerText.includes(t)", txt)

    # 1. 真链接导航 + hash 同步
    page.click("aside nav a:has-text('备份与对比')"); page.wait_for_timeout(400)
    check('hash 导航 #backup', page.evaluate("location.hash") == '#backup')
    check('备份视图渲染', has('一致性对比引擎'))

    # 2. 备份恢复弹窗：二次确认解锁
    page.click("aside nav a:has-text('备份与对比') >> nth=0"); page.wait_for_timeout(200)
    page.click("section >> button:has-text('恢复…') >> nth=0"); page.wait_for_timeout(400)
    check('恢复弹窗打开', has('同名文件冲突策略'))
    go_btn = page.query_selector("div.fixed >> button:has-text('确认恢复')")
    check('未输版本号时禁用', go_btn.is_disabled())
    page.fill("div.fixed input[placeholder^='2.4.0']", '2.4.0'); page.wait_for_timeout(200)
    check('输入版本号后解锁', not go_btn.is_disabled())
    page.click("div.fixed >> button:has-text('覆盖')"); page.wait_for_timeout(150)
    go_btn.click(); page.wait_for_timeout(400)
    check('恢复触发 toast', has('开始流式解包恢复'))

    # 3. Onboarding 四步引导
    page.click("aside >> button:has-text('新手引导')"); page.wait_for_timeout(400)
    check('引导打开', has('欢迎使用 bxverse 版本管理台'))
    page.click("div.fixed >> button:has-text('下一步')"); page.wait_for_timeout(250)
    check('引导第 2 步', has('保护你的服务'))
    page.click("div.fixed >> div:has-text('复制访问令牌')"); page.wait_for_timeout(150)
    page.click("div.fixed >> button:has-text('下一步')"); page.wait_for_timeout(250)
    check('引导第 3 步', has('创建项目并接入仓库'))
    page.click("div.fixed >> button:has-text('下一步')"); page.wait_for_timeout(250)
    check('引导第 4 步', has('完成第一次发布'))
    page.click("div.fixed >> button:has-text('完成')"); page.wait_for_timeout(400)
    check('引导关闭并 toast', has('引导完成'))

    # 4. 向导故障演练：注入 TAG_CONFLICT → 结构化诊断 → 换版本号重试
    page.click("header >> button:has-text('快速发布')"); page.wait_for_timeout(500)
    check('向导打开(快速通道)', has('快速通道'))
    page.click("button:has-text('下一步：版本')"); page.wait_for_timeout(300)
    page.click("button:has-text('下一步：生成双轨日志')"); page.wait_for_timeout(400)
    page.click("button:has-text('确认当前轨')"); page.wait_for_timeout(200)
    page.click("button:has-text('对外 external')"); page.wait_for_timeout(200)
    page.click("button:has-text('确认当前轨')"); page.wait_for_timeout(200)
    page.click("button:has-text('下一步：dry-run')"); page.wait_for_timeout(400)
    page.check("label:has-text('故障演练') input"); page.wait_for_timeout(200)
    page.wait_for_timeout(2800)  # dry-run 预检跑完
    page.click("button:has-text('进入执行')"); page.wait_for_timeout(500)
    # 等待失败收尾（全脚本 ~13s）
    page.wait_for_selector("text=执行中断 · 1 仓失败", timeout=20000)
    check('失败恢复卡片出现', True)
    check('失败隔离日志', has('失败隔离：其余仓库不受影响'))
    page.click("button:has-text('结构化诊断')"); page.wait_for_timeout(300)
    check('诊断面板展开', has('该标签来源') and has('手工打的同名里程碑标签'))
    page.click("button:has-text('改用下一版本号重试失败仓库')"); page.wait_for_timeout(500)
    check('版本号 +1 重试（minor 2.5.0→2.5.1）', has('2.5.1'))
    page.wait_for_selector("text=发布完成", timeout=15000)
    page.wait_for_timeout(400)
    check('重试后发布完成且完成页展示新版本', has('2.5.1'))
    page.click("aside nav a:has-text('历史与审计')"); page.wait_for_timeout(500)
    check('历史首条标记重试成功（不重复归档）', has('重试成功'))

    # 5. 运维中心：doctor 体检 + 日志级别过滤
    page.click("aside nav a:has-text('系统健康')"); page.wait_for_timeout(500)
    check('doctor 卡片', has('一致性体检（doctor）'))
    check('数据迁移卡片', has('schemaVersion'))
    page.click("button:has-text('立即全量体检')"); page.wait_for_timeout(2500)
    check('体检完成', has('全量体检完成'))
    page.click("button:has-text('error')"); page.wait_for_timeout(300)
    log_text = page.evaluate("document.querySelector('.console').parentElement.innerText")
    check('error 过滤生效', 'non-fast-forward' in log_text and '飞书群通知投递成功' not in log_text)
    check('关于 bxverse 自举', has('v1.4.2') and has('watchdog'))

    # 6. 注解模式
    page.check("header >> label:has-text('标注新能力') input"); page.wait_for_timeout(300)
    check('body note-on 类', page.evaluate("document.body.classList.contains('note-on')"))
    check('注解提示条', has('蓝色虚线'))
    n_outlined = page.evaluate("document.querySelectorAll('[data-new]').length")
    check('data-new 锚点数量 >= 5（当前视图可见）', n_outlined >= 5)
    print('data-new count:', n_outlined)

    # 7. 文本选择基线（按钮禁选、正文可选）
    btn_sel = page.evaluate("getComputedStyle(document.querySelector('header button')).userSelect")
    check('按钮 user-select none', btn_sel == 'none')

    print('pageerrors:', errs if errs else 'NONE')
    check('零 pageerror', not errs)
    b.close()

print('=== %s ===' % ('ALL PASS' if not FAILED else ('FAILED: ' + ', '.join(FAILED))))
