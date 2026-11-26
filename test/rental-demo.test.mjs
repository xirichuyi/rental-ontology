import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {actionDiscoveryResult,modelInput,toolsFor} from '../aip-tools.mjs'

function demo(){
 const context=vm.createContext({console,structuredClone,URLSearchParams,URL,Date,setTimeout,clearTimeout,
  location:{search:'?workspace=rental-demo',hash:'',protocol:'http:'},document:{addEventListener(){},querySelector(){return {addEventListener(){}}}},window:{addEventListener(){}}})
 const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')
 for(const file of ['agent-workspaces.js','rental-demo.js','aip-exposure.js'])vm.runInContext(read(file),context)
 const source=read('index.html').match(/<script>\s*([\s\S]*?)<\/script>/)[1]
 vm.runInContext(source.slice(0,source.indexOf('installAipExposure()')),context)
 const run=source=>vm.runInContext(source,context)
 run('loadConfiguredWorkspace();aipExposureConfig()')
 return {run,plain:source=>JSON.parse(JSON.stringify(run(source)))}
}
test('100 Actions: initial context has no definitions; discovery is bounded, typed and rejects unexposed actions',()=>{
 const actions=Array.from({length:100},(_,i)=>({apiName:'renew'+i,name:'续签 '+i,objectType:i<50?'Lease':'Contract',description:'延长合同',parameters:[{name:'privateParameter'}]}))
 const initial=modelInput({actions,objectTypes:[]})
 assert.equal(initial.actions,undefined);assert.equal(initial.actionCatalog.totalActions,100)
 assert.ok(!JSON.stringify(initial).includes('privateParameter'))
 assert.ok(toolsFor(initial).some(t=>t.function.name==='search_actions'))
 const page=actionDiscoveryResult('search_actions',{query:'续签',objectType:'Lease',offset:0},actions)
 assert.equal(page.total,50);assert.equal(page.items.length,8);assert.equal(page.nextOffset,8)
 assert.equal(page.items[0].parameters,undefined)
 assert.equal(actionDiscoveryResult('describe_action',{actionType:'renew0'},actions).action.parameters[0].name,'privateParameter')
 assert.throws(()=>actionDiscoveryResult('describe_action',{actionType:'deleteEverything'},actions),/未.*开放/)
})
test('Rental closed loop: sign → two-hop lookup → renew → read back → terminate → read back; failed repeats do not mutate data',()=>{
 const {run,plain}=demo()
 assert.equal(run('S.logs.length'),1)
 assert.equal(run(`findObj('house','H01',C()).current_tenant_id`),'T01')
 const query={objectType:'Tenant',mode:'list',filters:[{property:'id',operator:'eq',value:'T01'}],properties:['name'],related:null,traverse:[{link:'leases',filters:[]},{link:'house',filters:[]}],offset:0,limit:15}
 assert.deepEqual(plain(`aipOntologyQuery(${JSON.stringify(query)},S.rentalDemo.today,aipReadScope()).records`).map(r=>r.id),['H01'])
 const params=`{lease:'L-DEMO-001',end:S.rentalDemo.renewEnd,monthly_rent:'8800'}`
 assert.equal(run(`evaluateAction(C().actionTypes['renew-lease'],${params},C(),{dry:true}).failures.length`),0)
 assert.equal(run(`findObj('lease','L-DEMO-001',C()).monthly_rent`),'8500')
 assert.equal(run(`evaluateAction(C().actionTypes['renew-lease'],${params},C(),{dry:false}).failures.length`),0)
 assert.equal(run(`findObj('lease','L-DEMO-001',C()).end===S.rentalDemo.renewEnd`),true)
 assert.equal(run(`findObj('lease','L-DEMO-001',C()).monthly_rent`),'8800')
 assert.equal(run(`evaluateAction(C().actionTypes['terminate-lease'],{lease:'L-DEMO-001',date:S.rentalDemo.today},C(),{dry:false}).failures.length`),0)
 assert.equal(run(`findObj('lease','L-DEMO-001',C()).status`),'已结束')
 assert.equal(run(`findObj('house','H01',C()).status`),'空置')
 assert.equal(run(`findObj('house','H01',C()).current_tenant_id`),'')
 const before=run('JSON.stringify(S.edits)'),logs=run('S.logs.length')
 assert.ok(run(`evaluateAction(C().actionTypes['terminate-lease'],{lease:'L-DEMO-001',date:S.rentalDemo.today},C(),{dry:false}).failures.length`)>0)
 assert.ok(run(`evaluateAction(C().actionTypes['renew-lease'],${params},C(),{dry:false}).failures.length`)>0)
 assert.equal(run('JSON.stringify(S.edits)'),before);assert.equal(run('S.logs.length'),logs)
 assert.equal(logs,3)
})
test('Disabled Actions and read-only roles cannot discover writes',()=>{
 const {run}=demo()
 assert.ok(run(`aipActionType(aipReadScope(),'renewLease')`))
 run(`S.aipConfig.actions={'renew-lease':false}`)
 assert.equal(run(`aipActionType(aipReadScope(),'renewLease')`),null)
 run(`S.user='viewer'`)
 assert.equal(run('aipActionCatalog(aipReadScope()).length'),0)
})
