import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

function workspace(){
 const context=vm.createContext({console,structuredClone,URLSearchParams,URL,Date,setTimeout,clearTimeout,crypto:webcrypto,performance,
  location:{search:'?workspace=loftyworks',hash:'',protocol:'http:'},document:{addEventListener(){},querySelector(){return {addEventListener(){}}}},window:{addEventListener(){}}});
 const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
 for(const file of ['agent-workspaces.js','loftyworks-workspace.js','loftyworks-catalog-data.js','loftyworks-catalog.js','loftyworks-operations.js','loftyworks-functions.js','loftyworks-operation-functions.js','loftyworks-ui.js','loftyworks-business-ui.js','loftyworks-journey.js','aip-exposure.js'])vm.runInContext(read(file),context);
 const source=read('index.html').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
 new vm.Script(source);
 vm.runInContext(source.slice(0,source.indexOf('installAipExposure()')),context);
 const run=code=>vm.runInContext(code,context),plain=code=>JSON.parse(JSON.stringify(run(code)));
 run('loadConfiguredWorkspace();S.user="agent";USERS.finance={name:"陈会计",groups:["managers"],attributes:{}};');
 const act=(name,values={},user='agent',dry=false)=>plain(`S.user=${JSON.stringify(user)};evaluateAction(C().actionTypes['lw-${name}'],{...defaultValues(C().actionTypes['lw-${name}'],null,C()),...${JSON.stringify(values)}},C(),{dry:${dry}})`);
 const ok=(name,values,user='agent')=>{const result=act(name,values,user);assert.deepEqual(result.failures,[],name+': '+result.failures.join(';'));return result;};
 const rows=id=>plain(`objectsOf(LOFTY_IDS[${JSON.stringify(id)}]||${JSON.stringify(id)})`);
 const snapshot=()=>plain('({edits:S.edits,logs:S.logs})');
 return {run,plain,act,ok,rows,snapshot};
}
const tenancy={id:'TNY-001',property:'PROP-01',tenant:'TEN-01',start:'2026-11-01',end:'2027-10-31',rentPence:100000,feeBps:1000};
const invoice='INV-TNY-001-2026-11';
function bill(w){w.ok('createTenancy',tenancy);w.ok('issueRent',{tenancy:tenancy.id,period:'2026-11'});}
function fund(w,amount=100000){bill(w);w.ok('receiveBankLine',{tenant:'TEN-01',externalId:'TEST-001',amountPence:amount,bookingDate:'2026-11-24'});w.ok('reconcileRent',{invoice,bankLine:'BL-ORG-01-TEST-001',amountPence:amount,requestId:'match-1'});}
function payout(w){w.ok('requestPayout',{tenancy:tenancy.id,amountPence:100000,requestId:'one'});return 'PO-one';}
function reject(w,name,values,user='agent',pattern){const before=w.snapshot();const result=w.act(name,values,user);assert.ok(result.failures.length,name+' should reject');if(pattern)assert.match(result.failures.join(' '),pattern);assert.deepEqual(w.snapshot(),before,'failed action must not write objects or success logs');}

test('LoftyWorks publishes valid full schema and all declared functions',()=>{
 const w=workspace();assert.equal(w.rows('party').length,7);
 assert.equal(w.run('S.fnRepo.tags[0].functions.length'),w.run('8+LOFTY_OPERATIONS.length'));
 assert.deepEqual(w.plain('validateOnto().errors'),[]);
 assert.equal(w.run('STORE_KEY'),'rental-ontology:v2:loftyworks');
});

function party(w,role,id=role){w.ok('registerParty',{organisation:'ORG-01',name:role,email:role+'@example.test',role,requestId:id});return 'PTY-'+id;}
function complete(w,p,receipt='receipt-'+p){w.ok('decidePayout',{payout:p,decision:'APPROVED',reason:'checked'},'manager');w.ok('sendPayment',{payout:p},'manager');w.ok('recordPaymentResult',{payment:'PAY-'+p,result:'COMPLETED',receiptId:receipt,reason:'simulated'},'manager');}
function consistent(w){assert.deepEqual(w.plain('loftyAudit().failures'),[]);}

