import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {once} from 'node:events'

test('Server continues discovery, query, correction and answer without exposing all schema initially',async()=>{
 const payloads=[]
 const query={objectType:'Tenant',mode:'list',filters:[],properties:['name'],related:null,traverse:[],offset:0,limit:1}
 const responses=[
  {tool:'describe_object_type',args:{objectType:'Tenant'}},
  {tool:'query_ontology',args:{...query,properties:['secret']}},
  {tool:'query_ontology',args:query},
  {answer:'已查到张三。'},
  {tool:'prepare_action',args:{actionType:'rename',mode:'new',clear:[],parameters:[]}},
  {tool:'search_actions',args:{query:'rename',objectType:'',offset:0}},
  {tool:'describe_action',args:{actionType:'rename'}},
  {tool:'prepare_action',args:{actionType:'rename',mode:'new',clear:[],parameters:[]}},
  {tool:'call_function',args:{functionId:'Count.houses',version:'1.0.0',parameters:[]}},
  {answer:'共有 2 套房屋。'},
  {tool:'call_function',args:{functionId:'NotAllowed',version:'1.0.0',parameters:[]}}
 ]
 const mock=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk
  payloads.push(JSON.parse(raw))
  const next=responses.shift()
  res.setHeader('Content-Type','application/json')
  res.end(JSON.stringify({model:'test-model',choices:[{message:next.answer?{role:'assistant',content:next.answer}:
   {role:'assistant',content:null,tool_calls:[{id:'call'+payloads.length,type:'function',function:{name:next.tool,arguments:JSON.stringify(next.args)}}]}}]}))
 })
 mock.listen(0,'127.0.0.1');await once(mock,'listening')
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening')
 const port=probe.address().port;await new Promise(r=>probe.close(r))
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),windowsHide:true,
  env:{...process.env,RENTAL_PORT:String(port),RENTAL_MODEL_PROVIDER:'chat_completions',OPENAI_API_KEY:'test-only',
   OPENAI_API_MODE:'chat_completions',OPENAI_BASE_URL:`http://127.0.0.1:${mock.address().port}/v1`},stdio:['ignore','pipe','pipe']})
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server failed to start')})])
  const post=async(path,data)=>{
   const response=await fetch(`http://127.0.0.1:${port}/api/aip/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
   const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body
  }
  const request={question:'查租客',asOf:'2026-11-24',workspace:{name:'测试'},agent:{name:'用户创建的助手',instructions:'只处理租约查询',version:2},actions:[{apiName:'rename'}],views:[],
   objectTypes:[{apiName:'Tenant',name:'租客',description:'签约人',properties:[{apiName:'name'}],links:[]}],retrievalContext:null}
  let step=await post('plan',request)
  assert.equal(step.tool,'describe_object_type');assert.equal(step.result.objectType.properties[0].apiName,'name')
  assert.equal(step.initialContext.objectTypes[0].properties,undefined)
  assert.deepEqual(step.initialContext.agent,{name:'用户创建的助手',instructions:'只处理租约查询',version:2})
  assert.deepEqual(JSON.parse(payloads[0].messages[1].content),step.initialContext)
  step=await post('answer',{toolId:step.toolId,result:step.result})
  assert.match(step.result.error,/未开放/)
  step=await post('answer',{toolId:step.toolId,result:step.result})
  assert.equal(step.tool,'query_ontology');assert.deepEqual(step.query,query)
  const queried=step.toolId
  step=await post('answer',{toolId:queried,result:{objects:[{name:'张三'}],total:1}})
  assert.equal(step.answer,'已查到张三。')
  assert.equal(payloads[3].messages.filter(m=>m.role==='tool').length,3)
  assert.ok(payloads[3].messages.at(-1).content.includes('张三'))
  const reused=await fetch(`http://127.0.0.1:${port}/api/aip/answer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({toolId:queried,result:{}})})
  assert.equal(reused.status,400)
  let action=await post('plan',request)
  assert.equal(action.initialContext.actions,undefined)
  assert.equal(action.initialContext.actionCatalog.totalActions,1)
  assert.match(action.result.error,/describe_action/)
  action=await post('answer',{toolId:action.toolId,result:action.result})
  assert.equal(action.result.items[0].apiName,'rename')
  action=await post('answer',{toolId:action.toolId,result:action.result})
  assert.equal(action.result.action.apiName,'rename')
  action=await post('answer',{toolId:action.toolId,result:action.result})
  assert.equal(action.tool,'prepare_action');assert.equal(action.action.actionType,'rename')
  assert.equal(action.answer,undefined) // A draft, not a fabricated successful edit.
  const withFunction={...request,toolGuidance:{query_ontology:'先按房屋名称定位，再查归属。'},functions:[{id:'Count.houses',version:'1.0.0',description:'查询房屋总数，返回整数。',parameters:[],output:'Integer'}]}
  let fn=await post('plan',withFunction)
  assert.equal(fn.tool,'call_function');assert.equal(fn.functionCall.functionId,'Count.houses')
  assert.equal(fn.initialContext.functions[0].description,'查询房屋总数，返回整数。')
  assert.match(payloads.at(-1).tools.find(t=>t.function.name==='query_ontology').function.description,/先按房屋名称/)
  fn=await post('answer',{toolId:fn.toolId,result:{kind:'function_result',value:2}})
  assert.equal(fn.answer,'共有 2 套房屋。')
  fn=await post('plan',withFunction)
  assert.match(fn.result.error,/Function 未开放/)
 }finally{
  const exited=once(child,'exit');child.kill();await exited
  mock.closeAllConnections();await new Promise(r=>mock.close(r))
 }
})
