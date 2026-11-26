const loftyMoney = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(value||0)/100);
function loftyAudit(){
 const rows=id=>objectsOf(id,C()), sum=(rs,p)=>rs.reduce((n,r)=>n+Number(r[p]||0),0);
 const entries=rows('entry'), txs=rows('transaction'), invoices=rows('invoice'), bank=rows('bank-line'), payouts=rows('payout'), payments=rows('bank-payment'), statements=rows('statement');
 const failures=[];
 for(const tx of txs){const es=entries.filter(e=>e.transactionId===tx.id);if(!es.length||sum(es,'debitPence')!==sum(es,'creditPence'))failures.push('交易 '+tx.id+' 借贷不平衡');}
 for(const e of entries)if(!['debitPence','creditPence'].every(p=>Number.isSafeInteger(Number(e[p]))&&Number(e[p])>=0))failures.push('分录 '+e.id+' 金额无效');
 const rec=rows('reconciliation'),credits=rows(LOFTY_IDS.credit),deposits=rows(LOFTY_IDS.deposit);
 for(const i of invoices){const received=sum(rec.filter(r=>r.invoiceId===i.id),'amountPence'),remaining=Number(i.remainingPence);
  const paid=i.direction==='INBOUND'?sum(payouts.filter(p=>p.invoiceId===i.id&&p.status==='COMPLETED'),'netPence'):received;
  const reduced=credits.filter(c=>c.invoiceId===i.id).reduce((n,c)=>n+Number(c.amountPence)-Number(c.refundPence||0),0);
  if(Number(i.amountPence)-paid-reduced!==remaining||remaining<0)failures.push('账单 '+i.id+' 对账金额不一致');
  const expected=remaining===0?'RECONCILED':i.direction==='INBOUND'&&i.status==='FUNDED'?'FUNDED':received>0||reduced>0?'PARTIALLY_RECONCILED':'UNPAID';
  if(i.status!==expected)failures.push('账单 '+i.id+' 状态与余额不一致');
 }
 for(const b of bank){const allocated=sum(rec.filter(r=>r.bankLineId===b.id),'amountPence')+sum(deposits.filter(d=>d.bankLineId===b.id),'amountPence');if(Number(b.amountPence)-allocated!==Number(b.remainingPence)||Number(b.remainingPence)<0)failures.push('流水 '+b.id+' 分配不一致');}
 for(const l of Object.values(C().linkTypes)){
  if(l.mode!=='fk')continue;
  const target=C().objectTypes[l.b.objectType],ids=new Set(rows(target.id).map(r=>String(r[target.primaryKey])));
  for(const r of rows(l.a.objectType))if(r[l.fk.property]&&!ids.has(String(r[l.fk.property])))failures.push('断开的 Link：'+l.id+' / '+r.id);
 }
 const accounts=[...new Set(['1000','2100','2450','2510',...entries.map(e=>e.account)])];
 const totals=Object.fromEntries(accounts.map(a=>[a,entries.filter(e=>e.account===a).reduce((n,e)=>n+Number(e.creditPence)-Number(e.debitPence),0)]));
 for(const l of rows('ledger')){
  const es=entries.filter(e=>e.ledgerId===l.id);
  const bal=a=>es.filter(e=>e.account===a).reduce((n,e)=>n+Number(e.creditPence)-Number(e.debitPence),0);
  if(accounts.some(a=>a!=='1000'&&bal(a)<0)||bal('1000')>0)failures.push('分类账 '+l.id+' 出现负可用余额');
  if(-bal('1000')!==accounts.filter(a=>a!=='1000').reduce((n,a)=>n+bal(a),0))failures.push('分类账 '+l.id+' 银行与负债不平衡');
  const active=payouts.filter(p=>p.tenancyId===l.tenancyId&&['PENDING','PROCESSING'].includes(p.status));
  for(const account of ['2500','2510','2520','2550','2560','2570'])if(bal(account)!==sum(active.filter(p=>(p.reserveAccount||'2510')===account),'netPence'))failures.push('分类账 '+l.id+' '+account+' 预留与未完成出款不一致');
 }
 for(const p of payouts){
  const pay=payments.filter(b=>b.payoutId===p.id),snaps=statements.filter(s=>s.payoutId===p.id);
  if(Number(p.grossPence)!==Number(p.feePence)+Number(p.netPence))failures.push('出款 '+p.id+' 分拆不平衡');
  const landlord=!p.kind||p.kind==='LANDLORD';
  if(p.status==='COMPLETED'&&(pay.length!==1||pay[0].status!=='COMPLETED'||!pay[0].receiptId||(landlord&&(snaps.length!==1||snaps[0].receiptId!==pay[0].receiptId||Number(snaps[0].netPence)!==Number(p.netPence)))))failures.push('出款 '+p.id+' 缺少成功回执或结算快照');
  if(p.status!=='COMPLETED'&&snaps.length)failures.push('未完成出款 '+p.id+' 存在结算快照');
 }
 const paid=payouts.filter(p=>p.status==='COMPLETED'&&(!p.kind||p.kind==='LANDLORD'));
 const pending=payouts.filter(p=>['PENDING','PROCESSING'].includes(p.status));
 const outstanding=sum(invoices,'remainingPence'),unmatched=sum(bank,'remainingPence');
 return {failures,totals,fullySettled:invoices.length>0&&!failures.length&&!outstanding&&!unmatched&&!pending.length&&totals['1000']===0,transactions:txs.length,entries:entries.length,bank:-totals['1000'],available:totals['2100'],reserved:totals['2510'],fee:totals['2450'],outstanding,unmatched,
  paid:sum(paid,'netPence'),paidCount:paid.length,pending:pending.length,statements:statements.length,
  closed:invoices.length>0&&paid.length>0&&!failures.length&&!outstanding&&!unmatched&&!pending.length&&totals['2100']===0&&totals['2510']===0};
}
function pageLoftyWorks(){
 const rows=id=>objectsOf(id,C()), a=loftyAudit(),tenancies=rows('tenancy'),invoices=rows('invoice'),bank=rows('bank-line'),payouts=rows('payout'),payments=rows('bank-payment');
 const selected=tenancies.find(t=>t.id===S.ui.loftyTenancy)||tenancies[0];
 const availableProperty=rows('property').find(p=>p.status==='AVAILABLE');
 const tId=selected?.id||'',is=r=>!tId||r.tenancyId===tId;
 const inv=invoices.filter(is),po=payouts.filter(is),party=selected?.tenantId||'TEN-01';
 const selectedBank=bank.filter(b=>b.tenantId===party),pays=payments.filter(b=>po.some(p=>p.id===b.payoutId));
 const anchor=(type,id,label=id)=>'<a href="#/explorer/'+type+'/'+encodeURIComponent(id)+'">'+esc(label)+'</a>';
 const button=(id,label,vals={},disabled=false)=>B('loftyAction',esc(label),'small',JSON.stringify({id,vals}),disabled?'disabled':'');
 const status=s=>badge(esc(s),['COMPLETED','RECONCILED','ACTIVE','APPROVED'].includes(s)?'new':['FAILED','REJECTED'].includes(s)?'del':'mod');
 const remainBank=selectedBank.find(b=>Number(b.remainingPence)>0),remainInv=inv.find(i=>Number(i.remainingPence)>0);
 const snapshot=rows('statement').filter(is);
 const stage=(n,title,done,detail)=>'<li class="'+(done?'done':'')+'"><span class="n">'+(done?'✓':n)+'</span><span><b>'+title+'</b><br><span class="muted small-t">'+detail+'</span></span></li>';
 return head('LoftyWorks · 租赁资金业务台','模拟 GBP 资金流程 · 所有操作使用已发布的 Action 和 Function，刷新后保留当前工作区。',
  '<a href="#/lofty-operations" class="btn primary">全部业务操作</a> <a href="#/lofty-catalog" class="btn">110 个对象类型</a> <a href="#/aip" class="btn">打开 AIP</a>')+
 '<div class="note">示例从张三每月 <b>£1,000</b> 的租约开始：收租后扣 <b>10%</b> 管理费，向房东支付 <b>£900</b>，客户资金账户保留 <b>£100</b> 待付中介。<b>银行指令与回执均为模拟，不会真实转账。</b></div>'+
 '<div class="lofty-metrics">'+[['未收租金',a.outstanding],['未对账来款',a.unmatched],['可分配房东资金',a.available],['预留房东出款',a.reserved],['已付房东',a.paid],['待付中介管理费',a.fee]].map(([label,value])=>'<section class="card"><span class="muted">'+label+'</span><strong>'+loftyMoney(value)+'</strong></section>').join('')+'</div>'+
 '<section class="card"><div class="spread"><h2>业务流程</h2>'+status(a.closed?'房东出款闭环完成':'进行中')+'</div><ol class="checklist lofty-stages">'+
 stage(1,'租约',!!tenancies.length,'房产、租客、房东与分类账')+stage(2,'账单',!!invoices.length,'应收尚不等于到账')+stage(3,'来款与对账',a.transactions>0,'核销账单并写入总账')+stage(4,'申请与审批',payouts.some(p=>['PROCESSING','COMPLETED'].includes(p.status)),'预留资金、分人审批')+stage(5,'银行回执',a.paidCount>0,'成功后生成结算快照')+'</ol></section>'+
 '<section class="card"><div class="spread"><h2>1 · 建立租约与开票</h2>'+button('createTenancy','建立新租约',{id:'TNY-'+String(tenancies.length+1).padStart(3,'0'),property:availableProperty?.id||'',tenant:'TEN-01',start:'2026-11-01',end:'2027-10-31',rentPence:'100000',feeBps:'1000'})+'</div><p class="muted">角色流程：租赁专员申请出款 → 运营经理审批。经理也可申请，但必须由另一位财务经理审批。</p>'+
 (tenancies.length?'<label class="fld"><span>当前业务租约</span><select data-change="loftyTenancy" aria-label="当前业务租约">'+options(tenancies.map(t=>[t.id,t.id+' · '+(findObj('party',t.tenantId)?.name||t.tenantId)]),tId)+'</select></label>':'<p class="note">先点「建立新租约」，参数已填入模拟示例，提交后继续开票。</p>')+
 table(['租约','租客','房产','月租 / 管理费','状态','操作'],tenancies.map(t=>[anchor('tenancy',t.id),anchor('party',t.tenantId,findObj('party',t.tenantId)?.name),anchor('property',t.propertyId,findObj('property',t.propertyId)?.name),loftyMoney(t.rentPence)+' / '+Number(t.feeBps)/100+'%',status(t.status),button('issueRent','开租金账单',{tenancy:t.id,period:'2026-11'})]))+
 table(['账单','账期','应收','剩余未收','状态'],inv.map(i=>[anchor('invoice',i.id),esc(i.period),loftyMoney(i.amountPence),loftyMoney(i.remainingPence),status(i.status)]),'该租约尚未开票')+'</section>'+
 '<section class="card"><div class="spread"><h2>2 · 银行来款与对账</h2><div class="row">'+button('receiveBankLine','导入模拟来款',{tenant:party,externalId:'BANK-'+String(bank.length+1).padStart(3,'0'),amountPence:remainInv?.remainingPence||'100000',bookingDate:today()})+
 button('reconcileRent','对账并入账',{invoice:remainInv?.id||'',bankLine:remainBank?.id||'',amountPence:remainInv&&remainBank?String(Math.min(Number(remainInv.remainingPence),Number(remainBank.remainingPence))):''},!remainInv||!remainBank)+'</div></div><p class="muted">支持部分到账；一次分配不能超过账单和流水任一方的剩余金额。流水唯一号防止重复导入。</p>'+
 table(['银行流水','外部流水号','到账','未分配','状态'],selectedBank.map(b=>[anchor('bank-line',b.id),esc(b.externalId),loftyMoney(b.amountPence),loftyMoney(b.remainingPence),status(b.status)]),'还没有该租客的来款')+
 table(['对账记录','账单','银行流水','记账交易','金额'],rows('reconciliation').filter(r=>inv.some(i=>i.id===r.invoiceId)).map(r=>[anchor('reconciliation',r.id),anchor('invoice',r.invoiceId),anchor('bank-line',r.bankLineId),anchor('transaction',r.transactionId),loftyMoney(r.amountPence)]),'对账后会生成可追溯的记录')+'</section>'+
 '<section class="card"><div class="spread"><h2>3 · 房东出款与审批</h2>'+button('requestPayout','申请房东出款',{tenancy:tId,amountPence:String(loftyAvailable(tId))},!selected||loftyAvailable(tId)<=0)+'</div><p class="muted">出款申请先占用资金，避免重复分配。同一人不能申请并审批；拒绝或失败会释放余额，可以重新申请。</p>'+
 table(['出款单 / 类型','总额 / 管理费 / 净额','申请人','审批','出款状态','操作'],po.map(p=>{
  const ap=rows('approval').find(x=>x.payoutId===p.id);
  return [anchor('payout',p.id)+'<br><span class="muted">'+esc(p.kind||'LANDLORD')+'</span>',[p.grossPence,p.feePence,p.netPence].map(loftyMoney).join(' / '),esc(USERS[p.createdBy]?.name||p.createdBy),ap?anchor('approval',ap.id,ap.status):'—',status(p.status),
   (ap?.status==='PENDING'?button('decidePayout','审批',{payout:p.id,decision:'APPROVED',reason:'金额与来款核对无误'}):'')+
   (ap?.status==='APPROVED'&&p.status==='PENDING'?button('sendPayment','发送模拟付款',{payout:p.id}):'')];
 }),'未申请出款')+'</section>'+
 '<section class="card"><h2>4 · 模拟银行回执与结算快照</h2><p class="muted">PROCESSING 仅表示指令已发送。收到 COMPLETED 回执才会扣减账面银行余额并生成房东结算快照；FAILED 会释放预留。</p>'+
 table(['付款指令','出款单','金额','状态','回执','操作'],pays.map(p=>[anchor('bank-payment',p.id),anchor('payout',p.payoutId),loftyMoney(p.amountPence),status(p.status),esc(p.receiptId||'等待回执'),p.status==='PROCESSING'?button('recordPaymentResult','登记模拟回执',{payment:p.id,result:'COMPLETED',receiptId:'RCPT-'+String(payments.indexOf(p)+1).padStart(3,'0'),reason:'模拟银行确认成功'}):'—']))+
 table(['结算快照','实付房东','管理费','回执','生成时间'],snapshot.map(s=>[anchor('statement',s.id),loftyMoney(s.netPence),loftyMoney(s.feePence),esc(s.receiptId),esc(s.issuedAt)]),'付款成功后生成快照')+'</section>'+
 '<section class="card" id="lofty-verification"><h2>5 · 闭环核验</h2><p class="note '+(a.failures.length?'bad':'ok')+'">'+(a.failures.length?'核验失败：'+a.failures.map(esc).join('；'):'数据一致性通过 · '+a.transactions+' 笔记账交易 / '+a.entries+' 条分录 · 借贷平衡、Link 完整、账单与流水分配一致')+'</p><dl class="kv"><dt>账面客户资金银行余额</dt><dd>'+loftyMoney(a.bank)+'</dd><dt>全部客户资金负债</dt><dd>'+loftyMoney(Object.entries(a.totals).filter(([account])=>account!=="1000").reduce((n,[,value])=>n+value,0))+'（包含押金、供应商、税款、管理费与各类出款预留）</dd><dt>业务结算</dt><dd>'+(a.fullySettled?'全部结清：当前账单、来款、出款及账面客户资金均已完成结算。':a.closed?'房东出款已完成；其他科目余额仍可在业务操作中继续结算。':'尚未完成：继续处理未收账单、未分配来款、资金余额或待完成出款。')+'</dd></dl><p class="muted small-t">未对账流水不计入已入账银行余额。所有支付和银行回执均为本地模拟。</p><details><summary>查看总账分录</summary>'+table(['交易','分类账','科目','借方','贷方'],rows('entry').map(e=>[anchor('transaction',e.transactionId),anchor('ledger',e.ledgerId),esc(e.account),loftyMoney(e.debitPence),loftyMoney(e.creditPence)]))+'</details></section>'+
 '<section class="card"><div class="spread"><h2>沿 Link 查看业务关系</h2>'+B('loftyQuery','查询当前租客的房产','',party)+'</div><p class="muted">实际执行 Party → tenancies → rentalProperty 两跳查询，不需要模型也能验证关系。AIP 可以复用同一组对象和 Link。</p>'+
 (S.ui.loftyQuery?'<pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(S.ui.loftyQuery,null,2))+'</pre>':'')+'</section>'+
 '<section class="card"><h2>更多业务与完整来源</h2><p>本页保留最直接的收租链。供应商、押金、退款、管理费结算、税款分配、续租退租、文档和财务批次在「全部业务操作」中继续办理。完整目录逐项列出 107 张来源表、3 个本地补充模型，以及各表的实现情况。</p><a class="btn" href="#/lofty-operations">全部业务操作</a> <a class="btn" href="#/lofty-catalog">逐项核对完整目录</a> <a class="btn" href="./loftyworks-schema.json" target="_blank" rel="noopener">原始结构快照</a></section>';
}
function loftyAvailable(tenancyId){
 const ledgers=new Set(objectsOf('ledger').filter(l=>l.tenancyId===tenancyId).map(l=>l.id));
 return objectsOf('entry').filter(e=>ledgers.has(e.ledgerId)&&e.account==='2100').reduce((n,e)=>n+Number(e.creditPence)-Number(e.debitPence),0);
}
function installLoftyWorks(){
 if(WORKSPACE_ID!=='loftyworks')return;
 USERS.finance={name:'陈会计 · 财务经理',groups:['managers'],attributes:{organization:'Lofty 演示中介'}};
 Object.assign(ACT,{
  loftyAction(arg){const {id,vals}=JSON.parse(arg);openActionForm('lw-'+id,null,null,vals);},
  loftyQuery(party){S.ui.loftyQuery=aipRunView({id:'loftyTenantProperty',lookup:party},today(),ontologyReadScope());}
 });
 CHANGE.loftyTenancy=element=>{S.ui.loftyTenancy=element.value;S.ui.loftyQuery=null;};
 const style=document.createElement('style');
 style.textContent='.lofty-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.lofty-metrics .card{margin:0 0 12px}.lofty-metrics strong{display:block;font-size:26px;font-variant-numeric:tabular-nums;margin-top:8px}.lofty-stages{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.lofty-stages li{align-items:flex-start!important;border:0!important}@media(max-width:1000px){.lofty-stages{grid-template-columns:1fr 1fr}}@media(max-width:640px){.lofty-metrics,.lofty-stages{grid-template-columns:1fr}}';
 document.head.append(style);
}
