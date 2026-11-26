/* Ontology Lab's configurable model context. This browser workspace is a simulator,
   not a server-authenticated implementation of Foundry permissions. */
function activeAssistant(){return S.aipAgents?.[S.activeAgent]?.published||null}
function assistantToolDescription(at,config){
 return config?.toolDescriptions?.[at.id]?.trim()||at.description||''
}
function aipInterfaceImpls(at,iface,read){
 return ifaceImpls(iface,read.onto).filter(ot=>read.types[ot.id]&&!ifaceActionOff(ot,at.id,iface)).filter(ot=>
  at.rules.filter(r=>INTERFACE_LINK_RULES.includes(r.type)&&r.interface===iface).every(r=>{
   const impl=ot.interfaces.find(i=>i.iface===iface),link=read.onto.linkTypes[impl.links?.[r.constraint]]
   if(!link)return false
   const side=sideOf(link,ot.id)
   return read.types[link[other(side)].objectType]&&read.exposure[ot.id]?.links.includes(link.id+':'+side)
  }))
}
function aipActionScopeErrors(at,config,onto=C()){
 const errors=[],types=Object.fromEntries(Object.entries(onto.objectTypes).filter(([id])=>config.types?.[id]?.enabled)),read={onto,types,exposure:config.types||{}}
 const need=id=>{if(!types[id])errors.push(at.name+' 需要开放对象类型：'+(onto.objectTypes[id]?.name||id))}
 if(at.objectType)need(at.objectType)
 for(const p of at.parameters){
  if(p.type==='Object reference')need(p.objectType)
  if(['Interface reference','Object type'].includes(p.type)&&!aipInterfaceImpls(at,p.interface,read).length)errors.push(at.name+' 的接口没有可用的已开放实现类型或关系。')
 }
 for(const r of at.rules){
  if(r.objectType)need(r.objectType)
  if(LINK_RULES.includes(r.type)){
   const l=onto.linkTypes[r.linkType]
   if(!l||!types[l.b.objectType]||!config.types?.[l.a.objectType]?.links.includes(l.id+':a'))errors.push(at.name+' 需要开放其 A → B 的 Link。')
  }
  if(r.type==='function'){
   const resolved=fnResolve(r)
   if(!resolved||resolved.meta.kind!=='edit')errors.push(at.name+' 引用的编辑 Function 版本无效。')
   else for(const api of new Set([...(fnVersionMeta(r.fn,r.version)?.edits||[]),...resolved.meta.edits]))need(otByApi(api,onto)?.id||api)
  }
 }
 if(!at.objectType&&!at.rules.some(r=>r.type==='function'||IFACE_RULES.includes(r.type)||INTERFACE_LINK_RULES.includes(r.type)))errors.push(at.name+' 尚未支持作为 AIP 工具。')
 return [...new Set(errors)]
}
function aipToolGuidance(){return {query_ontology:activeAssistant()?.config.queryDescription?.trim()||''}}
function assistantFunctionMeta(p){return p.version?fnVersionMeta(p.id,p.version):fnRegistry()[p.id]?.latest.meta}
function aipFunctionCatalog(read){
 return (activeAssistant()?.config.functions||[]).filter(p=>p.enabled).flatMap(p=>{
  const m=assistantFunctionMeta(p)
  if(!m||m.kind==='edit'||m.async||m.inputs.some(i=>{const t=fnParamType(i.type,C());return !t||(t.objectType&&!read.types[t.objectType])}))return []
  return [{id:p.id,version:p.version||fnRegistry()[p.id].latest.version,description:p.description?.trim()||m.description||'',parameters:m.inputs,output:m.output}]
 })
}
function aipRunFunction(request,read){
 const f=aipFunctionCatalog(read).find(f=>f.id===request?.functionId)
 if(!f||f.version!==request.version)throw Error('Function 未开放或版本已变化，请重新提问。')
 if(!Array.isArray(request.parameters)||request.parameters.length>32)throw Error('Function 参数无效。')
 const args={},onto={...C(),objectTypes:read.types}
 for(const p of request.parameters){
  const input=f.parameters.find(i=>i.name===p.name)
  if(!input||Object.hasOwn(args,p.name)||typeof p.value!=='string')throw Error('Function 参数重复或不存在。')
  const t=fnParamType(input.type,C())
  let values=[p.value]
  if(t.list){try{values=JSON.parse(p.value)}catch{throw Error(input.name+' 必须是 JSON 数组。')}if(!Array.isArray(values)||values.length>50)throw Error(input.name+' 数组无效或超过 50 项。')}
  for(const v of values){
   if(t.objectType){const ot=read.types[t.objectType];if(!read.objects(ot.id).some(o=>String(o[ot.primaryKey])===String(v)))throw Error('对象引用不可访问：'+input.name)}
   else if(!typeOk(t.type,String(v)))throw Error(input.name+' 与 '+input.type+' 类型不符。')
  }
  args[p.name]=t.list?values:p.value
 }
 const result=runFunction(fnVersionMeta(f.id,f.version),args,onto,{read})
 if(!result.ok)throw Error(result.error)
 const value=result.value===undefined?null:JSON.parse(JSON.stringify(result.value))
 if(JSON.stringify(value).length>20000)throw Error('Function 返回结果超过 20000 字符，请缩小输入范围。')
 return {kind:'function_result',functionId:f.id,version:f.version,value}
}
function aipExposureConfig(){
 if(activeAssistant())return activeAssistant().config
 if(!S.aipConfig)S.aipConfig={types:null,retrieval:{type:'',limit:3}}
 if(S.aipConfig.types===null&&Object.keys(C().objectTypes).length){
  S.aipConfig.types=Object.fromEntries(Object.values(C().objectTypes).map(ot=>[ot.id,{
   enabled:true,properties:readableProperties(ot).map(p=>p.id),
   links:linksOf(ot.id,C()).map(l=>l.id+':'+sideOf(l,ot.id))
  }]))
 }
 return S.aipConfig
}
function aipReadScope(){
 const read=ontologyReadScope(),config=aipExposureConfig(),types={}
 for(const ot of Object.values(read.types)){
  const policy=config.types?.[ot.id]
  if(!policy?.enabled)continue
  types[ot.id]={...ot,properties:ot.properties.filter(p=>p.visibility!=='hidden'&&(p.id===ot.primaryKey||policy.properties.includes(p.id)))}
 }
 return {...read,types,exposure:config.types||{},objects:id=>types[id]?read.objects(id):[]}
}
function aipRetrievalContext(read){
 const config=aipExposureConfig().retrieval,ot=read.types[config.type]
 if(!ot)return null
 const limit=Math.max(1,Math.min(5,Number(config.limit)||3)),rows=read.objects(ot.id)
 const fields=readableProperties(ot).slice(0,8)
 return {mode:'fixed',objectType:ot.apiName,total:rows.length,limit,
  properties:fields.map(p=>p.apiName),objects:rows.slice(0,limit).map(obj=>Object.fromEntries(fields.map(p=>[p.apiName,String(obj[p.id]??'').slice(0,120)]))),
  truncated:rows.length>limit}
}
function renderAipExposure(){
 if(activeAssistant())return '<section class="card"><div class="spread"><div><h2>'+esc(activeAssistant().name)+'</h2><p>'+esc(activeAssistant().description)+'</p><small>Published v'+S.aipAgents[S.activeAgent].version+' · '+aipCatalog(aipReadScope()).length+' 个类型 · '+aipActionCatalog(aipReadScope()).length+' 个 Action</small></div>'+B('editAssistant','编辑助手配置','',S.activeAgent)+'</div></section>'
 const config=aipExposureConfig(),read=aipReadScope(),catalog=aipCatalog(read),busy=aipState().busy,disabled=busy?'disabled':''
 const types=Object.values(C().objectTypes)
 const actionChoices=Object.values(C().actionTypes).filter(at=>at.objectType||at.rules.some(r=>r.type==='function'||IFACE_RULES.includes(r.type)||INTERFACE_LINK_RULES.includes(r.type))).map(at=>'<label class="chk aip-scope-choice"><input type="checkbox" data-aip-action="'+esc(at.id)+'" '+(aipAgentPolicy(at).enabled?'checked ':'')+disabled+'><strong>'+esc(at.name)+'</strong> <code>'+esc(at.apiName)+'</code> · '+esc(actionTarget(at))+'</label>').join('')
 const choice=(label,ot,kind,id,checked,locked=false)=>'<label class="chk aip-scope-choice"><input type="checkbox" data-aip-scope="'+kind+'" data-type="'+esc(ot.id)+'" data-value="'+esc(id)+'" '+(checked?'checked ':'')+(busy||locked?'disabled ':'')+'>'+label+'</label>'
 const cards=types.map(ot=>{
  const policy=config.types?.[ot.id]||{enabled:false,properties:[],links:[]}
  const fields=readableProperties(ot).map(p=>choice(esc(p.name)+' <code>'+esc(p.apiName)+'</code>'+(p.id===ot.primaryKey?' · 主键':''),ot,'property',p.id,policy.properties.includes(p.id)||p.id===ot.primaryKey,p.id===ot.primaryKey||!policy.enabled)).join('')
  const links=linksOf(ot.id,C()).map(l=>{const from=sideOf(l,ot.id),end=l[other(from)],target=C().objectTypes[end.objectType],allowed=!!read.types[end.objectType]
   return choice('<code>'+esc(end.apiName)+'</code> → '+esc(target?.name||end.objectType)+(allowed?'':'（目标类型未开放）'),ot,'link',l.id+':'+from,policy.links.includes(l.id+':'+from),!policy.enabled||!allowed)
  }).join('')
  return '<section class="aip-scope-type">'+choice('<strong>'+esc(ot.name)+'</strong> <code>'+esc(ot.apiName)+'</code>',ot,'type','',policy.enabled)+
   '<details data-aip-type-details="'+esc(ot.id)+'" '+(S.ui.aipOpenTypes?.includes(ot.id)?'open':'')+'><summary>属性与方向 Link</summary><div class="aip-scope-fields">'+fields+'</div><h4>可遍历的 Link</h4>'+ (links||'<p class="muted">没有关联关系</p>')+'</details></section>'
 }).join('')
 const options='<option value="">关闭：不预先发送对象记录</option>'+Object.values(read.types).map(ot=>'<option value="'+esc(ot.id)+'" '+(config.retrieval.type===ot.id?'selected':'')+'>'+esc(ot.name)+'</option>').join('')
 return '<section class="card aip-exposure"><div class="spread"><div><h2>AI 可访问的业务范围</h2><p class="muted">已开放 '+catalog.length+' 个 Object Type · '+catalog.reduce((n,t)=>n+t.links.length,0)+' 个方向 Link · 预先检索'+(aipRetrievalContext(read)?'已开启':'已关闭')+'</p></div>'+B('aipToggleConfig',S.ui.aipConfigOpen?'收起配置':'配置范围','','','aria-expanded="'+!!S.ui.aipConfigOpen+'"')+'</div>'+
  (S.ui.aipConfigOpen?'<div class="aip-scope-grid">'+(cards||'<p>请先创建并保存 Object Type。</p>')+'</div><h3>向助手开放的 Action</h3><p class="muted">已勾选的 Action 还需满足对象范围与当前角色条件，才进入搜索目录。首轮只发送数量，AI 按需搜索并读取定义。</p><div class="aip-scope-grid">'+actionChoices+'</div><div class="aip-retrieval"><h3>Retrieval context（可选）</h3><p class="muted">每次提问前，把选定类型的前 N 条记录作为上下文发送。仅包含已开放属性的前 8 项；需要准确查找时使用查询工具。</p><div class="row"><label class="fld"><span>预先提供的对象类型</span><select id="aipRetrievalType" '+disabled+'>'+options+'</select></label><label class="fld"><span>最多记录数（1–5）</span><input id="aipRetrievalLimit" type="number" min="1" max="5" value="'+config.retrieval.limit+'" '+disabled+'></label></div></div><p class="small-t muted">首次采用已保存的类型；新建类型需手动开放。主键用于引用对象。更改范围会清空当前对话，避免继续携带旧数据。此处是本地模拟器的模型数据范围配置，不替代服务端身份认证。</p>':'')+'</section>'
}
function renderAipModelContext(turn){
 const read=aipReadScope(),catalog=aipCatalog(read)
 const initial=turn?.modelContext||{workspace:WORKSPACE.name,typeCount:catalog.length,
  agent:activeAssistant()?{name:activeAssistant().name,instructions:activeAssistant().instructions,version:S.aipAgents[S.activeAgent].version}:null,
  toolGuidance:aipToolGuidance(),functions:aipFunctionCatalog(read),
  types:catalog.slice(0,12).map(({apiName,name,description})=>({apiName,name,description})),
  retrievalContext:aipRetrievalContext(read),note:'这是发送前的业务上下文预览。完整字段与 Link 定义将在模型请求时提供。'}
 const calls=turn?.calls||[]
 return '<details class="aip-context" '+(S.ui.aipContextOpen?'open':'')+'><summary>'+ (turn?.modelContext?'查看实际发送给 AI 的信息 · '+calls.length+' 次工具调用':'AI 上下文预览（尚未收到服务端调用记录）')+'</summary><p class="muted">类型摘要用于选择入口；对象记录仅来自预先检索或工具返回。以下展示业务上下文，不包含服务端系统指令。</p><h4>初始上下文</h4><pre>'+esc(JSON.stringify(initial,null,2))+'</pre>'+
  (turn?.toolDefinitions?'<details><summary>可用工具与参数定义</summary><pre>'+esc(JSON.stringify(turn.toolDefinitions,null,2))+'</pre></details>':'')+
  calls.map((call,i)=>'<details><summary>第 '+(i+1)+' 步 · '+esc(call.tool)+'</summary><h4>调用参数</h4><pre>'+esc(JSON.stringify(call.arguments,null,2))+'</pre><h4>返回给模型</h4><pre>'+esc(JSON.stringify(call.result,null,2))+'</pre></details>').join('')+'</details>'
}
function installAipExposure(){
 Object.assign(ACT,{aipToggleConfig(){S.ui.aipConfigOpen=!S.ui.aipConfigOpen}})
 document.addEventListener('toggle',e=>{
  if(e.target.classList?.contains('aip-context'))S.ui.aipContextOpen=e.target.open
  const type=e.target.dataset?.aipTypeDetails
  if(type&&e.target.isConnected){const opened=S.ui.aipOpenTypes||[];S.ui.aipOpenTypes=e.target.open?[...new Set([...opened,type])]:opened.filter(id=>id!==type)}
 },true)
 document.addEventListener('change',e=>{
  const input=e.target,scope=input.dataset.aipScope
  if(!scope&&!input.dataset.aipAction&&!['aipRetrievalType','aipRetrievalLimit'].includes(input.id))return
  if(aipState().busy){render();return}
  const config=aipExposureConfig()
  if(input.dataset.aipAction){
   config.actions??={};config.actions[input.dataset.aipAction]=input.checked
  }else if(scope){
   const ot=C().objectTypes[input.dataset.type];if(!ot)return
   config.types??={}
   const policy=config.types[ot.id]??={enabled:false,properties:readableProperties(ot).map(p=>p.id),links:linksOf(ot.id,C()).map(l=>l.id+':'+sideOf(l,ot.id))}
   if(scope==='type')policy.enabled=input.checked
   else{const key=scope==='property'?'properties':'links',id=input.dataset.value;policy[key]=input.checked?[...new Set([...policy[key],id])]:policy[key].filter(x=>x!==id)}
  }else if(input.id==='aipRetrievalType')config.retrieval.type=input.value
  else config.retrieval.limit=Math.max(1,Math.min(5,Number(input.value)||3))
  if(!aipReadScope().types[config.retrieval.type])config.retrieval.type=''
  S.ui.aip=null
  render()
 })
}