test('Guided journey advances using actual records and does not write when rendered',()=>{
 const w=workspace(),state=()=>w.plain('loftyJourneyState()');
 assert.equal(state().next.action,'createTenancy');const before=w.snapshot();w.run('pageLoftyJourney()');assert.deepEqual(w.snapshot(),before);
 w.ok('createTenancy',tenancy);assert.equal(state().next.action,'issueRent');
 w.ok('issueRent',{tenancy:tenancy.id,period:'2026-11'});assert.equal(state().next.action,'receiveBankLine');
 w.ok('receiveBankLine',{tenant:'TEN-01',externalId:'GUIDE',amountPence:100000,bookingDate:'2026-11-24'});
 assert.equal(state().next.action,'reconcileRent');w.ok(state().next.action,{...state().next.vals,requestId:'guide'});
 assert.equal(state().next.action,'requestPayout');w.ok(state().next.action,{...state().next.vals,requestId:'guide-pay'});
 assert.equal(state().next.action,'decidePayout');assert.ok(state().next.blocked);
 w.run('S.user="manager"');assert.equal(state().next.blocked,'');w.ok('decidePayout',state().next.vals,'manager');
 assert.equal(state().next.action,'sendPayment');w.ok('sendPayment',state().next.vals,'manager');
 assert.equal(state().next.action,'recordPaymentResult');w.ok('recordPaymentResult',state().next.vals,'manager');
 assert.equal(state().next.action,'registerParty');const agency=party(w,'AGENCY');
 assert.equal(state().next.action,'requestSettlement');assert.equal(state().next.vals.recipient,agency);
 w.ok(state().next.action,{...state().next.vals,requestId:'guide-fee'});complete(w,'PO-guide-fee');
 assert.equal(state().settled,true);assert.equal(state().nextPeriod,'2026-12');consistent(w);
});

test('Guided journey isolates lease balances and blocks the applicant from self approval',()=>{
 const w=workspace();fund(w);w.ok('requestPayout',{tenancy:tenancy.id,amountPence:100000,requestId:'self-ui'},'manager');
 assert.ok(w.plain('loftyJourneyState().next.blocked'));w.run('S.user="finance"');assert.equal(w.plain('loftyJourneyState().next.blocked'),'');
 w.ok('registerProperty',{organisation:'ORG-01',name:'第二套房',landlord:'LL-01',requestId:'second'});
 w.ok('createTenancy',{...tenancy,id:'TNY-002',property:'PROP-second',tenant:'TEN-02'});
 const second=w.plain('loftyJourneyState("TNY-002")');
 assert.equal(second.next.action,'issueRent');assert.equal(second.bankBalance,0);assert.equal(second.received,0);assert.equal(second.payouts.length,0);
 assert.equal(w.plain('loftyJourneyState("TNY-001").bankBalance'),100000);
});

test('New payouts follow current single ownership while completed payouts keep their recipient',()=>{
 const w=workspace();fund(w);const previous=payout(w);complete(w,previous);
 const landlord=party(w,'LANDLORD','new-owner');
 w.ok('setOwners',{property:'PROP-01',owners:JSON.stringify([{partyId:landlord,shareBps:10000}]),requestId:'transfer'},'manager');
 w.ok('issueRent',{tenancy:tenancy.id,period:'2026-12'});
 w.ok('receiveBankLine',{tenant:'TEN-01',externalId:'NEXT',amountPence:100000,bookingDate:'2026-12-01'});
 w.ok('reconcileRent',{invoice:'INV-TNY-001-2026-12',bankLine:'BL-ORG-01-NEXT',amountPence:100000,requestId:'next'});
 w.ok('requestPayout',{tenancy:tenancy.id,amountPence:100000,requestId:'new-owner'});
 assert.equal(w.rows('payout').find(p=>p.id==='PO-new-owner').recipientId,landlord);
 assert.equal(w.rows('payment-item').find(p=>p.id==='PO-new-owner-item').partyId,landlord);
 assert.equal(w.rows('payout').find(p=>p.id===previous).recipientId,'LL-01');consistent(w);
});

