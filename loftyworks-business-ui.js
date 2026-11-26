const LOFTY_GROUP_RECORDS={setup:['party','property','organisation','ownership','bankDetails','roleGrant','priority'],tenancy:['tenancy','period','periodOwner','renewal','note','outbox','tenancyAudit'],billing:['invoice','invoiceLine','recurring','credit','arrears','job','jobItem'],funds:['payout','approval','payment-item','deposit','workOrder','floatTarget','nrl','carried','rollup','entry'],bank:['bankAccount','consent','connection','bank-line','bankSync','duplicate','aiMatch','gatewayEvent'],docs:['docTemplate','document','docShare','permission','feedback','dismissal'],tlp:['paymentFile','paymentRecord','roleLimit','paymentTemplate','accountList','holiday','statementDay','statementUpload','statementBalance','statementMovement','mfa'],ai:['agentDefinition','agentTask','schemaSnapshot']};
function loftyCoverage(){
 return LOFTY_CATALOG.tables.map(source=>{
  const type=WORKSPACE.sourceTypes[source.id],operations=LOFTY_OPERATIONS.filter(o=>o.writes.includes(type.alias)).map(o=>o.id);
  const evidence={approvalHistory:['decidePayout'],tracking:['recordPaymentResult'],rollup:['recordPaymentResult'],gatewayEvent:['sendPayment','recordPaymentResult']};
  for(const id of evidence[type.alias]||[])if(!operations.includes(id))operations.push(id);
  const core=Object.hasOwn(LOFTY_SOURCE_TABLES,type.id);
  const reference=['coa','txKind','schemaSnapshot'].includes(type.alias);
  const historical=source.dom==='infra'||['payment_run','payment_run_items'].includes(source.t)||source.s==='accounting'&&/embeddings$/.test(source.t);
  return {source,type,operations,level:core||operations.length?'业务操作已接入':reference?'参考数据':historical?'历史 / 工程记录':'结构已接入，专用行为未实现',count:objectsOf(type.id).length};
 });
}
function loftyPrefill(id){
 const rows=a=>objectsOf(LOFTY_IDS[a]||a),first=a=>rows(a)[0]?.id||'',now=today(),t=rows('tenancy').find(t=>t.id===S.ui.loftyTenancy)||rows('tenancy')[0];
 const role=r=>rows('party').find(p=>p.role===r&&(!t||p.organisationId===t.organisationId))?.id||'';
 const invoice=rows('invoice').find(i=>i.direction==='OUTBOUND'),supplierInvoice=rows('invoice').find(i=>i.direction==='INBOUND'&&i.status==='UNPAID');
 const approved=rows('payout').filter(p=>p.status==='PENDING'&&!p.batchId&&rows('approval').some(a=>a.payoutId===p.id&&a.status==='APPROVED'));
 const defaults={organisation:t?.organisationId||'ORG-01',tenancy:t?.id||'',property:t?.propertyId||'PROP-01',amountPence:'10000',reason:'业务核对通过',asOf:now,period:now.slice(0,7),effectiveDate:now,endDate:t?.end||'2027-12-31',frequency:'MONTHLY',sourceId:'NA',
  invoice:invoice?.id||'',bankLine:rows('bank-line').find(b=>Number(b.remainingPence)>0)?.id||first('bank-line'),supplier:role('SUPPLIER'),scheme:role('TENANCY_DEPOSIT_SCHEME'),recipient:role('AGENCY'),kind:'AGENCY',source:'LANDLORD',direction:'FUND',rateBps:'2000',taxablePence:'100000',exempt:false,priority:'10',autoInvoice:true,paymentsEnabled:true,
  template:first('docTemplate'),document:rows('document').find(d=>d.status==='DRAFT')?.id||first('document'),signer:'张三',expiresAt:'2030-12-31',content:'{{tenant}} 租住 {{property}}。双方确认本租约。',
  role:'SUPPLIER',roleName:'TLP Staff',landlord:role('LANDLORD'),party:role('SUPPLIER'),email:'demo@example.test',sortCode:'123456',accountNumber:'12345678',account:first('bankAccount'),
  lineLimitPence:'500000',payoutIds:JSON.stringify(approved.map(p=>p.id)),file:rows('paymentFile').find(f=>['PENDING_REVIEW','APPROVED'].includes(f.status))?.id||first('paymentFile'),date:now,openingPence:'0',closingPence:'10000',movements:'[{"signedPence":10000,"description":"模拟来款"}]',
  lines:JSON.stringify([{externalId:'SYNC-'+(rows('bank-line').length+1),tenantId:t?.tenantId||'TEN-01',amountPence:100000,bookingDate:now,description:'模拟租金'}]),
  owners:JSON.stringify([{partyId:role('LANDLORD'),shareBps:10000}]),renewal:rows('renewal').find(r=>r.status==='PROPOSED')?.id||'',newRentPence:'110000',task:rows('agentTask').find(q=>q.status==='PENDING')?.id||'',details:'已人工核对业务资料'};
 const specific={registerParty:{name:'模拟维修供应商'},registerProperty:{name:'新房产'},createRecurringCharge:{name:'每月服务费',amountPence:'2000',effectiveDate:t?.start||now},issueSupplierBill:{name:'维修费用'},fundSupplierBill:{invoice:supplierInvoice?.id||''},createDocumentTemplate:{name:'租约文本模板'},connectSimulatedBank:{name:'模拟客户资金账户'},setPaymentLimit:{amountPence:'1000000'},proposeRenewal:{effectiveDate:t?.end?new Date(Date.parse(t.end)+86400000).toISOString().slice(0,10):'2027-11-01',endDate:t?.end?(Number(t.end.slice(0,4))+1)+t.end.slice(4):'2028-10-31'},queueAssistantTask:{name:'核查当前租约的未收账单与待处理付款'},giveNotice:{effectiveDate:t?.end||now},pauseRecurring:{template:first('recurring')},usePaymentTemplate:{template:first('paymentTemplate')},savePaymentTemplate:{name:'常用付款'},setAccountRule:{name:'机构收款账户',kind:'ALLOW'},addBankHoliday:{name:'人工录入休息日',effectiveDate:'2030-12-25'},dismissReminder:{itemId:first('document')}};
 const values={...defaults,...specific[id]};const op=LOFTY_OPERATIONS.find(o=>o.id===id);
 return Object.fromEntries((op?.params||[]).filter(p=>values[p.id]!==undefined).map(p=>[p.id,values[p.id]]));
}
function pageLoftyBusiness(){
 const group=Object.hasOwn(LOFTY_OPERATION_GROUPS,S.ui.loftyGroup)?S.ui.loftyGroup:'setup',operations=LOFTY_OPERATIONS.filter(o=>o.group===group),aliases=LOFTY_GROUP_RECORDS[group];
 const alias=aliases.includes(S.ui.loftyRecords)?S.ui.loftyRecords:aliases[0],typeId=LOFTY_IDS[alias]||alias,type=C().objectTypes[typeId],records=objectsOf(typeId),audit=loftyAudit();
 const cols=['id','name','status','role','kind','tenancyId','amountPence','netPence','remainingPence','details'].filter(id=>type?.properties.some(p=>p.id===id)&&records.some(r=>r[id]!==''&&r[id]!=null));
 if(!cols.length)cols.push('id');
 const fmt=(r,key)=>key==='id'?'<a href="#/explorer/'+typeId+'/'+encodeURIComponent(r.id)+'">'+esc(r.id)+'</a>':/Pence$/.test(key)?loftyMoney(r[key]):esc(String(r[key]??'').slice(0,160));
 return head('LoftyWorks · 全部业务操作','按需要选择业务模块；第一次使用可以先回到租约流程台，按步骤办理。','<a class="btn primary" href="#/lofty-business">返回租约流程台</a> <a class="btn" href="#/loftyworks">资金明细</a> <a class="btn" href="#/lofty-catalog">全量对象目录</a>')+
 '<p class="note">当前为本地业务模拟：银行、通知和签署均不连接外部服务。原文没有给出全部状态规则，新增流程采用可查看的本地规则。金额输入统一为便士。</p>'+
 '<div class="row lofty-module-tabs" role="navigation" aria-label="业务模块">'+Object.entries(LOFTY_OPERATION_GROUPS).map(([id,name])=>B('loftyGroup',name,id===group?'primary':'',id)).join('')+'</div>'+
 '<section class="card"><div class="spread"><h2>'+esc(LOFTY_OPERATION_GROUPS[group])+'</h2><span class="muted">'+operations.length+' 个操作</span></div><div class="lofty-operation-grid">'+operations.map(o=>'<article class="lofty-operation"><h3>'+esc(o.name)+'</h3><p>'+esc(o.description)+'</p><div class="spread"><span class="muted small-t">'+(o.manager?'经理执行':'专员 / 经理')+'</span>'+B('loftyOpenOperation','打开操作','small',o.id)+'</div></article>').join('')+'</div></section>'+
 '<section class="card"><div class="spread"><h2>业务记录</h2><a class="btn small" href="#/action-log">Action Log</a></div><label class="fld"><span>查看对象</span><select data-change="loftyRecords" aria-label="查看业务对象">'+options(aliases.map(a=>{const id=LOFTY_IDS[a]||a;return [a,(C().objectTypes[id]?.name||a)+' · '+objectsOf(id).length+' 条'];}),alias)+'</select></label>'+table(cols.map(c=>esc(type?.properties.find(p=>p.id===c)?.name||c)),records.slice(-50).reverse().map(r=>cols.map(c=>fmt(r,c))),'暂无记录。上面的操作会实际创建或修改这些对象。')+'<p class="muted small-t">显示最近 50 条；点击编号可查看全部属性与 Link。</p></section>'+
 '<section class="card"><h2>统一资金核验</h2><p class="note '+(audit.failures.length?'bad':'ok')+'">'+(audit.failures.length?audit.failures.map(esc).join('；'):'借贷平衡、资金隔离、预留、账单核销和对象关系一致')+'</p>'+table(['科目','余额'],Object.entries(audit.totals).filter(([,v])=>v!==0).map(([account,value])=>[esc(account),loftyMoney(account==='1000'?-value:value)]))+'<p>'+ (audit.fullySettled?'当前账单、来款、出款及账面资金全部结清。':'仍有余额或业务待处理；可以在各模块继续操作。')+'</p></section>';
}
function pageLoftyCatalog(){
 const all=loftyCoverage(),filter=S.ui.loftyCatalogFilter||'',term=(S.ui.loftyCatalogSearch||'').trim().toLowerCase();
 const list=all.filter(r=>(!filter||r.source.dom===filter)&&(!term||[r.source.id,r.source.desc,r.type.apiName].join(' ').toLowerCase().includes(term)));
 const supported=all.filter(r=>r.level==='业务操作已接入').length;
 return head('LoftyWorks · 完整来源目录','按表逐项核对结构、关系、业务操作和本地记录数量。表结构存在不等于该表的业务已经完整实现。','<a class="btn" href="#/lofty-business">业务操作</a> <a class="btn" href="#/link-types">查看 Link Types</a>')+
 '<div class="lofty-metrics">'+[['来源表',all.length+' / 107'],['原始关系',WORKSPACE.sourceLinks.length+' / 169'],['可执行 Action',WORKSPACE.actionTypes.length],['有业务操作的来源表',supported],['本地补充模型','3'],['当前 Object Type',WORKSPACE.types.length]].map(([label,value])=>'<section class="card"><span class="muted">'+label+'</span><strong>'+value+'</strong></section>').join('')+'</div>'+
 '<p class="note">107 张 PostgreSQL 表已映射到 Object Type；另外 3 个为押金登记、NRL 规则、维修工单的本地补充模型。原文件没有提供生产数据，所以本地记录数不等于原系统记录数。历史、迁移和旧版本表保留结构，不执行旧版业务。</p>'+
 '<section class="card lofty-source-table"><div class="row"><label class="fld"><span>业务域</span><select data-change="loftyCatalogFilter" aria-label="业务域">'+options([['','全部'],...new Set(all.map(r=>r.source.dom))].map(v=>Array.isArray(v)?v:[v,v]),filter)+'</select></label><label class="fld"><span>表名或业务说明</span><input aria-label="搜索来源表" data-change="loftyCatalogSearch" value="'+esc(S.ui.loftyCatalogSearch||'')+'"></label></div>'+table(['来源表 / Object Type','业务用途','实现情况','记录','操作'],list.map(r=>[
 '<a href="#/object-types/'+r.type.id+'">'+esc(r.type.apiName)+'</a><br><code class="small-t">'+esc(r.source.id)+'</code>',esc(r.source.desc),esc(r.level),'<a href="#/explorer/'+r.type.id+'">'+r.count+'</a>',r.operations.length?'<details><summary>'+r.operations.length+' 个 Action</summary>'+r.operations.map(id=>B('loftyOpenOperation',esc(C().actionTypes['lw-'+id]?.name||id),'small',id)).join(' ')+'</details>':Object.hasOwn(LOFTY_SOURCE_TABLES,r.type.id)?'<a href="#/loftyworks">收租流程</a>':'—']))+'</section>'+
 '<section class="card"><details><summary>字段和原始 Link 的来源映射</summary><p>保留所有源列及其原始类型；业务金额转换为整数便士。复合主键的来源表用本地 id 标识，原主键列仍在元数据中。原图的 inferred / cross-db 标记仍保留，不能当作数据库已强制的 FK。</p>'+table(['来源关系','分类','当前 Link'],WORKSPACE.sourceLinks.map(e=>[esc(e.src+'.'+e.col+' → '+e.tgt),esc(e.kind),'<a href="#/link-types/'+e.linkId+'">'+esc(e.linkId)+'</a>']))+'</details></section>'+
 '<section class="card"><h2>附件只有名称，无法还原完整行为的部分</h2><p>以下 '+LOFTY_CATALOG.amplify.length+' 个 Amplify 名称和 '+LOFTY_CATALOG.ddbsvc.length+' 条服务声明未提供字段、接口和状态机。不能把它们计入「已完整实现」。与已实现业务相关的押金、NRL 和维修工单使用上面标出的本地补充模型。</p><details><summary>查看全部名称</summary><pre class="lofty-wrap">'+esc(LOFTY_CATALOG.amplify.join(', ')+'\n\n'+LOFTY_CATALOG.ddbsvc.map(x=>x.join(' · ')).join('\n'))+'</pre></details></section>';
}
function upgradeLoftyWorks(){
 if(S.loftyModelVersion===LOFTY_MODEL_VERSION)return;
 const oldCommitted=S.committed,oldWorking=S.working,oldRepo=S.fnRepo,base=fresh();
 for(const [name,ds] of Object.entries(base.datasets)){
  const current=S.datasets[name];if(!current){S.datasets[name]=ds;continue;}
  for(const field of ds.fields)if(!current.fields.includes(field)){current.fields.push(field);for(const row of current.rows)row.push('');}
  // New demo actors support the audit foreign keys; user records are never overwritten.
  if(name==='Party')for(const row of ds.rows){const key=row[ds.fields.indexOf('id')];if(['agent','manager','finance'].includes(key)&&!current.rows.some(r=>r[current.fields.indexOf('id')]===key))current.rows.push(current.fields.map(f=>row[ds.fields.indexOf(f)]??''));}
 }
 loadConfiguredWorkspace();
 const merge=old=>{const target=clone(S.committed);for(const bucket of ['objectTypes','linkTypes','actionTypes','sharedProps','interfaces','groups'])for(const [id,value] of Object.entries(old?.[bucket]||{})){
  if(!target[bucket][id])target[bucket][id]=value;
  else if(bucket==='objectTypes'){const generated=target[bucket][id];generated.properties=[...generated.properties,...value.properties.filter(p=>!generated.properties.some(n=>n.id===p.id))];}
 }return target;};
 S.committed=merge(oldCommitted);S.working=merge(oldWorking);
 if(oldRepo?.source&&oldRepo.source!==LOFTY_FUNCTION_SOURCE){S.loftyPreviousFunctionRepository=oldRepo;}
 S.loftyModelVersion=LOFTY_MODEL_VERSION;
}
function installLoftyBusiness(){
 if(WORKSPACE_ID!=='loftyworks')return;
 ACT.loftyGroup=group=>{S.ui.loftyGroup=group;S.ui.loftyRecords=null;};
 ACT.loftyOpenOperation=id=>openActionForm('lw-'+id,null,null,loftyPrefill(id));
 for(const name of ['loftyRecords','loftyCatalogFilter','loftyCatalogSearch'])CHANGE[name]=element=>{S.ui[name]=element.value;};
 const style=document.createElement('style');style.textContent='.lofty-module-tabs{flex-wrap:wrap;gap:8px;margin:16px 0}.lofty-operation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.lofty-operation{border:1px solid var(--line);border-radius:8px;padding:16px;display:flex;flex-direction:column}.lofty-operation p{flex:1;line-height:1.6}.lofty-wrap{white-space:pre-wrap;overflow-wrap:anywhere}.lofty-operation .btn{min-height:36px}.lofty-source-table table{table-layout:fixed;min-width:760px}.lofty-source-table td{white-space:normal;overflow-wrap:anywhere}.lofty-source-table button{white-space:normal;margin:3px 0}.lofty-source-table th:nth-child(1){width:25%}.lofty-source-table th:nth-child(2){width:35%}.lofty-source-table th:nth-child(3){width:17%}.lofty-source-table th:nth-child(4){width:5%}.lofty-source-table th:nth-child(5){width:18%}@media(max-width:760px){.lofty-operation-grid{grid-template-columns:1fr}}';document.head.append(style);
}
