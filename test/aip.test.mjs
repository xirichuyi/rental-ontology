import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {modelInput,discoveryResult,validateQuery} from '../aip-tools.mjs'

function workspace(){
 const context=vm.createContext({console,structuredClone,URLSearchParams,URL,Date,setTimeout,clearTimeout,
  location:{search:'',hash:'',protocol:'http:'},document:{addEventListener(){},querySelector(){return {addEventListener(){}}}},window:{addEventListener(){}}})
 const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')
 vm.runInContext(read('agent-workspaces.js'),context)
 vm.runInContext(read('aip-exposure.js'),context)
 const source=read('index.html').match(/<script>\s*([\s\S]*?)<\/script>/)[1]
 new vm.Script(source) // Parse the entire production script, including startup.
 vm.runInContext(source.slice(0,source.indexOf('installAipExposure()')),context)
 const run=source=>vm.runInContext(source,context)
 run(`loadSample(); S.edits.lease={created:{
  L1:{id:'L1',tenant_id:'T01',house_id:'H01',start:'2026-01-01',end:'2027-01-01',status:'有效'},
  L2:{id:'L2',tenant_id:'T01',house_id:'H02',start:'2026-01-01',end:'2027-01-01',status:'有效'},
  L3:{id:'L3',tenant_id:'T02',house_id:'H03',start:'2026-01-01',end:'2027-01-01',status:'有效'}
 },modified:{},deleted:[]};aipExposureConfig();`)
 return {run,plain:source=>JSON.parse(JSON.stringify(run(source)))}
}
const query={objectType:'Tenant',mode:'list',filters:[{property:'id',operator:'eq',value:'T01'}],related:null,
 traverse:[{link:'leases',filters:[]},{link:'house',filters:[]}],properties:['name'],offset:0,limit:15}
