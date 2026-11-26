/* Authoring resources are user-created. This workspace supplies records only. */
AGENT_WORKSPACES.builder={name:'从零创建 · 租约业务',actions:{},views:[],examples:[],links:[],actionTypes:[],types:[
 {id:'tenant',apiName:'Tenant',name:'租客',icon:'👤',properties:[['id','租客编号','String'],['name','姓名','String']],rows:[['T101','张三'],['T102','李四']]},
 {id:'house',apiName:'House',name:'房屋',icon:'⌂',properties:[['id','房屋编号','String'],['name','房屋名称','String'],['address','地址','String']],rows:[['H101','朝阳一居','朝阳路 18 号'],['H102','海淀两居','学院路 26 号']]},
 {id:'lease',apiName:'Lease',name:'租约',icon:'▤',title:'id',properties:[['id','租约编号','String'],['tenant_id','租客编号','String'],['house_id','房屋编号','String'],['monthly_rent','月租金','Double'],['status','状态','String']],rows:[['L101','T101','H101','6500','有效'],['L102','T102','H102','7200','已结束']]}
]}

function assistantErrors(d){
 const errors=[]
 if(!d.name?.trim())errors.push('填写助手名称。')
 if(!d.instructions?.trim())errors.push('填写 Instructions，说明助手的业务职责。')
 if(!PROJECTS.includes(d.location))errors.push('选择 Save location。')
 if(d.instructions?.length>4000)errors.push('Instructions 不能超过 4000 字符。')
 const config=d.config
 if((config.queryDescription||'').length>4000)errors.push('Object query 的 Tool description 不能超过 4000 字符。')
 for(const p of config.functions||[]){
  if(!p.enabled)continue
  const m=assistantFunctionMeta(p)
  if(!m){errors.push('Function 或版本已不存在：'+p.id);continue}
  if(m.kind==='edit'||m.async)errors.push(p.id+' 不能作为只读 Function 工具。编辑函数请通过 Action 使用。')
  if((p.description||'').length>4000)errors.push(p.id+' 的 Tool description 不能超过 4000 字符。')
  for(const i of m.inputs){const t=fnParamType(i.type,C());if(!t||(t.objectType&&!config.types[t.objectType]?.enabled))errors.push(p.id+' 的参数类型不可用或未开放：'+i.name)}
 }
 if(!Object.values(config.types).some(t=>t.enabled))errors.push('至少开放一个 Object Type。')
 for(const [id,p] of Object.entries(config.types)){
  if(!p.enabled)continue
  const ot=C().objectTypes[id]
  if(!ot){errors.push('Object Type 已被删除：'+id);continue}
  if(p.properties.some(key=>!propOf(ot,key)))errors.push(ot.name+' 有失效的属性配置。')
  for(const key of p.links){
   const [lid,side]=key.split(':'),link=C().linkTypes[lid]
   if(!link||link[side]?.objectType!==id||!config.types[link[other(side)]?.objectType]?.enabled)errors.push(ot.name+' 的 Link 端点未开放或已失效：'+key)
  }
 }
 for(const [id,enabled] of Object.entries(config.actions)){
  if(!enabled)continue
  const at=C().actionTypes[id]
  if(!at){errors.push('Action 已被删除：'+id);continue}
  if((config.toolDescriptions?.[id]||'').length>4000)errors.push(at.name+' 的 Tool description 不能超过 4000 字符。')
  errors.push(...aipActionScopeErrors(at,config))
 }
 return [...new Set(errors)]
}
function saveAssistantDraft(){
 const d=S.ui.agentDraft
 if(!d?.name.trim())throw Error('请填写助手名称。')
 S.aipAgents??={}
 const id=d.id||'assistant-'+crypto.randomUUID()
 S.aipAgents[id]={...S.aipAgents[id],id,draft:clone({...d,id})}
 d.id=id
 return S.aipAgents[id]
}
function publishAssistant(){
 const errors=assistantErrors(S.ui.agentDraft)
 if(errors.length)throw Error(errors.join(' '))
 const agent=saveAssistantDraft()
 agent.published=clone(agent.draft);agent.version=(agent.version||0)+1
 agent.publishedAt=new Date().toISOString()
 if(S.activeAgent===agent.id)S.ui.aip=null
 return agent
}
function pageAssistantBuilder(){
 const d=S.ui.agentDraft
 const agents=Object.values(S.aipAgents||{})
 const list='<div class="grid2">'+agents.map(a=>'<section class="card"><h3>'+esc(a.draft.name)+'</h3><p>'+esc(a.draft.description)+'</p><p>'+badge(a.published?'Published v'+a.version:'Draft')+'</p><div class="row">'+B('editAssistant','编辑','',a.id)+B('useAssistant','打开已发布助手','primary',a.id,a.published?'':'disabled')+'</div></section>').join('')+'</div>'
 if(!d)return head('AIP Chatbot Studio','创建助手，选择它能查询的对象与可执行的 Action。',B('newAssistant','＋ New AIP Chatbot','primary'))+(agents.length?list:'<section class="card"><h2>尚未创建助手</h2><p>这里不会自动加载租约 Action 或查询模板。先创建并保存 Link 和 Action，再创建助手。</p></section>')
 const P='ui.agentDraft.',cfg=d.config
 const selected=S.ui.agentTool||''
 const guidance=(bind,value,fallback,placeholder)=>{
  const id='help-'+bind.replace(/[^\w-]/g,'-'),tooLong=(value||'').length>4000
  return fArea(bind,'Tool description · 给 AI 的工具使用说明',value||'','rows="5" aria-describedby="'+id+'" aria-invalid="'+tooLong+'" placeholder="'+esc(placeholder)+'"')+
   '<p id="'+id+'" class="small-t '+(tooLong?'note bad':'muted')+'">'+(tooLong?'超过 4000 字符，请缩短后发布。':'最多 4000 字符，仅用于当前助手，发布后生效。'+fallback)+'</p>'+
   '<details><summary>预览业务说明</summary><p style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(value?.trim()||fallback)+'</p></details>'
 }
 const check=(kind,id,label,on)=>'<label class="chk"><input type="checkbox" data-builder-kind="'+kind+'" data-builder-id="'+esc(id)+'" '+(on?'checked':'')+'>'+label+'</label>'
 const types=selected==='query'?Object.values(C().objectTypes).map(ot=>{
  const p=cfg.types[ot.id]||{enabled:false,properties:[],links:[]}
  return '<section class="card">'+check('type',ot.id,'<b>'+esc(ot.name)+'</b> <code>'+esc(ot.apiName)+'</code>',p.enabled)+(p.enabled?'<details open><summary>Properties & Links</summary><div class="aip-scope-fields">'+readableProperties(ot).map(x=>check('property',ot.id+'|'+x.id,esc(x.name)+(x.id===ot.primaryKey?'（主键，始终提供）':''),p.properties.includes(x.id)||x.id===ot.primaryKey)).join('')+'</div>'+linksOf(ot.id,C()).map(l=>{const side=sideOf(l,ot.id);return check('link',ot.id+'|'+l.id+':'+side,esc(ot.name+' → '+C().objectTypes[l[other(side)].objectType]?.name)+' <code>'+esc(l[other(side)].apiName)+'</code>',p.links.includes(l.id+':'+side))}).join('')+'</details>':'')+'</section>'
 }).join(''):''
 const functions=Object.values(fnRegistry()).filter(f=>'function|'+f.id===selected).map(f=>{
  const index=(cfg.functions||[]).findIndex(p=>p.id===f.id),p=cfg.functions?.[index],m=p?assistantFunctionMeta(p):f.latest.meta,base=P+'config.functions.'+index+'.'
  return '<section class="card">'+check('function',f.id,'<b>'+esc(f.id)+'</b>',p?.enabled)+
   (p?.enabled?fSel(base+'version','Function version',[['','Latest · 最新发布版本'],...f.versions.map(v=>[v.version,v.version])],p.version||'')+
    '<p class="muted">输入：'+esc(m?.inputs.map(i=>i.name+': '+i.type).join('，')||'无')+' · 返回：'+esc(m?.output||'版本不可用')+'</p>'+
    guidance(base+'description',p.description,'留空沿用 Function 自身说明；没有说明时只提供签名。','说明解决什么业务问题、参数如何取得、返回值的含义和使用条件。'):'')+'</section>'
 }).join('')
 const actions=Object.values(C().actionTypes).filter(at=>'action|'+at.id===selected).map(at=>{
  const enabled=!!cfg.actions[at.id],description=cfg.toolDescriptions?.[at.id]||'',tooLong=description.length>4000
  return '<section class="card">'+check('action',at.id,'<b>'+esc(at.name)+'</b> <code>'+esc(at.apiName)+'</code>',enabled)+
   '<p class="muted">Action Description：'+esc(at.description||'尚未填写')+'</p>'+
   (enabled?'<label class="fld"><span>Tool description · 给 AI 的工具使用说明</span><textarea data-bind="'+esc(P+'config.toolDescriptions.'+at.id)+'" rows="6" aria-describedby="tool-help-'+esc(at.id)+'" aria-invalid="'+tooLong+'" placeholder="说明何时调用、调用前查什么、参数如何获取，以及执行后的核验步骤。">'+esc(description)+'</textarea></label><p id="tool-help-'+esc(at.id)+'" class="small-t '+(tooLong?'note bad':'muted')+'">'+(tooLong?'超过 4000 字符，请缩短后发布。':'最多 4000 字符。仅用于当前助手；留空时使用上方 Action Description。发布后生效。')+'</p><details><summary>预览提供给 AI 的说明</summary><p style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(assistantToolDescription(at,cfg)||'暂无工具说明，请补充何时使用此 Action。')+'</p></details>':'')+
   '<p class="small-t muted">执行方式：用户确认后提交 · Action v'+at.version+'</p></section>'
 }).join('')
 const actionResources=Object.values(C().actionTypes)
 const functionResources=Object.values(fnRegistry()).filter(f=>f.kind!=='edit'&&!f.latest.meta.async)
 const tools=[
  ...(selected==='query'||Object.values(cfg.types).some(p=>p.enabled)?[['query','Object query']]:[]),
  ...actionResources.filter(at=>cfg.actions[at.id]).map(at=>['action|'+at.id,at.name]),
  ...functionResources.filter(f=>cfg.functions?.some(p=>p.id===f.id&&p.enabled)).map(f=>['function|'+f.id,f.id])
 ]
 const toolButton=([key,label])=>B('selectAssistantTool',esc(label),selected===key?'primary':'',key,'aria-pressed="'+(selected===key)+'"')
 const toolList=tools.length?'<div class="row" style="flex-wrap:wrap">'+tools.map(toolButton).join('')+'</div>':'<p class="muted">还没有配置工具。</p>'
 const available=[
  ...(!tools.some(([key])=>key==='query')?[['query','Object query']]:[]),
  ...actionResources.filter(at=>!cfg.actions[at.id]).map(at=>['action|'+at.id,'Action · '+at.name]),
  ...functionResources.filter(f=>!cfg.functions?.some(p=>p.id===f.id&&p.enabled)).map(f=>['function|'+f.id,'Function · '+f.id])
 ]
 const addMenu=S.ui.agentToolMenu?'<div class="card"><h3>选择工具</h3><div class="row" style="flex-wrap:wrap">'+available.map(([key,name])=>B('addAssistantTool',esc(name),'',key)).join('')+'</div>'+(available.length?'':'<p>当前可用工具已全部添加。</p>')+'</div>':''
 const detail=selected==='query'?'<section class="card"><h3>配置 Object query</h3>'+guidance(P+'config.queryDescription',cfg.queryDescription,'留空使用默认查询说明。','例如：先定位房屋，再沿房屋 → 房东查询。')+'</section><div class="grid2">'+types+'</div>':actions||functions
 const errors=S.ui.agentValidation?assistantErrors(d):[]
 return head(d.id?'编辑 AIP Chatbot':'创建 AIP Chatbot','草稿与已发布版本分开保存；发布后才用于对话。',B('leaveAssistant','返回列表')+B('saveAssistant','Save draft')+B('publishAssistant','Publish','primary'))+
 (errors.length?'<section class="note bad" role="alert"><b>还不能发布，请补充以下配置：</b><ul>'+errors.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul></section>':'')+
 (diff().length?'<section class="note warn"><p>Ontology 还有 '+diff().length+' 项未保存的更改。下方只列出已保存的资源。</p>'+B('openReview','检查并保存 Ontology')+'</section>':'')+
 '<section class="card"><div class="grid2">'+fInp(P+'name','Name',d.name)+fSel(P+'location','Save location',projOpts,d.location)+'</div>'+fArea(P+'description','Description',d.description)+fArea(P+'instructions','Instructions',d.instructions)+'<p class="muted">Model：'+esc(aipConnection?.model||'服务端已配置的模型')+'（由本地服务配置）</p></section>'+
 '<section class="card"><div class="spread"><h2>Tools</h2>'+B('toggleAssistantTools','＋ Add tool','','','aria-expanded="'+!!S.ui.agentToolMenu+'"')+'</div>'+toolList+addMenu+'</section>'+detail+
 '<section class="card"><h2>Retrieval context（可选）</h2>'+fSel(P+'config.retrieval.type','每次对话预先提供的对象',[['','不预先提供记录'],...Object.values(C().objectTypes).filter(o=>cfg.types[o.id]?.enabled).map(o=>[o.id,o.name])],cfg.retrieval.type)+fSel(P+'config.retrieval.limit','记录上限',[1,2,3,4,5].map(x=>[String(x),String(x)]),cfg.retrieval.limit)+'</section>'
}
function pageBuild(){
 const pending=diff(),published=Object.values(S.aipAgents||{}).filter(a=>a.published).length
 return head('创建业务应用','从已有的租客、房屋和租约记录开始，依次创建 Link、Action 和 AIP 助手。',B('newPractice','新建空白练习工作区'))+
 '<section class="card"><h2>当前进度</h2><p>Link：'+Object.keys(C().linkTypes).length+' 条已保存 · Action：'+Object.keys(C().actionTypes).length+' 个已保存 · 助手：'+published+' 个已发布 · 成功操作：'+S.logs.length+' 次</p>'+
 (pending.length?'<p class="note warn">有 '+pending.length+' 项 Ontology 更改尚未保存，助手暂时看不到。</p>'+B('openReview','检查并保存 '+pending.length+' 项更改','primary'):'<p class="muted">没有待保存的 Ontology 更改。</p>')+
 '<p class="small-t muted">空白练习只提供三类对象和原始记录，不创建 Link、Action 或助手。每个练习单独保存；保留地址即可下次继续，原工作区不受影响。</p></section>'+
 '<div class="grid3">'+[
 ['1 · Link','定义对象之间如何关联',Object.keys(C().linkTypes).length,'newLinkType','创建 Link'],
 ['2 · Action','选择修改对象或建立关系，配置参数和提交条件',Object.keys(C().actionTypes).length,'newActionType','创建 Action'],
 ['3 · AIP','指定 Instructions，选择查询范围和 Action 工具',Object.keys(S.aipAgents||{}).length,'newAssistant','创建 AIP Chatbot']
 ].map(([title,desc,count,act,label])=>'<section class="card"><h2>'+title+'</h2><p>'+desc+'</p><p>已保存 '+count+' 项</p>'+B(act,label,'primary')+'</section>').join('')+'</div>'+buildGuide()+
 '<section class="card"><h2>数据与执行结果</h2><p>创建 Link 和 Action 后，点击顶部 Save 保存到 Ontology。助手单独通过 Publish 发布。</p><div class="row"><a class="btn" href="#/explorer">查看对象记录</a><a class="btn" href="#/aip-agents">打开助手列表</a><a class="btn" href="#/action-log">查看 Action Log</a></div></section>'
}
function buildGuide(){
 if(WORKSPACE_ID!=='builder')return ''
 return '<section class="card"><h2>第一次上手：查询张三的房屋，再调整月租</h2><p>下面列出本工作区能直接填写的值；所有资源仍由你点击创建。</p>'+[
 ['① 创建两条 Link','选择 Object type foreign keys。第一条：外键侧「租约」、Foreign key property「租客编号 tenant_id」、主键侧「租客」；方向 API Name 为 tenant 和 leases。第二条：外键侧「租约」、house_id、主键侧「房屋」；方向 API Name 为 house 和 leases。两条都点击 Submit，最后点击顶部 Save → Review edits → Save。映射预览各应显示 2 对。'],
 ['② 创建调整租金的 Action','Object → 选择「租约」→ Modify object(s)。Mapping 中移除默认的 tenant_id，添加 monthly_rent（月租金）；可选值填写 6600, 6800, 7000。Metadata 中 Name 填「调整有效租约月租」，API Name 填 adjustActiveLeaseRent。Submission criteria 中 Property 选 status，必须等于「有效」，提示填「只有有效租约可以调租」。Create 后，再点击顶部 Save 保存。'],
 ['③ 创建并发布助手','填写 Name 和 Instructions，例如「查询租客、租约和房屋；先核对租约，再准备调租 Action，确认提交后回查金额」。勾选 Tenant、Lease、House；勾选租客 → 租约的 leases 和租约 → 房屋的 house，再勾选刚创建的 Action。Retrieval context 可以留空。点击 Publish，然后「打开已发布助手」。'],
 ['④ 提问、提交、核验','先问「从张三沿租约查询房屋叫什么」。再问「把 L101 租约月租改为 6800」。点击「打开确认表单」→「试运行」，应看到 6500 → 6800；点击「确认提交」。最后问「重新读取 L101 的月租金」，应返回 6800。Action Log 应增加一条。也可将表单租约改选 L102，验证已结束的租约会被拒绝。']
 ].map(([title,text])=>'<details style="margin:12px 0"><summary><strong>'+title+'</strong></summary><p style="line-height:1.8">'+esc(text)+'</p></details>').join('')+'</section>'
}
function linkDraftPreview(d){
 const onto=W(),a=onto.objectTypes[d.mode==='fk'?d.fkOt:d.left],b=onto.objectTypes[d.mode==='fk'?d.pkOt:d.right]
 if(!a||!b||d.mode==='back')return ''
 const left=objectsOf(a.id,onto),right=objectsOf(b.id,onto),pairs=[]
 let unmatched=0
 if(d.mode==='fk')for(const row of left){const target=right.find(x=>String(x[b.primaryKey])===String(row[d.fkProp]));if(target)pairs.push([row[a.primaryKey],target[b.primaryKey]]);else if(row[d.fkProp])unmatched++}
 if(d.mode==='join'){
  const ds=S.datasets[d.dataset]
  if(ds)for(const row of ds.rows){const av=row[ds.fields.indexOf(d.lc)],bv=row[ds.fields.indexOf(d.rc)];if(left.some(x=>String(x[a.primaryKey])===String(av))&&right.some(x=>String(x[b.primaryKey])===String(bv)))pairs.push([av,bv]);else unmatched++}
 }
 return '<section class="card" style="margin-top:12px"><h4>映射结果预览</h4><p>匹配 '+pairs.length+' 对 · 未匹配 '+unmatched+' 条'+(unmatched?'（这些记录目前不会形成关联）':'')+'</p>'+table([esc(a.name+' Primary key'),esc(b.name+' Primary key')],pairs.slice(0,5).map(r=>r.map(esc)),'当前没有匹配的对象；可以稍后通过 Action 建立关联。')+'</section>'
}
function installAuthoring(){
 Object.assign(ACT,{
  newPractice(){persist();location.assign('?workspace=builder&practice='+crypto.randomUUID()+'#/build')},
  selectAssistantTool(key){S.ui.agentTool=key},
  toggleAssistantTools(){S.ui.agentToolMenu=!S.ui.agentToolMenu},
  addAssistantTool(key){
   const cfg=S.ui.agentDraft.config,[kind,id]=key.split('|')
   if(kind==='action')cfg.actions[id]=true
   if(kind==='function'){
    cfg.functions??=[]
    const existing=cfg.functions.find(p=>p.id===id)
    if(existing)existing.enabled=true
    else cfg.functions.push({id,enabled:true,version:'',description:''})
   }
   S.ui.agentTool=key;S.ui.agentToolMenu=false
  },
  newAssistant(){S.ui.agentTool='';S.ui.agentToolMenu=false;S.ui.newMenu=false;S.ui.agentValidation=false;S.ui.agentDraft={name:'',description:'',instructions:'',location:PROJECTS[0],config:{types:{},actions:{},retrieval:{type:'',limit:3}}};go('aip-agents')},
  editAssistant(id){S.ui.agentTool='';S.ui.agentToolMenu=false;S.ui.agentValidation=false;S.ui.agentDraft=clone(S.aipAgents[id].draft);go('aip-agents')},
  leaveAssistant(){S.ui.agentDraft=null},
  saveAssistant(){saveAssistantDraft();toast('助手草稿已保存；已发布版本未改变。')},
  publishAssistant(){S.ui.agentValidation=true;const a=publishAssistant();toast('已发布 '+a.draft.name+' v'+a.version);S.ui.agentDraft=null;S.ui.agentValidation=false},
  useAssistant(id){if(!S.aipAgents[id]?.published)throw Error('助手尚未发布。');S.activeAgent=id;S.ui.aip=null;go('aip')}
 })
 document.addEventListener('change',e=>{
  const kind=e.target.dataset?.builderKind;if(!kind)return
  const cfg=S.ui.agentDraft.config,key=e.target.dataset.builderId,on=e.target.checked
  if(kind==='action')cfg.actions[key]=on
  else if(kind==='function'){cfg.functions??=[];let p=cfg.functions.find(p=>p.id===key);if(!p){p={id:key,enabled:false,version:'',description:''};cfg.functions.push(p)}p.enabled=on}
  else if(kind==='type'){
   const ot=C().objectTypes[key];cfg.types[key]??={enabled:false,properties:readableProperties(ot).map(p=>p.id),links:[]};cfg.types[key].enabled=on
   if(!on){for(const p of Object.values(cfg.types))p.links=p.links.filter(k=>{const [id,side]=k.split(':');return C().linkTypes[id]?.[other(side)].objectType!==key});if(cfg.retrieval.type===key)cfg.retrieval.type=''}
  }else{const [id,value]=key.split('|'),field=kind==='link'?'links':'properties',p=cfg.types[id];if(field==='properties'&&value===C().objectTypes[id].primaryKey){render();return}p[field]=on?[...new Set([...p[field],value])]:p[field].filter(x=>x!==value)}
  render()
 })
 const link=WIZ.linkType,linkRender=link.render,linkNext=link.next
 link.render=(d,s)=>linkRender(d,s)+(s===1?linkDraftPreview(d):'')
 link.next=(d,s)=>{linkNext(d,s);if(s===1&&d.mode==='join'){const ds=S.datasets[d.dataset];if(!ds.fields.includes(d.lc)||!ds.fields.includes(d.rc))throw Error('Join table 映射列不存在。');for(const [id,col] of [[d.left,d.lc],[d.right,d.rc]]){const type=pkProp(W().objectTypes[id]).baseType;for(const row of ds.rows)if(row[ds.fields.indexOf(col)]!==''&&!typeOk(type,row[ds.fields.indexOf(col)]))throw Error('Join table 的 '+col+' 与 '+type+' 主键类型不兼容。')}}}
 const action=WIZ.actionType,actionRender=action.render,actionNext=action.next,actionFinish=action.finish
 action.render=(d,s)=>{
  let html=actionRender(d,s)
  if(s===1&&d.target==='object')for(const [i,m] of d.mappings.entries())if(m.source==='param')html+='<div class="side-card">'+fInp('ui.wiz.d.mappings.'+i+'.choices',propOf(W().objectTypes[d.objectType],m.prop)?.name+' · 可选值（留空为自由输入）',m.choices||'')+'</div>'
  if(s===3&&d.target==='object'&&d.rule!=='create')html+='<section class="card"><h4>对象状态条件（可选）</h4><p>提交时读取所选对象的属性；不满足条件就拒绝修改。</p>'+fSel('ui.wiz.d.conditionProperty','Property',[['','不限制'],...W().objectTypes[d.objectType].properties.map(p=>[p.id,p.name])],d.conditionProperty||'')+fInp('ui.wiz.d.conditionValue','必须等于',d.conditionValue||'')+fInp('ui.wiz.d.conditionMessage','拒绝时提示',d.conditionMessage||'')+'</section>'
  if(s===4)html+='<section class="card"><h4>创建内容</h4><p>'+esc(d.name)+' · <code>'+esc(d.apiName)+'</code></p><p>执行规则：'+esc(d.target==='link'?d.linkRule:d.rule)+' · '+esc(d.target==='link'?joinLabel(W().linkTypes[d.linkType]):otName(d.objectType))+'</p><p>用户组：'+esc(d.groups.join(', '))+'</p><p>参数：'+esc(d.target==='link'?'自动生成 A、B 两端对象引用':d.mappings.filter(m=>m.source==='param').map(m=>m.prop+(m.choices?' ['+m.choices+']':'')).join(', '))+'</p></section>'
  return html
 }
 action.next=(d,s)=>{actionNext(d,s);
  if(s===1&&d.target==='object')for(const m of d.mappings)if(m.source==='param'&&m.choices?.trim()){
   const type=propOf(W().objectTypes[d.objectType],m.prop)?.baseType
   if(splitList(m.choices).some(v=>!typeOk(type,v)))throw Error(m.prop+' 的可选值与 '+type+' 类型不兼容。')
  }
  if(s===3&&d.conditionProperty){if(!d.conditionValue?.trim())throw Error('填写对象状态条件的比较值。');const p=propOf(W().objectTypes[d.objectType],d.conditionProperty);if(!p||!typeOk(p.baseType,d.conditionValue))throw Error('条件值与属性类型不兼容。')}
 }
 action.finish=d=>{const path=actionFinish(d),at=W().actionTypes[path.split('/')[1]];if(d.target==='object'){
  for(const m of d.mappings)if(m.source==='param'&&m.choices?.trim()){const mapping=at.rules[0].mappings.find(x=>x.prop===m.prop),p=at.parameters.find(p=>p.id===mapping.value);p.constraint='choice';p.options=m.choices.trim()}
  if(d.conditionProperty)at.criteria.push({kind:'param',left:at.rules[0].objectParam+'.'+d.conditionProperty,op:'is',rightKind:'value',right:d.conditionValue,message:d.conditionMessage||'所选对象不满足提交条件。'})
 }return path}
}
