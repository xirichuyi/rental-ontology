import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {webcrypto} from 'node:crypto'
import vm from 'node:vm'
import {actionDiscoveryResult,modelInput,toolsFor,validateFunctionCall} from '../aip-tools.mjs'
function workspace({search='?workspace=builder',storage=new Map()}={}){
 const c=vm.createContext({console,performance,crypto:webcrypto,structuredClone,URLSearchParams,URL,Date,setTimeout,clearTimeout,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},location:{search,hash:'',protocol:'http:'},document:{addEventListener(){},querySelector(){return {addEventListener(){}}}},window:{addEventListener(){}}})
 const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')
 for(const f of ['agent-workspaces.js','aip-builder.js','aip-exposure.js'])vm.runInContext(read(f),c)
 const source=read('index.html').match(/<script>\s*([\s\S]*?)<\/script>/)[1]
 vm.runInContext(source.slice(0,source.indexOf('installAipExposure()')),c)
 const run=s=>vm.runInContext(s,c)
 run('loadConfiguredWorkspace();installAuthoring()')
 return run
}
test('empty authoring workspace: FK definitions enable actual two-hop traversal',()=>{
 const run=workspace()
 assert.equal(run('Object.keys(C().actionTypes).length'),0)
 assert.equal(run('Object.keys(C().linkTypes).length'),0)
 run(`for(const [target,fk,api] of [['tenant','tenant_id','tenant'],['house','house_id','house']]){
 const d=WIZ.linkType.init();d.fkOt='lease';d.pkOt=target;d.fkProp=fk;d.b.apiName=api;d.a.apiName='leases';
 WIZ.linkType.next(d,1);WIZ.linkType.next(d,2);WIZ.linkType.finish(d)
 }S.committed=clone(W());aipExposureConfig()`)
 assert.equal(run(`aipOntologyQuery({objectType:'Tenant',mode:'list',filters:[{property:'name',operator:'eq',value:'张三'}],properties:['name'],related:null,traverse:[{link:'leases',filters:[]},{link:'house',filters:[]}],offset:0,limit:5},'2026-11-26',aipReadScope()).records[0].id`),'H101')
})
test('authored action enforces choice values, object state and role; rejection leaves records and log unchanged',()=>{
 const run=workspace()
 run(`const d=WIZ.actionType.init('lease');d.mappings=[{prop:'monthly_rent',source:'param',choices:'6600, 6800'}];d.name='调整月租';d.apiName='adjustRent';d.conditionProperty='status';d.conditionValue='有效';d.conditionMessage='仅有效租约可调租';WIZ.actionType.next(d,3);const path=WIZ.actionType.finish(d);const id=path.split('/')[1];S.committed=clone(W());const at=C().actionTypes[id];const ref=at.rules[0].objectParam`)
 assert.ok(run(`evaluateAction(at,{[ref]:'L102',monthly_rent:'6800'},C(),{dry:false}).failures.length`)>0)
 assert.ok(run(`evaluateAction(at,{[ref]:'L101',monthly_rent:'9999'},C(),{dry:false}).failures.length`)>0)
 assert.equal(run('S.logs.length'),0)
 assert.equal(run(`findObj('lease','L101',C()).monthly_rent`),'6500')
 assert.equal(run(`evaluateAction(at,{[ref]:'L101',monthly_rent:'6800'},C(),{dry:false}).failures.length`),0)
 assert.equal(run(`findObj('lease','L101',C()).monthly_rent`),'6800')
 assert.equal(run('S.logs.length'),1)
 run(`S.user='viewer'`)
 assert.ok(run(`evaluateAction(at,{[ref]:'L101',monthly_rent:'6600'},C(),{dry:false}).failures.length`)>0)
})
test('assistant publication isolates draft edits and tools; deleted references block publication',()=>{
 const run=workspace()
 run(`S.ui.agentDraft={name:'租约助手',description:'',instructions:'查询租约',location:PROJECTS[0],config:{types:{lease:{enabled:true,properties:['id','monthly_rent','status'],links:[]}},actions:{},retrieval:{type:'',limit:3}}};const agent=publishAssistant();S.activeAgent=agent.id`)
 assert.equal(run('aipCatalog(aipReadScope()).length'),1)
 assert.equal(run('aipActionCatalog(aipReadScope()).length'),0)
 run(`S.ui.agentDraft.instructions='未发布的新指令';S.ui.agentDraft.config.types.lease.enabled=false;saveAssistantDraft()`)
 assert.equal(run('activeAssistant().instructions'),'查询租约')
 assert.equal(run('aipCatalog(aipReadScope()).length'),1)
 assert.throws(()=>run('publishAssistant()'),/至少开放/)
 run(`S.ui.agentDraft.config.types.lease.enabled=true;S.ui.agentDraft.config.actions.missing=true`)
 assert.throws(()=>run('publishAssistant()'),/已被删除/)
})
test('join authoring rejects missing columns and incompatible key values',()=>{
 const run=workspace()
 run(`S.datasets.bad={fields:['left','right'],rows:[['T101','H101']]};const d=WIZ.linkType.init();Object.assign(d,{mode:'join',left:'tenant',right:'house',dataset:'bad',lc:'missing',rc:'right'})`)
 assert.throws(()=>run('WIZ.linkType.next(d,1)'),/映射列不存在/)
 run(`d.lc='left';W().objectTypes.house.properties[0].baseType='Integer'`)
 assert.throws(()=>run('WIZ.linkType.next(d,1)'),/不兼容/)
})
test('join Action creates an actual traversable edge and only enters an assistant with its Link configured',()=>{
 const run=workspace()
 run(`S.datasets.Interest={fields:['tenant_id','house_id'],rows:[]};const l=WIZ.linkType.init();Object.assign(l,{mode:'join',left:'tenant',right:'house',dataset:'Interest',lc:'tenant_id',rc:'house_id',a:{displayName:'意向租客',plural:'意向租客',apiName:'interestedTenants'},b:{displayName:'意向房屋',plural:'意向房屋',apiName:'interestedHouses'}});WIZ.linkType.next(l,1);WIZ.linkType.next(l,2);WIZ.linkType.finish(l);
 const d=WIZ.actionType.init();Object.assign(d,{target:'link',linkType:'tenant-house',linkRule:'createLink',name:'登记意向',apiName:'registerInterest'});const path=WIZ.actionType.finish(d);const id=path.split('/')[1];W().actionTypes[id].version=1;S.committed=clone(W());
 S.ui.agentDraft={name:'意向助手',instructions:'登记意向',location:PROJECTS[0],config:{types:{tenant:{enabled:true,properties:['id','name'],links:['tenant-house:a']},house:{enabled:true,properties:['id','name'],links:[]}},actions:{[id]:true},retrieval:{type:'',limit:3}}};const agent=publishAssistant();S.activeAgent=agent.id;const at=C().actionTypes[id],r=at.rules[0]`)
 assert.equal(run(`aipActionCatalog(aipReadScope())[0].effects[0].link`),'interestedHouses')
 assert.equal(run(`evaluateAction(at,{[r.aParam]:'T101',[r.bParam]:'H102'},C(),{dry:false}).failures.length`),0)
 assert.equal(run(`aipOntologyQuery({objectType:'Tenant',mode:'list',filters:[{property:'id',operator:'eq',value:'T101'}],properties:['name'],traverse:[{link:'interestedHouses',filters:[]}],related:null,offset:0,limit:5},'2026-11-26',aipReadScope()).records[0].id`),'H102')
 assert.ok(run(`evaluateAction(at,{[r.aParam]:'T101',[r.bParam]:'H102'},C(),{dry:false}).failures.length`)>0)
 assert.equal(run('S.logs.length'),1)
 run(`S.ui.agentDraft.config.types.tenant.links=[]`)
 assert.throws(()=>run('publishAssistant()'),/需要开放/)
})
test('Action creation refuses duplicate API names and numeric choices of the wrong type',()=>{
 const run=workspace()
 run(`const d=WIZ.actionType.init('lease');Object.assign(d,{name:'租金',apiName:'changeRent',mappings:[{prop:'monthly_rent',source:'param',choices:'不是数字'}]})`)
 assert.throws(()=>run('WIZ.actionType.next(d,1)'),/不兼容/)
 run(`d.mappings[0].choices='6600';WIZ.actionType.finish(d)`)
 assert.throws(()=>run('WIZ.actionType.next(d,2)'),/已存在/)
})