test('A customer lookup traverses two links and excludes other tenants',()=>{
 const {run,plain}=workspace()
 const result=plain(`aipOntologyQuery(${JSON.stringify(query)},'2026-11-24',aipReadScope())`)
 assert.equal(result.aggregate.objectType,'House')
 assert.equal(result.aggregate.total,2)
 assert.deepEqual(result.records.map(r=>r.id),['H01','H02'])
 assert.equal(result.steps.filter(s=>s.title.startsWith('Search Around')).length,2)
 assert.equal(run('S.edits.lease.created.L1.status'),'有效')
})
test('Direct ID lookup does not require a link; pages report total and next offset',()=>{
 const {plain}=workspace()
 const direct={...query,objectType:'Lease',filters:[{property:'id',operator:'eq',value:'L1'}],traverse:[],properties:['id']}
 assert.deepEqual(plain(`aipOntologyQuery(${JSON.stringify(direct)},'2026-11-24',aipReadScope())`).records.map(r=>r.id),['L1'])
 const first=plain(`aipOntologyQuery(${JSON.stringify({...query,limit:1})},'2026-11-24',aipReadScope())`)
 assert.equal(first.aggregate.total,2);assert.equal(first.aggregate.nextOffset,1)
 const second=plain(`aipOntologyQuery(${JSON.stringify({...query,limit:1,offset:1})},'2026-11-24',aipReadScope())`)
 assert.equal(second.records[0].id,'H02');assert.equal(second.aggregate.nextOffset,null)
})
test('Disabled fields, types and links are absent from metadata and rejected by execution',()=>{
 const {run,plain}=workspace()
 run(`S.aipConfig.types.tenant.properties=S.aipConfig.types.tenant.properties.filter(p=>p!=='phone')`)
 const cat=plain('aipCatalog(aipReadScope())')
 assert.ok(!cat.find(t=>t.apiName==='Tenant').properties.some(p=>p.apiName==='phone'))
 const forbidden={...query,traverse:[],properties:['phone']}
 assert.throws(()=>validateQuery(forbidden,cat),/未开放/)
 assert.throws(()=>run(`aipOntologyQuery(${JSON.stringify(forbidden)},'2026-11-24',aipReadScope())`),/未.*开放/)
 run(`S.aipConfig.types.tenant.links=[]`)
 assert.throws(()=>run(`aipOntologyQuery(${JSON.stringify(query)},'2026-11-24',aipReadScope())`),/Link 未开放/)
 run(`S.aipConfig.types.lease.enabled=false`)
 assert.ok(!plain('aipCatalog(aipReadScope())').some(t=>t.apiName==='Lease'))
 assert.ok(!plain('aipCatalog(aipReadScope())').find(t=>t.apiName==='Tenant').links.some(l=>l.to==='Lease'))
})
test('Metadata is discovered in bounded pages and initial model context contains no data rows',()=>{
 const {plain}=workspace(),catalog=plain('aipCatalog(aipReadScope())')
 const many=Array.from({length:30},(_,i)=>({...catalog[0],apiName:'Type'+i,name:'类型'+i}))
 const initial=modelInput({objectTypes:many,retrievalContext:null})
 assert.equal(initial.objectTypes.length,12)
 assert.equal(initial.objectTypes[0].properties,undefined)
 assert.equal(initial.objectTypes[0].links,undefined)
 assert.ok(!JSON.stringify(initial).includes('13800000001'))
 const second=discoveryResult('search_object_types',{query:'',offset:12},many)
 assert.equal(second.items.length,12);assert.equal(second.nextOffset,24)
 assert.equal(discoveryResult('describe_object_type',{objectType:'Tenant'},catalog).objectType.links[0].from,'Tenant')
 assert.throws(()=>discoveryResult('describe_object_type',{objectType:'Unknown'},catalog),/未.*开放/)
})
test('Optional retrieval applies the same field scope and returns at most N records',()=>{
 const {run,plain}=workspace()
 assert.equal(run('aipRetrievalContext(aipReadScope())'),null)
 run(`S.aipConfig.types.tenant.properties=['id','name'];S.aipConfig.retrieval={type:'tenant',limit:1}`)
 const result=plain('aipRetrievalContext(aipReadScope())')
 assert.equal(result.objects.length,1);assert.equal(result.total,3);assert.equal(result.truncated,true)
 assert.deepEqual(Object.keys(result.objects[0]),['id','name'])
 run(`S.aipConfig.types.tenant.enabled=false`)
 assert.equal(run('aipRetrievalContext(aipReadScope())'),null)
})
test('Cycles remain bounded and counts use distinct target objects',()=>{
 const {plain}=workspace()
 const back={...query,traverse:[{link:'leases',filters:[]},{link:'tenant',filters:[]}],properties:[],mode:'count'}
 assert.equal(plain(`aipOntologyQuery(${JSON.stringify(back)},'2026-11-24',aipReadScope())`).aggregate.total,1)
 assert.throws(()=>validateQuery({...query,traverse:[...query.traverse,...query.traverse]},plain('aipCatalog(aipReadScope())')),/三跳/)
})

test('Saved views and Action object parameters also respect the selected scope',()=>{
 const {run,plain}=workspace()
 assert.ok(plain('aipViewCatalog(aipReadScope())').some(v=>v.id==='leaseHistory'))
 assert.ok(plain('aipActionCatalog(aipReadScope())').length>0)
 run(`S.aipConfig.types.tenant.links=[]`)
 assert.ok(!plain('aipViewCatalog(aipReadScope())').some(v=>v.id==='leaseHistory'))
 assert.throws(()=>run(`aipRunView({id:'leaseHistory',lookup:'T01'},'2026-11-24',aipReadScope())`),/没有这个查询视图/)
 run(`S.aipConfig.types.lease.enabled=false`)
 assert.ok(plain('aipActionCatalog(aipReadScope())').every(a=>!a.parameters.some(p=>p.type==='Lease')))
})
