# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright

URL = 'file:///G:/vibecoding/bxverse-opencode/design/bxverse-ultimate-cockpit.html'

def check(name, ok):
    print(('PASS' if ok else 'FAIL') + ' | ' + name)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:150]))
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(1000)
    def has(txt):
        return page.evaluate("(t)=>document.body.innerText.includes(t)", txt)

    # 命令面板（侧栏按钮打开）
    page.click("aside >> button:has-text('命令面板')"); page.wait_for_timeout(400)
    check('命令面板打开', has('搜索命令、页面、仓库'))
    page.fill("div.fixed input", '仓库'); page.wait_for_timeout(200)
    check('命令面板过滤仓库', has('打开仓库：IM 即时通讯'))
    page.click("text=打开仓库：IM 即时通讯"); page.wait_for_timeout(400)
    check('命令面板跳转仓库工作台', has('消息撤回与重新编辑'))

    # 仓库 Git 工作台 + AI 提交 + 提交
    page.click("text=Git 工作台"); page.wait_for_timeout(300)
    check('Git 面板（IM 干净态）', has('工作区干净'))

    # 数据可视化平台（有 dirty）→ AI 提交信息 → 提交
    page.click("aside >> text=数据可视化平台"); page.wait_for_timeout(300)
    page.click("text=Git 工作台"); page.wait_for_timeout(300)
    check('变更文件列表', has('dark.css'))
    page.click("text=M  src/styles") if False else page.click("div.glass >> text=dark.css"); page.wait_for_timeout(200)
    check('diff 视图渲染', page.evaluate("document.querySelectorAll('.diff-add').length > 0"))
    page.click("text=AI 生成"); page.wait_for_timeout(1200)
    v = page.evaluate("document.querySelector('textarea').value")
    check('AI 提交信息草稿', v.startswith('fix(theme)'))
    page.click("text=提交全部变更"); page.wait_for_timeout(400)
    check('提交后工作区干净', has('工作区干净'))

    # 新建项目弹窗流程
    page.click("header >> text=新建项目"); page.wait_for_timeout(300)
    page.fill("input[placeholder*='主产品线']", '测试项目')
    page.fill("input[placeholder*='bx-gitee']", 'E:\\bx-gitee')
    page.click("text=探测仓库"); page.wait_for_timeout(300)
    check('探测到仓库列表', has('探测到'))
    page.click("text=完成接入"); page.wait_for_timeout(300)
    check('创建完成', has('已创建'))

    # 接入仓库校验
    page.click("text=进入项目"); page.wait_for_timeout(400)
    page.click("text=接入仓库"); page.wait_for_timeout(300)
    page.fill("div.fixed input", 'abc')
    page.click("div.fixed >> text=接入"); page.wait_for_timeout(200)
    check('接入校验拦截非法路径', has('绝对路径'))
    page.fill("div.fixed input", 'E:\\demo\\new-repo')
    page.click("div.fixed >> text=接入"); page.wait_for_timeout(400)
    check('新仓库出现在项目页', has('new-repo'))

    # 设置：添加 webhook 校验
    page.click("aside >> text=设置"); page.wait_for_timeout(300)
    page.click("text=+ 添加"); page.wait_for_timeout(300)
    page.fill("div.fixed input >> nth=0", '测试渠道')
    page.fill("div.fixed input >> nth=1", 'http://evil.example.com/hook')
    page.click("div.fixed >> text=保存"); page.wait_for_timeout(200)
    check('webhook 强制 https 校验', has('必须为 https'))
    page.fill("div.fixed input >> nth=1", 'https://open.feishu.cn/test')
    page.click("div.fixed >> text=保存"); page.wait_for_timeout(400)
    check('webhook 添加成功', has('测试渠道'))

    print('pageerrors final:', errs if errs else 'NONE')
    b.close()