test('switching an object-property source clears the old field and blocks incomplete mappings',()=>{
 const run=workspace()
 run(`const d=WIZ.actionType.init('house');Object.assign(d,{name:'读取租客姓名',apiName:'copyTenantName',mappings:[{prop:'name',source:'param'}]});const id=WIZ.actionType.finish(d).split('/')[1];const at=W().actionTypes[id];at.parameters.push(mkParam('tenant','租客','Object reference',{objectType:'tenant'}));const m=at.rules[0].mappings[0];m.source='objprop';m.value='tenant.name';const path='working.actionTypes.'+id+'.rules.0.mappings.0.value';`)
 assert.equal(run('validateOnto().errors.length'),0)
 run(`CHANGE.objectPropertyParam({dataset:{path},value:'house'})`)
 assert.equal(run('m.value'),'house.')
 assert.ok(run('validateOnto().errors.some(e=>e.m.includes("未选择"))'))
 run(`setPath(path,'house.name')`)
 assert.equal(run('validateOnto().errors.length'),0)
 assert.equal(run(`paramProp(at,{house:'H101'},m.value,W())`),'朝阳一居')
})
test('practice workspace persists independently and cannot replace the original workspace',()=>{
 const storage=new Map(),original=workspace({storage}),practice=workspace({storage,search:'?workspace=builder&practice=first-try'})
 original(`S.testMarker='original';persist()`)
 practice(`S.testMarker='practice';S.ui.agentDraft={name:'我的助手',instructions:'核对租约',location:PROJECTS[0],config:{types:{lease:{enabled:true,properties:['id'],links:[]}},actions:{},retrieval:{type:'',limit:3}}};publishAssistant();persist()`)
 assert.notEqual(original('STORE_KEY'),practice('STORE_KEY'))
 const resumed=workspace({storage,search:'?workspace=builder&practice=first-try'})
 assert.equal(resumed('restore()'),true)
 assert.equal(resumed('S.testMarker'),'practice')
 assert.equal(resumed('Object.values(S.aipAgents)[0].published.name'),'我的助手')
 const main=workspace({storage})
 assert.equal(main('restore()'),true)
 assert.equal(main('S.testMarker'),'original')
 assert.equal(main('Object.keys(S.aipAgents||{}).length'),0)
})

