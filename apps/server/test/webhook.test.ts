// webhook test stub
import http from 'node:http'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../src/app'
import { makeRepo, commit, createClient } from './helpers'

let app: any
let base: string
let client: Awaited<ReturnType<typeof createClient>>

function createStub(shouldFail=false){
  const received:any[]=[]
  const srv=http.createServer((req,res)=>{
    let body=''
    req.on('data',c=>body+=c.toString())
    req.on('end',()=>{
      try{received.push(JSON.parse(body))}catch{received.push(body)}
      if(shouldFail){res.writeHead(500);res.end('fail')}else{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}))}
    })
  })
  return new Promise<{srv:http.Server,received:any[],port:number}>(resolve=>srv.listen(0,'127.0.0.1',()=>resolve({srv,received,port:(srv.address() as any).port})))
}

describe('webhook notifications R29',()=>{
  let stubDone:{srv:http.Server,received:any[],port:number}
  let stubFail:{srv:http.Server,received:any[],port:number}
  beforeAll(async()=>{
    stubDone = await createStub()
    stubFail = await createStub(true)
    app = createApp()
    const port = await (app as any).start(0,'127.0.0.1')
    base = `http://127.0.0.1:${port}`
    client = await createClient(base)
  })
  afterAll(async()=>{
    await app.stop()
    stubDone.srv.close()
    stubFail.srv.close()
  })

  it('校验：https 与 events 白名单', async()=>{
    const badHttps = await client.post('/api/config', {notifications:{webhooks:[{id:'bad',url:'http://example.com/hook',events:['done'],enabled:true}]}})
    expect(badHttps.status).toBe(400)
    const badEvents = await client.post('/api/config', {notifications:{webhooks:[{id:'bad2',url:`http://127.0.0.1:${stubDone.port}/hook`,events:['invalid'],enabled:true}]}})
    expect(badEvents.status).toBe(400)
    const dup = await client.post('/api/config', {notifications:{webhooks:[
      {id:'dup',url:`http://127.0.0.1:${stubDone.port}/hook`,events:['done'],enabled:true},
      {id:'dup',url:`http://127.0.0.1:${stubDone.port}/hook`,events:['done'],enabled:true},
    ]}})
    expect(dup.status).toBe(400)
  })

  it('done 与 error webhook 收到对应 payload，且失败不影响主流程', async()=>{
    // 配置 webhooks
    const cfgRes = await client.post('/api/config', {notifications:{webhooks:[
      {id:'wh_done', url:`http://127.0.0.1:${stubDone.port}/hook`, events:['done'], enabled:true},
      {id:'wh_error', url:`http://127.0.0.1:${stubDone.port}/hook`, events:['error'], enabled:true},
      {id:'wh_fail', url:`http://127.0.0.1:${stubFail.port}/hook`, events:['done'], enabled:true},
    ]}})
    expect(cfgRes.status).toBe(200)

    // 成功发布 -> done
    const { body: pr } = await client.post('/api/projects', {name:'webhook-proj-done'})
    const projectId=(pr as any).id
    const repoPath=makeRepo()
    commit(repoPath,'feat: init',{'a.txt':'1'})
    const r=await client.post(`/api/projects/${projectId}/repos`, {path:repoPath})
    expect(r.status).toBe(201)

    const pub=await client.post('/api/publish', {projectId, bump:'auto', offline:true})
    expect(pub.status).toBe(202)
    const taskId=(pub.body as any).taskId
    // wait done via SSE
    const events = await collectSse(base, client.token, taskId)
    expect(events.some(e=>e.type==='done')).toBe(true)
    await new Promise(r=>setTimeout(r,800))
    const donePayloads = stubDone.received.filter(p=>p.event==='done')
    expect(donePayloads.length).toBeGreaterThanOrEqual(1)
    const payload = donePayloads[donePayloads.length-1]
    expect(payload.projectId).toBe(projectId)
    expect(typeof payload.version).toBe('string')
    expect(Array.isArray(payload.failedRepos)).toBe(true)
    expect(typeof payload.timestamp).toBe('string')
    // 失败 webhook 不影响状态
    const cur=await client.get('/api/publish/current')
    expect((cur.body as any).status).toBe('done')

    // 第二次：制造已跟踪文件脏改动 -> 预检阻断 -> 全局 error 事件 -> error webhook
    const fs = await import('node:fs')
    const pathMod = await import('node:path')
    // 改已跟踪文件 a.txt（dirtyCount 仅统计已跟踪文件，untracked 不计）
    fs.appendFileSync(pathMod.join(repoPath,'a.txt'),'dirty-modify')
    const pub2=await client.post('/api/publish', {projectId, bump:'auto', offline:true})
    expect(pub2.status).toBe(202)
    const taskId2=(pub2.body as any).taskId
    const events2=await collectSse(base, client.token, taskId2)
    expect(events2.some(e=>e.type==='error')).toBe(true)
    await new Promise(r=>setTimeout(r,800))
    const errorPayloads = stubDone.received.filter(p=>p.event==='error')
    expect(errorPayloads.length).toBeGreaterThanOrEqual(1)
    const errPayload = errorPayloads[errorPayloads.length-1]
    expect(errPayload.projectId).toBe(projectId)
    expect(Array.isArray(errPayload.failedRepos)).toBe(true)
    expect(typeof errPayload.timestamp).toBe('string')
  })
})

async function collectSse(base:string, token:string, taskId:string){
  const res=await fetch(`${base}/api/events?task=${taskId}`,{headers:{'X-BX-Token':token, Accept:'text/event-stream'}})
  const reader=res.body!.getReader()
  const decoder=new TextDecoder()
  const events:any[]=[]
  let buf=''
  const deadline=Date.now()+60000
  while(Date.now()<deadline){
    const {done, value}=await reader.read()
    if(done) break
    buf+=decoder.decode(value,{stream:true})
    const lines=buf.split('\n')
    buf=lines.pop()??''
    for(const line of lines){
      if(!line.startsWith('data: ')) continue
      const e=JSON.parse(line.slice(6))
      events.push(e)
      if(e.type==='done'||e.type==='error'){ try{reader.cancel()}catch{}; return events}
    }
  }
  return events
}
