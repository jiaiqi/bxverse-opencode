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

    # 新建项目弹窗
    page.click("header >> text=新建项目"); page.wait_for_timeout(300)
    inputs = page.query_selector_all("div.fixed input")
    print('dialog inputs:', len(inputs))
    inputs[0].fill('测试项目'); inputs[1].fill('E:\\bx-gitee'); page.wait_for_timeout(200)
    print('name val:', inputs[0].input_value(), '| dir val:', inputs[1].input_value())
    page.click("div.fixed >> button:has-text('探测仓库')"); page.wait_for_timeout(400)
    check('step1 探测结果', has('个 git 仓库'))
    page.click("div.fixed >> button:has-text('完成接入')"); page.wait_for_timeout(300)
    check('step2 创建完成', has('已创建'))
    page.click("div.fixed >> button:has-text('进入项目')"); page.wait_for_timeout(400)
    check('回到项目页', has('仓库'))

    # 命令面板
    page.click("aside >> button:has-text('命令面板')"); page.wait_for_timeout(400)
    pin = page.query_selector("div.fixed input")
    check('面板输入框存在', pin is not None)
    pin.fill('仓库'); page.wait_for_timeout(200)
    check('过滤出仓库命令', has('打开仓库：IM 即时通讯'))
    page.click("div.fixed >> text=打开仓库：IM 即时通讯"); page.wait_for_timeout(400)
    check('跳转到 IM 仓库', has('box-im'))
    page.click("text=提交历史"); page.wait_for_timeout(300)
    check('IM 提交历史可见', has('消息撤回与重新编辑'))

    print('pageerrors final:', errs if errs else 'NONE')
    b.close()