test('tool descriptions publish independently, reach discovery and survive reload without changing the Action',()=>{
 const storage=new Map(),run=workspace({storage})
 run(`const d=WIZ.actionType.init('lease');Object.assign(d,{name:'调整月租',apiName:'adjustRent',description:'原始 Action 说明',mappings:[{prop:'monthly_rent',source:'param'}]});const id=WIZ.actionType.finish(d).split('/')[1];S.committed=clone(W());
 S.ui.agentDraft={name:'工具说明助手',instructions:'管理租约',location:PROJECTS[0],config:{types:{lease:{enabled:true,properties:['id','monthly_rent','status'],links:[]}},actions:{[id]:true},toolDescriptions:{[id]:'先核对有效租约；用于续租调价，提交后回查月租。'},retrieval:{type:'',limit:3}}};const agent=publishAssistant();S.activeAgent=agent.id`)
 const catalog=JSON.parse(run('JSON.stringify(aipActionCatalog(aipReadScope()))'))
 assert.equal(actionDiscoveryResult('search_actions',{query:'续租调价',objectType:'Lease',offset:0},catalog).total,1)
 assert.equal(actionDiscoveryResult('describe_action',{actionType:'adjustRent'},catalog).action.description,'先核对有效租约；用于续租调价，提交后回查月租。')
 run(`S.ui.agentDraft.config.toolDescriptions[id]='尚未发布的修改';saveAssistantDraft();persist()`)
 assert.equal(run('aipActionCatalog(aipReadScope())[0].description'),catalog[0].description)
 assert.equal(run('C().actionTypes[id].description'),'原始 Action 说明')
 const restored=workspace({storage});assert.equal(restored('restore()'),true)
 assert.equal(restored('aipActionCatalog(aipReadScope())[0].description'),catalog[0].description)
 run('publishAssistant()')
 assert.equal(run('aipActionCatalog(aipReadScope())[0].description'),'尚未发布的修改')
 run(`S.ui.agentDraft.config.toolDescriptions[id]='   ';publishAssistant()`)
 assert.equal(run('aipActionCatalog(aipReadScope())[0].description'),'原始 Action 说明')
 run(`S.ui.agentDraft.config.toolDescriptions[id]='当前助手专属';publishAssistant();S.ui.agentDraft=clone(S.ui.agentDraft);delete S.ui.agentDraft.id;delete S.ui.agentDraft.config.toolDescriptions;S.activeAgent=publishAssistant().id`)
 assert.equal(run('aipActionCatalog(aipReadScope())[0].description'),'原始 Action 说明')
 run(`S.ui.agentDraft.config.actions[id]=false;publishAssistant()`)
 assert.equal(run('aipActionCatalog(aipReadScope()).length'),0)
})