test('All 107 source tables and 169 relationships accounted for without pretending name-only models have schemas',()=>{
 const w=workspace();assert.equal(w.run('Object.keys(WORKSPACE.sourceTypes).length'),107);assert.equal(w.run('WORKSPACE.sourceLinks.length'),169);assert.equal(w.run('WORKSPACE.types.length'),110);
 assert.equal(w.run('LOFTY_CATALOG.amplify.length'),94);
 assert.equal(w.run('LOFTY_CATALOG.tables.every(t=>t.cols.every(c=>WORKSPACE.sourceTypes[t.id].properties.some(p=>p[0]===LOFTY_COLUMN_MAP[t.id][c[0]])))'),true);
});
test('Master data, ownership, bank details, organisation controls and role models',()=>{
 const w=workspace(),ll=party(w,'LANDLORD'),team=party(w,'TEAM');
 w.ok('registerProperty',{organisation:'ORG-01',name:'新房产',landlord:ll,requestId:'property'});
 reject(w,'setOwners',{property:'PROP-property',owners:JSON.stringify([{partyId:ll,shareBps:9000}]),requestId:'owners'},'manager',/10000/);
 w.ok('setOwners',{property:'PROP-property',owners:JSON.stringify([{partyId:ll,shareBps:10000}]),requestId:'owners'},'manager');
 w.ok('saveBankDetails',{party:ll,sortCode:'123456',accountNumber:'12345678',requestId:'bank'},'manager');
 w.ok('grantBusinessRole',{organisation:'ORG-01',party:team,roleName:'TLP Staff',requestId:'role'},'manager');
 w.ok('configureOrganisation',{organisation:'ORG-01',autoInvoice:false,paymentsEnabled:false,requestId:'config'},'manager');
 assert.equal(w.rows('ownership').filter(r=>r.status==='ACTIVE').length,1);assert.equal(w.rows('roleGrant').length,1);assert.equal(w.rows('userHistory').length,3);consistent(w);
});
test('Billing batch creates recurring lines, respects switches and is safe to rerun',()=>{
 const w=workspace();w.ok('createTenancy',tenancy);
 w.ok('createRecurringCharge',{tenancy:tenancy.id,name:'服务费',amountPence:2000,frequency:'MONTHLY',effectiveDate:'2026-11-01',endDate:'2027-10-31',requestId:'template'});
 w.ok('runBilling',{organisation:'ORG-01',period:'2026-11',requestId:'batch'});
 assert.equal(w.rows('invoice').length,2);assert.equal(w.rows('invoiceLine').length,2);
 w.ok('runBilling',{organisation:'ORG-01',period:'2026-11',requestId:'batch-again'});assert.equal(w.rows('invoice').length,2);
 w.ok('configureOrganisation',{organisation:'ORG-01',autoInvoice:false,paymentsEnabled:true,requestId:'disable'},'manager');
 w.ok('runBilling',{organisation:'ORG-01',period:'2026-12',requestId:'batch-dec'});assert.equal(w.rows('invoice').filter(i=>i.period==='2026-12').length,1);consistent(w);
});
test('Auto-allocation uses priority and leaves unallocated excess',()=>{
 const w=workspace();w.ok('createTenancy',tenancy);w.ok('createRecurringCharge',{tenancy:tenancy.id,name:'服务费',amountPence:2000,frequency:'MONTHLY',effectiveDate:'2026-11-01',endDate:'2027-10-31',requestId:'template'});w.ok('runBilling',{organisation:'ORG-01',period:'2026-11',requestId:'bill'});
 w.ok('setAllocationPriority',{organisation:'ORG-01',kind:'SERVICE',priority:1,requestId:'priority'},'manager');
 w.ok('receiveBankLine',{tenant:'TEN-01',externalId:'AUTO',amountPence:5000,bookingDate:'2026-11-24'});w.ok('allocateIncoming',{bankLine:'BL-ORG-01-AUTO',requestId:'alloc'});
 assert.equal(w.rows('invoice').find(i=>i.category==='SERVICE').remainingPence,'0');assert.equal(w.rows('invoice').find(i=>i.category==='RENT').remainingPence,'97000');consistent(w);
});
test('Credit Note reduces receivable, paid credit creates refundable balance and refund settles it',()=>{
 const w=workspace();fund(w);
 w.ok('issueCredit',{invoice,amountPence:20000,reason:'减免',requestId:'credit'},'manager');assert.equal(w.plain('loftyAudit().totals["2530"]'),20000);consistent(w);
 w.ok('requestSettlement',{tenancy:tenancy.id,kind:'REFUND',recipient:'TEN-01',amountPence:20000,sourceId:'NA',requestId:'refund'});complete(w,'PO-refund');
 assert.equal(w.rows('credit')[0].status,'REFUNDED');assert.equal(w.plain('loftyAudit().totals["2530"]'),0);consistent(w);
 reject(w,'issueCredit',{invoice,amountPence:90000,reason:'too much',requestId:'too-much'},'manager',/不能超过/);
 const u=workspace();bill(u);u.ok('issueCredit',{invoice,amountPence:100000,reason:'取消收费',requestId:'cancel'},'manager');assert.equal(u.rows('invoice')[0].remainingPence,'0');consistent(u);
});
test('Supplier, float and agency payments use segregated liabilities and the same approval flow',()=>{
 const w=workspace();fund(w);const sup=party(w,'SUPPLIER'),agency=party(w,'AGENCY');
 w.ok('moveFloat',{tenancy:tenancy.id,amountPence:20000,direction:'FUND',requestId:'float'},'manager');
 w.ok('issueSupplierBill',{tenancy:tenancy.id,supplier:sup,amountPence:10000,name:'维修',requestId:'supplier'});
 w.ok('fundSupplierBill',{invoice:'SUP-supplier',source:'FLOAT',requestId:'fund'},'manager');
 w.ok('requestSettlement',{tenancy:tenancy.id,kind:'SUPPLIER',recipient:sup,amountPence:10000,sourceId:'SUP-supplier',requestId:'supplier-pay'});complete(w,'PO-supplier-pay');
 assert.equal(w.rows('workOrder')[0].status,'PAID');consistent(w);
 w.ok('moveFloat',{tenancy:tenancy.id,amountPence:10000,direction:'RELEASE',requestId:'release'},'manager');
 w.ok('requestPayout',{tenancy:tenancy.id,amountPence:90000,requestId:'owner'});complete(w,'PO-owner');
 w.ok('requestSettlement',{tenancy:tenancy.id,kind:'AGENCY',recipient:agency,amountPence:9000,sourceId:'NA',requestId:'fee'});complete(w,'PO-fee');
 assert.equal(w.plain('loftyAudit().fullySettled'),true);assert.equal(w.rows('rollup').length,1);consistent(w);
});
test('Deposit cannot become landlord payout and protection debits only deposit balance',()=>{
 const w=workspace();w.ok('createTenancy',tenancy);const scheme=party(w,'TENANCY_DEPOSIT_SCHEME');
 w.ok('receiveBankLine',{tenant:'TEN-01',externalId:'DEP',amountPence:120000,bookingDate:'2026-11-24'});
 w.ok('recordDeposit',{tenancy:tenancy.id,bankLine:'BL-ORG-01-DEP',scheme,amountPence:120000,requestId:'deposit'});
 reject(w,'requestPayout',{tenancy:tenancy.id,amountPence:100000,requestId:'wrong'},'agent',/余额不足/);
 w.ok('requestSettlement',{tenancy:tenancy.id,kind:'DEPOSIT_SCHEME',recipient:scheme,amountPence:120000,sourceId:'DEP-deposit',requestId:'protect'});complete(w,'PO-protect');assert.equal(w.rows('deposit')[0].status,'PROTECTED');consistent(w);
});
test('NRL uses explicitly configured basis, holds tax separately and pays through approval',()=>{
 const w=workspace();fund(w);const hmrc=party(w,'AGENCY','tax-office');
 w.ok('configureNrl',{tenancy:tenancy.id,rateBps:2000,exempt:false,requestId:'rule'},'manager');w.ok('allocateNrl',{tenancy:tenancy.id,taxablePence:100000,requestId:'tax'},'manager');
 assert.equal(w.plain('loftyAudit().available'),80000);
 w.ok('requestSettlement',{tenancy:tenancy.id,kind:'HMRC',recipient:hmrc,amountPence:20000,sourceId:'NA',requestId:'tax-pay'});complete(w,'PO-tax-pay');consistent(w);
});
test('Multiple landlord distribution conserves pence and cannot use single-owner shortcut',()=>{
 const w=workspace();fund(w);const ll2=party(w,'LANDLORD','second-owner');
 w.ok('setOwners',{property:'PROP-01',owners:JSON.stringify([{partyId:'LL-01',shareBps:6000},{partyId:ll2,shareBps:4000}]),requestId:'owners'},'manager');
 reject(w,'requestPayout',{tenancy:tenancy.id,amountPence:100000,requestId:'single'},'agent',/多房东/);
 w.ok('distributeOwners',{tenancy:tenancy.id,amountPence:100000,requestId:'split'});assert.deepEqual(w.rows('payout').map(p=>Number(p.netPence)),[54000,36000]);
 complete(w,'PO-split-0');complete(w,'PO-split-1');consistent(w);
});
test('Renewal uses dated periods; arrears and outbox are idempotent; vacate refuses unsettled funds',()=>{
 const w=workspace();bill(w);
 w.ok('proposeRenewal',{tenancy:tenancy.id,effectiveDate:'2027-11-01',endDate:'2028-10-31',newRentPence:110000,requestId:'renew'});w.ok('confirmRenewal',{renewal:'REN-renew',requestId:'confirm'},'manager');
 w.ok('runBilling',{organisation:'ORG-01',period:'2027-11',requestId:'new-rent'});assert.equal(w.rows('invoice').find(i=>i.period==='2027-11').amountPence,'110000');assert.equal(w.rows('invoice').find(i=>i.period==='2026-11').amountPence,'100000');
 w.ok('sendArrearsReminder',{tenancy:tenancy.id,asOf:'2026-11-24',requestId:'remind'});reject(w,'sendArrearsReminder',{tenancy:tenancy.id,asOf:'2026-11-24',requestId:'repeat'},'agent',/已生成/);
 w.ok('processOutbox',{organisation:'ORG-01',requestId:'events'});assert.ok(w.rows('outbox').every(e=>e.status==='SENT_SIMULATED'));
 w.ok('giveNotice',{tenancy:tenancy.id,effectiveDate:'2028-09-30',reason:'搬离',requestId:'notice'});reject(w,'completeVacate',{tenancy:tenancy.id,requestId:'vacate'},'manager',/未结清/);consistent(w);
});
test('Document template, simulated signing, supplier sharing and expiry use linked objects',()=>{
 const w=workspace();w.ok('createTenancy',tenancy);const sup=party(w,'SUPPLIER');
 w.ok('createDocumentTemplate',{organisation:'ORG-01',name:'合同',content:'{{tenant}} 租住 {{property}}',requestId:'template'});
 w.ok('generateDocument',{tenancy:tenancy.id,template:'TPL-template',expiresAt:'2030-12-31',requestId:'doc'});
 assert.match(w.rows('document')[0].content,/张三/);w.ok('signDocument',{document:'DOC-doc',signer:'张三',requestId:'sign'});
 w.ok('shareDocument',{document:'DOC-doc',supplier:sup,requestId:'share'});w.ok('checkCompliance',{organisation:'ORG-01',asOf:'2031-01-01',requestId:'expiry'});assert.equal(w.rows('document')[0].status,'EXPIRED');consistent(w);
});
test('Bank sync checks consent, logs duplicate pushes and produces only suggestions',()=>{
 const w=workspace();bill(w);w.ok('connectSimulatedBank',{organisation:'ORG-01',name:'Client money',sortCode:'123456',accountNumber:'12345678',expiresAt:'2030-12-31',requestId:'bank'},'manager');
 const lines=JSON.stringify([{externalId:'SYNC-1',tenantId:'TEN-01',amountPence:100000,bookingDate:'2026-11-24',description:'rent'}]);
 w.ok('syncSimulatedLines',{account:'BA-bank',lines,requestId:'sync'});w.ok('syncSimulatedLines',{account:'BA-bank',lines,requestId:'sync2'});assert.equal(w.rows('bank-line').length,1);assert.equal(w.rows('duplicate').length,1);
 w.ok('suggestMatches',{bankLine:'BL-ORG-01-SYNC-1',requestId:'match'});assert.equal(w.rows('reconciliation').length,0);assert.match(w.rows('aiMatch')[0].details,/EXACT_TENANT_ID_RULE/);consistent(w);
});
test('Batch approval, limits, payment receipts and daily statement hierarchy',()=>{
 const w=workspace();fund(w);const id=payout(w);w.ok('decidePayout',{payout:id,decision:'APPROVED',reason:'checked'},'manager');
 w.ok('setPaymentLimit',{organisation:'ORG-01',amountPence:1000000,lineLimitPence:500000,requestId:'limit'},'manager');
 w.ok('createPaymentBatch',{organisation:'ORG-01',payoutIds:JSON.stringify([id]),requestId:'batch'});
 reject(w,'approvePaymentBatch',{file:'FILE-batch',requestId:'approve'},'agent');
 w.ok('approvePaymentBatch',{file:'FILE-batch',requestId:'approve'},'manager');w.ok('sendPaymentBatch',{file:'FILE-batch',requestId:'send'},'manager');
 w.ok('recordPaymentResult',{payment:'PAY-'+id,result:'COMPLETED',receiptId:'BATCH-1',reason:'simulated'},'manager');assert.equal(w.rows('paymentFile')[0].status,'COMPLETED');
 const st={organisation:'ORG-01',date:'2026-11-24',accountNumber:'12345678',openingPence:0,closingPence:10000,movements:JSON.stringify([{signedPence:100000,description:'rent'},{signedPence:-90000,description:'landlord'}]),requestId:'statement'};
 w.ok('importDailyStatement',st,'manager');assert.equal(w.rows('statementMovement').length,2);reject(w,'importDailyStatement',{...st,requestId:'duplicate'},'manager',/已导入/);consistent(w);
});
test('Auxiliary task is explicitly manual reviewed and never pretends to be an LLM call',()=>{
 const w=workspace();w.ok('queueAssistantTask',{organisation:'ORG-01',name:'检查本月欠租',requestId:'task'});w.ok('completeAssistantTask',{task:'TASK-task',details:'人工核对：尚无账单',requestId:'done'});
 assert.equal(w.rows('agentTask')[0].status,'MANUAL_REVIEWED');
});

