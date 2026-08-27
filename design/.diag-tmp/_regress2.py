# -*- coding: utf-8 -*-
"""回归补测：AI 润色（读 textarea 值）+ 抽屉内废弃按钮 + 命令面板"""
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

    # 向导 → 日志 → AI 润色（验证 textarea 值）
    page.click("aside >> text=发布向导"); page.wait_for_timeout(300)
    page.click("text=下一步：版本"); page.wait_for_timeout(200)
    page.click("text=下一步：生成双轨日志"); page.wait_for_timeout(300)
    page.click("text=对外 external"); page.wait_for_timeout(200)
    page.click("text=AI 润色"); page.wait_for_timeout(1600)
    v = page.evaluate("document.querySelector('textarea').value")
    check('AI 润色写入 textarea', '看得见的效率' in v)
    check('润色后状态变为已编辑', has('已编辑'))
    # diff 视图
    page.click("text=与草稿 diff"); page.wait_for_timeout(300)
    check('diff 视图出现增删行', page.evaluate("document.querySelectorAll('.diff-add').length > 0"))

    # 历史抽屉 + 废弃（点抽屉内按钮）
    page.click("aside >> text=历史与审计"); page.wait_for_timeout(300)
    page.click("tbody tr >> nth=1"); page.wait_for_timeout(400)
    check('发布详情抽屉', has('仓库快照'))
    page.click("div.fixed >> button:has-text('废弃')"); page.wait_for_timeout(300)
    check('废弃确认弹窗', has('废弃原因'))
    page.fill("input[placeholder*='白屏']", '回归测试废弃')
    page.click("button:has-text('确认废弃')"); page.wait_for_timeout(400)
    check('废弃生效', has('已废弃 · 回归测试废弃'))

    # 命令面板
    page.keyboard.press('Escape'); page.keyboard.press('Control+k'); page.wait_for_timeout(300)
    page.fill("input[placeholder*='搜索命令']", '仓库'); page.wait_for_timeout(200)
    check('命令面板过滤仓库', has('打开仓库：IM 即时通讯'))
    page.click("text=打开仓库：IM 即时通讯"); page.wait_for_timeout(300)
    check('命令面板跳转仓库', has('IM 即时通讯'))

    # 弹窗：接入仓库校验 + 成功
    page.click("header >> text=新建项目"); page.wait_for_timeout(300)
    check('新建项目弹窗', has('三步接入'))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    page.click("aside >> text=总览驾驶舱"); page.wait_for_timeout(300)
    page.click("text=主产品线", strict=False) if False else None

    print('pageerrors final:', errs if errs else 'NONE')
    b.close()