test('oversized tool guidance blocks publication and tool text is escaped in the editor',()=>{
 const run=workspace()
 run(`const d=WIZ.actionType.init('lease');Object.assign(d,{name:'调租',apiName:'adjustRent',mappings:[{prop:'monthly_rent',source:'param'}]});const id=WIZ.actionType.finish(d).split('/')[1];S.committed=clone(W());S.ui.agentDraft={name:'测试',instructions:'管理租约',location:PROJECTS[0],config:{types:{lease:{enabled:true,properties:['id'],links:[]}},actions:{[id]:true},toolDescriptions:{[id]:'x'.repeat(4001)},retrieval:{type:'',limit:3}}}`)
 assert.throws(()=>run('publishAssistant()'),/Tool description 不能超过/)
 run(`S.ui.agentDraft.config.toolDescriptions[id]='</textarea><script>alert(1)</script>'`)
 const html=run("S.ui.agentTool='action|'+id;pageAssistantBuilder()")
 assert.ok(html.includes('&lt;/textarea&gt;&lt;script&gt;'))
 assert.ok(!html.includes('<script>alert(1)</script>'))
})

function functionAssistant(run){
 run(`const meta={id:'Rental.count',cls:'Rental',method:'count',kind:'function',inputs:[{name:'prefix',type:'string',optional:false}],output:'Integer',js:'class Rental { count(prefix) {return Objects.search().house().filter(h=>h.name.phrasePrefix(prefix)).count()} }'};
 S.fnRepo.tags=[{version:'1.0.0',time:new Date().toISOString(),functions:[meta]}];
 S.ui.agentDraft={name:'房屋查询',instructions:'核对房屋',location:PROJECTS[0],config:{types:{house:{enabled:true,properties:['id','name'],links:[]}},actions:{},queryDescription:'先确认房屋名称，重名请用户选择。',functions:[{id:meta.id,enabled:true,version:'1.0.0',description:'统计名称前缀匹配的房屋数量。'}],retrieval:{type:'',limit:3}}};const agent=publishAssistant();S.activeAgent=agent.id`)
}

function interfaceAssistant(run){
 run(`{const d=WIZ.interface.init();Object.assign(d,{name:'可命名对象',apiName:'NamedEntity',properties:[{apiName:'id',name:'编号',baseType:'String',required:true},{apiName:'name',name:'名称',baseType:'String',required:true}]});WIZ.interface.finish(d);}
 for(const ot of ['tenant','house'])WIZ.implement.finish({ot,iface:'NamedEntity',mapping:{id:'id',name:'name'},links:{}});
 const a=WIZ.actionType.init();Object.assign(a,{target:'interface',iface:'NamedEntity',irule:'modifyIface',imaps:[{prop:'name',source:'param'}],name:'修改名称',apiName:'renameEntity'});const id=WIZ.actionType.finish(a).split('/')[1];S.committed=clone(W());const at=C().actionTypes[id],r=at.rules[0];
 S.ui.agentDraft={name:'名称助手',instructions:'按用户要求修改名称',location:PROJECTS[0],config:{types:{tenant:{enabled:true,properties:['id','name'],links:[]}},actions:{[id]:true},retrieval:{type:'',limit:3}}};const agent=publishAssistant();S.activeAgent=agent.id`)
}