test('Treasury templates enforce the same settlement checks and bank account rules',()=>{
 const w=workspace();fund(w);const agency=party(w,'AGENCY');const id=payout(w);complete(w,id);
 w.ok('saveBankDetails',{party:agency,sortCode:'123456',accountNumber:'12345678',requestId:'details'},'manager');
 w.ok('savePaymentTemplate',{organisation:'ORG-01',name:'管理费',recipient:agency,sortCode:'123456',accountNumber:'12345678',requestId:'template'},'manager');
 w.ok('usePaymentTemplate',{tenancy:tenancy.id,template:'PT-template',kind:'AGENCY',amountPence:10000,sourceId:'NA',requestId:'fee'});
 w.ok('decidePayout',{payout:'PO-fee',decision:'APPROVED',reason:'check'},'manager');
 w.ok('setAccountRule',{organisation:'ORG-01',accountNumber:'12345678',kind:'BLOCK',name:'blocked',requestId:'block'},'manager');reject(w,'sendPayment',{payout:'PO-fee'},'manager',/禁止清单/);
 w.ok('setAccountRule',{organisation:'ORG-01',accountNumber:'12345678',kind:'ALLOW',name:'allowed',requestId:'allow'},'manager');
 w.ok('sendPayment',{payout:'PO-fee'},'manager');w.ok('recordPaymentResult',{payment:'PAY-PO-fee',result:'COMPLETED',receiptId:'FEE-OK',reason:'simulated'},'manager');assert.equal(w.plain('loftyAudit().fullySettled'),true);consistent(w);
});
test('Batch cannot be bypassed via standalone send; rejection of any item rolls whole batch back',()=>{
 const w=workspace();fund(w);w.ok('requestPayout',{tenancy:tenancy.id,amountPence:50000,requestId:'one'});w.ok('requestPayout',{tenancy:tenancy.id,amountPence:50000,requestId:'two'});
 for(const p of ['PO-one','PO-two'])w.ok('decidePayout',{payout:p,decision:'APPROVED',reason:'check'},'manager');
 w.ok('setPaymentLimit',{organisation:'ORG-01',amountPence:100000,lineLimitPence:100000,requestId:'limit'},'manager');
 w.ok('createPaymentBatch',{organisation:'ORG-01',payoutIds:'["PO-one","PO-two"]',requestId:'batch'});
 reject(w,'sendPayment',{payout:'PO-one'},'manager',/复核/);w.ok('approvePaymentBatch',{file:'FILE-batch',requestId:'approve'},'manager');
 w.ok('configureOrganisation',{organisation:'ORG-01',autoInvoice:true,paymentsEnabled:false,requestId:'off'},'manager');reject(w,'sendPaymentBatch',{file:'FILE-batch',requestId:'send'},'manager',/关闭/);assert.equal(w.rows('bank-payment').length,0);consistent(w);
});
test('Supplier failure releases its own reserve; another invoice cannot consume reserved funds',()=>{
 const w=workspace();fund(w);const sup=party(w,'SUPPLIER');w.ok('issueSupplierBill',{tenancy:tenancy.id,supplier:sup,amountPence:20000,name:'维修',requestId:'supplier'});w.ok('fundSupplierBill',{invoice:'SUP-supplier',source:'LANDLORD',requestId:'fund'},'manager');
 const req={tenancy:tenancy.id,kind:'SUPPLIER',recipient:sup,amountPence:20000,sourceId:'SUP-supplier',requestId:'one'};w.ok('requestSettlement',req);reject(w,'requestSettlement',{...req,requestId:'two'},'agent');
 w.ok('decidePayout',{payout:'PO-one',decision:'APPROVED',reason:'check'},'manager');w.ok('sendPayment',{payout:'PO-one'},'manager');w.ok('recordPaymentResult',{payment:'PAY-PO-one',result:'FAILED',receiptId:'FAIL-1',reason:'simulated refusal'},'manager');
 assert.equal(w.plain('loftyAudit().totals["2200"]'),20000);assert.equal(w.rows('invoice').find(i=>i.id==='SUP-supplier').status,'FUNDED');w.ok('requestSettlement',{...req,requestId:'retry'});complete(w,'PO-retry');consistent(w);
});
test('Vacate succeeds only after all money is paid; paused recurring templates stop future charges',()=>{
 const w=workspace();fund(w);const agency=party(w,'AGENCY');const id=payout(w);complete(w,id);
 w.ok('requestSettlement',{tenancy:tenancy.id,kind:'AGENCY',recipient:agency,amountPence:10000,sourceId:'NA',requestId:'fee'});complete(w,'PO-fee');
 w.ok('createRecurringCharge',{tenancy:tenancy.id,name:'服务费',amountPence:2000,frequency:'MONTHLY',effectiveDate:'2026-11-01',endDate:'2027-10-31',requestId:'template'});w.ok('pauseRecurring',{template:'RT-template',reason:'取消收费',requestId:'pause'});
 w.ok('giveNotice',{tenancy:tenancy.id,effectiveDate:'2026-11-30',reason:'结束租约',requestId:'notice'});w.ok('completeVacate',{tenancy:tenancy.id,requestId:'vacate'},'manager');assert.equal(w.rows('property')[0].status,'AVAILABLE');
 w.ok('runBilling',{organisation:'ORG-01',period:'2026-12',requestId:'batch'});assert.equal(w.rows('invoice').length,1);consistent(w);
});
test('Function code persistence is deduplicated, roundtrips and migration preserves business records',()=>{
 const w=workspace();fund(w);const before=w.snapshot();
 const packed=w.plain('packWorkspace(S)');assert.ok(Object.keys(packed.functionCode).length>0);assert.ok(JSON.stringify(packed).length<2500000,'localStorage remains within a practical budget');
 w.run(`S=unpackWorkspace(${JSON.stringify(packed)})`);assert.deepEqual(w.snapshot(),before);w.ok('requestPayout',{tenancy:tenancy.id,amountPence:100000,requestId:'restore'});
 const state=w.snapshot();w.run('S.loftyModelVersion=1;delete S.committed.objectTypes[LOFTY_IDS.credit];delete S.working.objectTypes[LOFTY_IDS.credit];delete S.datasets.LwCredit;upgradeLoftyWorks()');
 assert.equal(w.run('Object.keys(C().objectTypes).length'),110);assert.deepEqual(w.snapshot(),state);consistent(w);
 assert.ok(w.run('pageLoftyCatalog().includes("107 / 107")'));assert.ok(w.run('pageLoftyBusiness().includes("统一资金核验")'));
});
test('Full workflow uses Actions, balanced ledger, approvals and successful receipt',()=>{
 const w=workspace();fund(w);
 const result=w.act('requestPayout',{tenancy:tenancy.id,amountPence:100000,requestId:'one'},'agent',true);
 assert.deepEqual(result.failures,[]);assert.ok(result.edits.length>0);assert.equal(w.rows('payout').length,0,'preview must not submit');
 const id=payout(w);w.ok('decidePayout',{payout:id,decision:'APPROVED',reason:'checked'},'manager');
 w.ok('sendPayment',{payout:id},'manager');
 assert.equal(w.rows('statement').length,0,'sending is not completion');
 w.ok('recordPaymentResult',{payment:'PAY-'+id,result:'COMPLETED',receiptId:'RCPT-1',reason:'simulated bank confirmation'},'manager');
 const a=w.plain('loftyAudit()');assert.deepEqual(a.failures,[]);assert.equal(a.closed,true);
 assert.equal(a.bank,10000);assert.equal(a.fee,10000);assert.equal(a.paid,90000);assert.equal(a.reserved,0);
 assert.equal(w.rows('statement')[0].receiptId,'RCPT-1');assert.equal(w.run('S.logs.length'),8);
 assert.equal(w.rows('transaction').length,3);assert.equal(w.rows('entry').length,7);
 const saved=w.plain('({v:2,state:S})');
 w.run(`S={...fresh(),...${JSON.stringify(saved.state)}}`);assert.equal(w.plain('loftyAudit()').closed,true);
});
test('Partial receipts, over-allocation and duplicate bank identifiers',()=>{
 const w=workspace();fund(w,40000);assert.equal(w.rows('invoice')[0].status,'PARTIALLY_RECONCILED');
 reject(w,'receiveBankLine',{tenant:'TEN-01',externalId:'TEST-001',amountPence:40000,bookingDate:'2026-11-24'},'agent',/重复/);
 w.ok('receiveBankLine',{tenant:'TEN-01',externalId:'TEST-002',amountPence:70000,bookingDate:'2026-11-24'});
 reject(w,'reconcileRent',{invoice,bankLine:'BL-ORG-01-TEST-002',amountPence:60001,requestId:'match-2'},'agent',/超过/);
 w.ok('reconcileRent',{invoice,bankLine:'BL-ORG-01-TEST-002',amountPence:60000,requestId:'match-2'});
 assert.equal(w.rows('invoice')[0].status,'RECONCILED');assert.equal(w.rows('bank-line')[1].remainingPence,'10000');
 assert.deepEqual(w.plain('loftyAudit().failures'),[]);assert.equal(w.plain('loftyAudit().unmatched'),10000);
});
test('Permissions, self approval, stale forms and unpaid balances cannot bypass rules',()=>{
 const w=workspace();reject(w,'createTenancy',tenancy,'viewer');bill(w);
 reject(w,'requestPayout',{tenancy:tenancy.id,amountPence:1,requestId:'none'},'agent',/余额不足/);
 reject(w,'issueRent',{tenancy:tenancy.id,period:'2026-11'},'agent',/重复/);
 reject(w,'issueRent',{tenancy:tenancy.id,period:'2028-01'},'agent',/租期/);
 const w2=workspace();fund(w2);const id=payout(w2);
 reject(w2,'requestPayout',{tenancy:tenancy.id,amountPence:1,requestId:'again'},'agent',/余额不足/);
 reject(w2,'decidePayout',{payout:id,decision:'APPROVED',reason:'x'},'agent',/经理/);
 reject(w2,'sendPayment',{payout:id},'manager',/先.*批准/);
 const w3=workspace();fund(w3);w3.ok('requestPayout',{tenancy:tenancy.id,amountPence:100000,requestId:'self'},'manager');
 reject(w3,'decidePayout',{payout:'PO-self',decision:'APPROVED',reason:'x',actor:'agent'},'manager',/不能审批自己的/);
});
test('Failed bank payment reverses reservation; retry succeeds without double debit',()=>{
 const w=workspace();fund(w);const id=payout(w);
 w.ok('decidePayout',{payout:id,decision:'APPROVED',reason:'checked'},'manager');w.ok('sendPayment',{payout:id},'manager');
 reject(w,'sendPayment',{payout:id},'manager');
 w.ok('recordPaymentResult',{payment:'PAY-'+id,result:'FAILED',receiptId:'FAIL-1',reason:'account unavailable'},'manager');
 assert.equal(w.plain('loftyAudit().available'),100000);assert.equal(w.plain('loftyAudit().fee'),0);assert.equal(w.rows('statement').length,0);
 reject(w,'recordPaymentResult',{payment:'PAY-'+id,result:'COMPLETED',receiptId:'LATE',reason:'late'},'manager',/终态/);
 w.ok('requestPayout',{tenancy:tenancy.id,amountPence:100000,requestId:'retry'});
 w.ok('decidePayout',{payout:'PO-retry',decision:'APPROVED',reason:'checked'},'manager');w.ok('sendPayment',{payout:'PO-retry'},'manager');
 w.ok('recordPaymentResult',{payment:'PAY-PO-retry',result:'COMPLETED',receiptId:'OK-2',reason:'ok'},'manager');
 assert.equal(w.plain('loftyAudit().closed'),true);assert.equal(w.plain('loftyAudit().paid'),90000);
 assert.deepEqual(w.plain('loftyAudit().failures'),[]);
 reject(w,'recordPaymentResult',{payment:'PAY-PO-retry',result:'COMPLETED',receiptId:'OK-2',reason:'duplicate'},'manager');
});
test('Rejected approval releases all reserved money and cannot be sent',()=>{
 const w=workspace();fund(w);const id=payout(w);
 w.ok('decidePayout',{payout:id,decision:'REJECTED',reason:'wrong bank details'},'manager');
 assert.equal(w.plain('loftyAudit().available'),100000);assert.equal(w.plain('loftyAudit().reserved'),0);assert.equal(w.plain('loftyAudit().fee'),0);
 assert.equal(w.rows('transaction').at(-1).reversesId,'PO-one-reserve');reject(w,'sendPayment',{payout:id},'manager');
 assert.deepEqual(w.plain('loftyAudit().failures'),[]);
});
test('Cross-tenant/cross-organisation receipts and invalid monetary values rejected atomically',()=>{
 const w=workspace();reject(w,'createTenancy',{...tenancy,tenant:'TEN-X'},'agent',/同一机构/);bill(w);
 for(const tenant of ['TEN-X','TEN-02']){
  w.ok('receiveBankLine',{tenant,externalId:tenant,amountPence:100000,bookingDate:'2026-11-24'});
  reject(w,'reconcileRent',{invoice,bankLine:'BL-'+(tenant==='TEN-X'?'ORG-02':'ORG-01')+'-'+tenant,amountPence:100000,requestId:tenant},'agent',/同机构/);
 }
 for(const amountPence of [0,-1,0.5,1e12])reject(w,'receiveBankLine',{tenant:'TEN-01',externalId:'bad',amountPence,bookingDate:'2026-11-24'});
 assert.equal(w.rows('entry').length,0);
});
test('Real two-hop Link traversal and exposed Action catalog use the same records',()=>{
 const w=workspace();bill(w);
 const view=w.plain(`aipRunView({id:'loftyTenantProperty',lookup:'张三'},'2026-11-24',ontologyReadScope())`);
 assert.ok(JSON.stringify(view).includes('PROP-01'));assert.ok(JSON.stringify(view).includes('TNY-001'));
 w.run('aipExposureConfig()');const cat=w.plain('aipActionCatalog(aipReadScope())');
 assert.ok(cat.some(a=>a.apiName==='requestPayout'));assert.ok(!cat.some(a=>a.apiName==='decidePayout'));
 const query={objectType:'Party',mode:'list',filters:[{property:'id',operator:'eq',value:'TEN-01'}],related:null,traverse:[{link:'tenancies',filters:[]},{link:'rentalProperty',filters:[]}],properties:['id','name'],offset:0,limit:20};
 const result=w.plain(`aipOntologyQuery(${JSON.stringify(query)},'2026-11-24',aipReadScope())`);
 assert.equal(result.aggregate.total,1);assert.equal(result.records[0].id,'PROP-01');
});