test('Interface Action discovers concrete implementations, proposes a typed reference and respects assistant scope',()=>{
 const run=workspace();interfaceAssistant(run)
 const catalog=JSON.parse(run('JSON.stringify(aipActionCatalog(aipReadScope()))'))
 assert.equal(catalog.length,1)
 assert.equal(actionDiscoveryResult('search_actions',{query:'',objectType:'Tenant',offset:0},catalog).total,1)
 assert.equal(actionDiscoveryResult('search_actions',{query:'',objectType:'House',offset:0},catalog).total,0)
 assert.deepEqual(catalog[0].effects[0].implementations.map(i=>i.objectType),['Tenant'])
 assert.equal(run(`aipActionOptions(at,at.parameters.find(p=>p.type==='Interface reference'),aipReadScope()).includes('house:H101')`),false)
 run(`const proposal=aipMakeActionProposal({actionType:'renameEntity',parameters:[{name:r.objectParam,value:'tenant:T101'},{name:r.mappings[0].value,value:'张三测试'}]},'把 T101 改为张三测试',aipReadScope(),{});`)
 assert.equal(run('proposal.vals[r.objectParam]'),'tenant:T101')
 assert.equal(run('evaluateAction(at,proposal.vals,C(),{dry:false}).failures.length'),0)
 assert.equal(run(`findObj('tenant','T101',C()).name`),'张三测试')
 assert.equal(run(`findObj('house','H101',C()).name`),'朝阳一居')
 run(`S.ui.modal={at:id,vals:{[r.objectParam]:'house:H101',[r.mappings[0].value]:'越界修改'},aipTurn:0,aipProposal:{version:at.version,excluded:{}}}`)
 assert.throws(()=>run('runForm(false)'),/不符合当前提交条件/)
 assert.equal(run(`findObj('house','H101',C()).name`),'朝阳一居')
 run(`C().objectTypes.tenant.interfaces[0].disabledActions=[id]`)
 assert.equal(run('aipActionCatalog(aipReadScope()).length'),0)
})

test('Interface create and delete act on the selected concrete type with shared property mappings',()=>{
 const run=workspace();interfaceAssistant(run)
 run(`const d=WIZ.actionType.init();Object.assign(d,{target:'interface',iface:'NamedEntity',irule:'createIface',imaps:[{prop:'id',source:'param'},{prop:'name',source:'param'}],name:'创建命名对象',apiName:'createNamedEntity'});const createId=WIZ.actionType.finish(d).split('/')[1];S.committed=clone(W());const create=C().actionTypes[createId],cr=create.rules[0],vals={[cr.typeParam]:'tenant',...Object.fromEntries(cr.mappings.map(m=>[m.value,m.prop==='id'?'T-INTERFACE':'接口创建租客']))};`)
 assert.equal(run('evaluateAction(create,vals,C(),{dry:false}).failures.length'),0)
 assert.equal(run(`findObj('tenant','T-INTERFACE',C()).name`),'接口创建租客')
 assert.equal(run(`!!findObj('house','T-INTERFACE',C())`),false)
 run(`d.irule='deleteIface';d.imaps=[];d.name='删除命名对象';d.apiName='deleteNamedEntity';const deleteId=WIZ.actionType.finish(d).split('/')[1];S.committed=clone(W());const del=C().actionTypes[deleteId]`)
 assert.equal(run(`evaluateAction(del,{[del.rules[0].objectParam]:'tenant:T-INTERFACE'},C(),{dry:false}).failures.length`),0)
 assert.equal(run(`!!findObj('tenant','T-INTERFACE',C())`),false)
})

test('unbound Function-backed Action is discoverable, executes edits and rejects unpublished scope',()=>{
 const run=workspace()
 const source=`export class RentalEdits {
 @Edits(Tenant)
 @OntologyEditFunction()
 public rename(tenant: Tenant, name: string): void { tenant.name = name; }
 }`
 run(`const compiled=compileRepo(${JSON.stringify(source)},W());if(compiled.errors.length)throw Error(compiled.errors.join(';'));S.fnRepo.tags=[{version:'1.0.0',time:new Date().toISOString(),functions:compiled.functions}];
 const d=WIZ.actionType.init();Object.assign(d,{target:'function',functionId:'RentalEdits.rename',functionVersion:'1.0.0',functionTarget:'',name:'函数修改租客',apiName:'renameTenantFunction'});const id=WIZ.actionType.finish(d).split('/')[1];S.committed=clone(W());const at=C().actionTypes[id];
 S.ui.agentDraft={name:'租客助手',instructions:'按要求改名',location:PROJECTS[0],config:{types:{tenant:{enabled:true,properties:['id','name'],links:[]}},actions:{[id]:true},retrieval:{type:'',limit:3}}};const agent=publishAssistant();S.activeAgent=agent.id;`)
 const catalog=JSON.parse(run('JSON.stringify(aipActionCatalog(aipReadScope()))'))
 assert.equal(catalog.length,1)
 assert.equal(actionDiscoveryResult('search_actions',{query:'',objectType:'Tenant',offset:0},catalog).total,1)
 assert.equal(run(`evaluateAction(at,{tenant:'T101',name:'函数更名'},C(),{dry:false}).failures.length`),0)
 assert.equal(run(`findObj('tenant','T101',C()).name`),'函数更名')
 assert.equal(run('S.logs.length'),1)
 run(`S.fnRepo.tags[0].functions[0].js='class RentalEdits { rename(tenant,name) {tenant.name=name;throw new Error("操作失败")} }'`)
 assert.ok(run(`evaluateAction(at,{tenant:'T101',name:'不得写入'},C(),{dry:false}).failures.length`)>0)
 assert.equal(run(`findObj('tenant','T101',C()).name`),'函数更名')
 assert.equal(run('S.logs.length'),1)
 run(`S.ui.agentDraft.config.types={house:{enabled:true,properties:['id'],links:[]}}`)
 assert.throws(()=>run('publishAssistant()'),/需要开放/)
})

test('Interface Link Action follows the implementation mapping and creates then deletes only that edge',()=>{
 const run=workspace();interfaceAssistant(run)
 run(`S.datasets.Interest={fields:['tenant','house'],rows:[]};const l=WIZ.linkType.init();Object.assign(l,{mode:'join',left:'tenant',right:'house',dataset:'Interest',lc:'tenant',rc:'house',a:{displayName:'租客',plural:'租客',apiName:'tenants'},b:{displayName:'意向房屋',plural:'意向房屋',apiName:'houses'}});WIZ.linkType.finish(l);
 W().interfaces.NamedEntity.linkConstraints=[{apiName:'interests',targetKind:'objectType',target:'house',cardinality:'MANY',required:false}];W().objectTypes.tenant.interfaces[0].links.interests='tenant-house';
 const d=WIZ.actionType.init();Object.assign(d,{target:'interface',iface:'NamedEntity',irule:'createIfaceLink',constraint:'interests',name:'接口登记意向',apiName:'interfaceInterest'});const linkId=WIZ.actionType.finish(d).split('/')[1];S.committed=clone(W());const linkAction=C().actionTypes[linkId],lr=linkAction.rules[0];
 S.ui.agentDraft.config.types.tenant.links=['tenant-house:a'];S.ui.agentDraft.config.types.house={enabled:true,properties:['id','name'],links:[]};S.ui.agentDraft.config.actions[linkId]=true;publishAssistant();const lv={[lr.objectParam]:'tenant:T101',[lr.targetParam]:'H102'};`)
 assert.equal(run(`aipActionCatalog(aipReadScope()).find(a=>a.apiName==='interfaceInterest').effects[0].implementations.length`),1)
 assert.equal(run('evaluateAction(linkAction,lv,C(),{dry:false}).failures.length'),0)
 assert.equal(run(`linkedObjects(C().linkTypes['tenant-house'],'a',findObj('tenant','T101',C()),C())[0].id`),'H102')
 run(`linkAction.rules[0].type='deleteIfaceLink'`)
 assert.equal(run('evaluateAction(linkAction,lv,C(),{dry:false}).failures.length'),0)
 assert.equal(run(`linkedObjects(C().linkTypes['tenant-house'],'a',findObj('tenant','T101',C()),C()).length`),0)
 run(`S.ui.agentDraft.config.types.tenant.links=[]`)
 assert.throws(()=>run('publishAssistant()'),/接口没有可用/)
})

test('query and Function guidance survive drafts, publication and reload; model receives signatures without code',()=>{
 const storage=new Map(),run=workspace({storage});functionAssistant(run)
 const input=modelInput(JSON.parse(run(`JSON.stringify({objectTypes:aipCatalog(aipReadScope()),functions:aipFunctionCatalog(aipReadScope()),toolGuidance:aipToolGuidance()})`)))
 assert.match(toolsFor(input).find(t=>t.function.name==='query_ontology').function.description,/先确认房屋名称/)
 assert.equal(input.functions[0].description,'统计名称前缀匹配的房屋数量。')
 assert.ok(!JSON.stringify(input).includes('class Rental'))
 assert.ok(toolsFor(input).some(t=>t.function.name==='call_function'))
 const call={functionId:'Rental.count',version:'1.0.0',parameters:[{name:'prefix',value:'朝阳'}]}
 assert.deepEqual(validateFunctionCall(call,input.functions),call)
 assert.throws(()=>validateFunctionCall({...call,version:'9.0.0'},input.functions),/未开放/)
 assert.throws(()=>validateFunctionCall({...call,parameters:[]},input.functions),/必填/)
 assert.throws(()=>validateFunctionCall({...call,parameters:[...call.parameters,...call.parameters]},input.functions),/参数无效/)
 assert.equal(run(`aipRunFunction(${JSON.stringify(call)},aipReadScope()).value`),1)
 run(`S.ui.agentDraft.config.queryDescription='草稿查询';S.ui.agentDraft.config.functions[0].description='草稿函数';saveAssistantDraft();persist()`)
 assert.equal(run('aipToolGuidance().query_ontology'),'先确认房屋名称，重名请用户选择。')
 const resumed=workspace({storage});resumed('restore()')
 assert.equal(resumed('aipFunctionCatalog(aipReadScope())[0].description'),'统计名称前缀匹配的房屋数量。')
 resumed(`S.ui.agentDraft=clone(S.aipAgents[S.activeAgent].draft);publishAssistant()`)
 assert.equal(resumed('aipFunctionCatalog(aipReadScope())[0].description'),'草稿函数')
 assert.equal(resumed('aipToolGuidance().query_ontology'),'草稿查询')
 resumed(`S.ui.agentDraft.config.functions[0].enabled=false;publishAssistant()`)
 assert.equal(resumed('aipFunctionCatalog(aipReadScope()).length'),0)
 assert.throws(()=>resumed(`aipRunFunction(${JSON.stringify(call)},aipReadScope())`),/未开放/)
})

test('Function tools enforce readonly access, property and directional Link scope, version pinning and invalid metadata',()=>{
 const run=workspace();functionAssistant(run)
 run(`const call={functionId:'Rental.count',version:'1.0.0',parameters:[{name:'prefix',value:'朝阳'}]};
 const original=JSON.stringify(S.edits);const d=WIZ.linkType.init();d.fkOt='lease';d.pkOt='house';d.fkProp='house_id';d.a.apiName='leases';d.b.apiName='house';WIZ.linkType.finish(d);S.committed=clone(W());
 S.ui.agentDraft.config.types.lease={enabled:true,properties:['id'],links:[]};publishAssistant()`)
 for(const body of ['return Objects.search().tenant().count()', 'return Objects.search().house().filter(h=>h.address.phrasePrefix(prefix)).count()', 'return Objects.search().house().searchAroundLeases().count()', 'return Objects.create().house()("H-ILLEGAL")']){
  run(`S.fnRepo.tags[0].functions[0].js=${JSON.stringify('class Rental { count(prefix) {'+body+'} }')}`)
  assert.throws(()=>run('aipRunFunction(call,aipReadScope())'))
 }
 assert.equal(run('JSON.stringify(S.edits)===original'),true)
 run(`S.ui.agentDraft.config.types.house.links=['lease-house:b'];publishAssistant();S.fnRepo.tags[0].functions[0].js='class Rental { count(prefix) {return Objects.search().house().searchAroundLeases().count()} }'`)
 assert.equal(run('aipRunFunction(call,aipReadScope()).value'),2)
 run(`S.fnRepo.tags.push({version:'2.0.0',time:new Date().toISOString(),functions:[{...meta,js:'class Rental { count(prefix) {return 99} }'}]})`)
 assert.equal(run('aipRunFunction(call,aipReadScope()).value'),2)
 run(`S.ui.agentDraft.config.functions[0].version='';publishAssistant();call.version='2.0.0'`)
 assert.equal(run('aipRunFunction(call,aipReadScope()).value'),99)
 run(`S.ui.agentDraft.config.functions[0].description='x'.repeat(4001)`)
 assert.throws(()=>run('publishAssistant()'),/Tool description/)
 run(`S.ui.agentDraft.config.functions[0].description='</textarea><script>bad()</script>';S.ui.agentDraft.config.queryDescription='</textarea><script>bad()</script>'`)
 assert.ok(!run('pageAssistantBuilder()').includes('<script>bad()</script>'))
 run(`S.ui.agentDraft.config.functions[0].version='9.0.0'`)
 assert.throws(()=>run('publishAssistant()'),/版本已不存在/)
 run(`S.ui.agentDraft.config.functions[0].version='1.0.0';S.fnRepo.tags[0].functions[0].kind='edit'`)
 assert.throws(()=>run('publishAssistant()'),/只读/)
})
