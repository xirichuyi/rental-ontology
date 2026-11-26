/* A runnable, deliberately scoped rental-money workflow based on the supplied
   2026-11-20 schema snapshot. All records below are synthetic. */
const LOFTY_SOURCE_TABLES = {
 organisation:'users.organisation', party:'users.users', property:'accounting.property',
 tenancy:'tenancy.tenancy', participant:'tenancy.tenancy_user', invoice:'accounting.invoice',
 'bank-line':'accounting.bank_statements_lines', reconciliation:'accounting.reconciliation',
 ledger:'accounting.ledger_identifier', transaction:'ledgers.transaction', entry:'ledgers.general_ledger',
 payout:'accounting.payout', approval:'accounting.payout_approval', 'payment-item':'accounting.payment_run_items_v2',
 'bank-payment':'banking_facade.bf_payment', statement:'accounting.payout_statement_snapshot'
};
(() => {
 const str=(id,name)=>[id,name,'String'];
 const money=(id,name)=>[id,name+'（便士）','Integer'];
 const date=(id,name)=>[id,name,'Date'];
 const type=(id,apiName,name,properties,rows=[],title='id')=>({id,apiName,name,icon:'▦',title,
  description:'来源表 accounting:'+LOFTY_SOURCE_TABLES[id]+'。本工作区使用模拟记录，金额统一为 GBP 便士。',
  properties:[str('id','编号'),...properties],rows});
 const org=str('organisationId','机构');
 const types=[
  type('organisation','Organisation','机构',[str('name','机构名称')],[['ORG-01','Lofty 演示中介'],['ORG-02','另一机构（隔离校验）']],'name'),
  type('party','Party','参与方',[str('name','姓名'),str('role','业务角色'),org],[['TEN-01','张三','TENANT','ORG-01'],['TEN-02','李四','TENANT','ORG-01'],['LL-01','王房东','LANDLORD','ORG-01'],['TEN-X','其他机构租客','TENANT','ORG-02']],'name'),
  type('property','RentalProperty','房产',[str('name','房产名称'),org,str('landlordId','房东'),str('status','出租状态')],[['PROP-01','伦敦 Riverside 12号','ORG-01','LL-01','AVAILABLE'],['PROP-02','伦敦 Garden 8号','ORG-01','LL-01','AVAILABLE']],'name'),
  type('tenancy','Tenancy','租约',[org,str('propertyId','房产'),str('tenantId','主要租客'),str('landlordId','房东'),str('status','租约状态'),date('start','起租日'),date('end','到期日'),money('rentPence','月租金'),['feeBps','管理费率（基点，1000 = 10%）','Integer'],str('currency','币种'),str('period','收租周期')]),
  type('participant','TenancyParticipant','租约参与人',[str('tenancyId','租约'),str('partyId','参与方'),str('role','参与角色'),['shareBps','分成（基点）','Integer']]),
  type('invoice','RentInvoice','租金账单',[org,str('tenancyId','租约'),str('tenantId','付款租客'),str('propertyId','房产'),str('period','账期 YYYY-MM'),str('direction','方向'),money('amountPence','应收'),money('remainingPence','未收'),str('status','账单状态'),str('currency','币种')]),
  type('bank-line','BankLine','银行流水',[org,str('externalId','银行流水唯一号'),str('tenantId','付款租客'),money('amountPence','到账'),money('remainingPence','未分配'),str('status','流水状态'),date('bookingDate','入账日期'),str('currency','币种')]),
  type('reconciliation','Reconciliation','对账记录',[org,str('invoiceId','账单'),str('bankLineId','银行流水'),str('transactionId','记账交易'),money('amountPence','分配金额'),str('status','对账状态')]),
  type('ledger','Ledger','分类账',[org,str('tenancyId','租约'),str('landlordId','房东'),str('propertyId','房产')]),
  type('transaction','LedgerTransaction','记账交易',[org,str('tenancyId','租约'),str('kind','交易类型'),str('reversesId','冲正原交易'),date('date','记账日期')]),
  type('entry','LedgerEntry','总账分录',[str('transactionId','记账交易'),str('ledgerId','分类账'),str('account','科目'),money('debitPence','借方'),money('creditPence','贷方')]),
  type('payout','Payout','房东出款',[org,str('tenancyId','租约'),str('landlordId','房东'),money('grossPence','分配总额'),money('feePence','管理费'),money('netPence','房东净额'),str('status','出款状态'),str('createdBy','申请人'),str('reason','结果说明')]),
  type('approval','PayoutApproval','出款审批',[str('payoutId','出款单'),str('status','审批状态'),str('createdBy','申请人'),str('decidedBy','审批人'),str('reason','审批意见')]),
  type('payment-item','PaymentItem','付款明细',[str('payoutId','出款单'),str('tenancyId','租约'),str('partyId','收款人'),str('kind','付款类型'),money('amountPence','金额'),str('status','付款状态')]),
  type('bank-payment','BankPayment','银行付款指令',[str('payoutId','出款单'),str('paymentItemId','付款明细'),str('idempotencyKey','幂等键'),money('amountPence','金额'),str('status','付款状态'),str('receiptId','银行回执号'),str('reason','结果说明'),str('provider','网关')]),
  type('statement','LandlordStatement','房东结算快照',[str('payoutId','出款单'),str('landlordId','房东'),str('tenancyId','租约'),money('grossPence','本次分配'),money('feePence','管理费'),money('netPence','实付房东'),str('receiptId','回执号'),str('issuedAt','生成时间')])
 ];
 const links=[];
 const camel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 const link=(from,to,property,forward,reverse)=>links.push({id:from+'-'+property,from,to,property,forward:[forward,camel(forward)],reverse:[reverse,camel(reverse)]});
 for(const t of types)if(t.properties.some(p=>p[0]==='organisationId'))link(t.id,'organisation','organisationId','organisation',t.id+'Records');
 link('property','party','landlordId','landlord','properties');
 link('tenancy','property','propertyId','rentalProperty','tenancies');
 link('tenancy','party','tenantId','tenant','tenancies');
 link('tenancy','party','landlordId','landlord','managedTenancies');
 link('participant','tenancy','tenancyId','tenancy','participants');
 link('participant','party','partyId','party','participations');
 link('invoice','tenancy','tenancyId','tenancy','invoices');
 link('invoice','party','tenantId','tenant','invoices');
 link('invoice','property','propertyId','rentalProperty','invoices');
 link('bank-line','party','tenantId','tenant','bankLines');
 link('reconciliation','invoice','invoiceId','invoice','reconciliations');
 link('reconciliation','bank-line','bankLineId','bank-line','reconciliations');
 link('reconciliation','transaction','transactionId','transaction','reconciliations');
 link('ledger','tenancy','tenancyId','tenancy','ledgers');
 link('ledger','party','landlordId','landlord','ledgers');
 link('ledger','property','propertyId','rentalProperty','ledgers');
 link('transaction','tenancy','tenancyId','tenancy','transactions');
 link('entry','transaction','transactionId','transaction','entries');
 link('entry','ledger','ledgerId','ledger','entries');
 link('payout','tenancy','tenancyId','tenancy','payouts');
 link('payout','party','landlordId','landlord','payouts');
 link('approval','payout','payoutId','payout','approvals');
 link('payment-item','payout','payoutId','payout','items');
 link('payment-item','tenancy','tenancyId','tenancy','paymentItems');
 link('payment-item','party','partyId','payee','paymentItems');
 link('bank-payment','payout','payoutId','payout','bankPayments');
 link('bank-payment','payment-item','paymentItemId','item','bankPayments');
 link('statement','payout','payoutId','payout','statements');
 link('statement','party','landlordId','landlord','statements');
 link('statement','tenancy','tenancyId','tenancy','statements');
 const param=(id,name,type='String',extra={})=>({id,name,type,...extra});
 const ref=(id,name,objectType)=>param(id,name,'Object reference',{objectType,default:{kind:'currentObject',value:''}});
 const choice=(id,name,values)=>param(id,name,'String',{constraint:'choice',options:values.join('\n')});
 const actor=param('actor','操作人','String',{hidden:true,default:{kind:'currentUser',value:''}});
 const key=param('requestId','操作编号','String',{hidden:true,default:{kind:'uuid',value:''}});
 const action=(id,name,objectType,description,parameters,manager=false)=>({id:'lw-'+id,apiName:id,name,objectType,description,
  allowRevert:false,allowScenario:false,parameters:[...parameters,actor],
  rules:[{type:'function',fn:'LoftyFunctions.'+id,version:'1.0.0',autoUpgrade:false,inputs:Object.fromEntries([...parameters,actor].map(p=>[p.id,p.id]))}],
  criteria:[{kind:'user',groups:manager?['managers']:['managers','agents'],message:manager?'此步骤需要运营经理审批或执行。':'只读角色不能提交业务操作。'}],
  actionLog:{enabled:true,summary:name},agent:{enabled:true}});
 const actionTypes=[
  action('createTenancy','1 · 建立租约','tenancy','创建 ACTIVE 月租约、租客/房东参与关系和分类账，并将房产标记为在租。',[param('id','租约编号'),ref('property','房产','property'),ref('tenant','租客','party'),param('start','起租日','Date'),param('end','到期日','Date'),param('rentPence','月租（GBP 便士，100000 = £1,000）','Integer'),param('feeBps','管理费率（1000 = 10%）','Integer')]),
  action('issueRent','2 · 开租金账单','tenancy','按租约和账期创建唯一 OUTBOUND 租金账单；未收到的钱不会形成可出款余额。',[ref('tenancy','租约','tenancy'),param('period','账期（YYYY-MM）')]),
  action('receiveBankLine','3 · 导入银行来款','bank-line','登记模拟 GBP 银行来款，按机构和 externalId 去重；此时资金仍未对账。',[ref('tenant','付款租客','party'),param('externalId','银行流水唯一号'),param('amountPence','到账（GBP 便士）','Integer'),param('bookingDate','入账日期','Date')]),
  action('reconcileRent','4 · 对账并入账','invoice','把银行来款分配到同机构、同租客的账单，允许部分到账；同时写对账记录和借贷平衡分录。',[ref('invoice','租金账单','invoice'),ref('bankLine','银行流水','bank-line'),param('amountPence','本次分配（GBP 便士）','Integer'),key]),
  action('requestPayout','5 · 申请房东出款','tenancy','从该租约已入账的房东余额中预留资金，按租约费率拆分管理费和房东净额，创建审批与付款明细。',[ref('tenancy','租约','tenancy'),param('amountPence','本次分配总额（GBP 便士）','Integer'),key]),
  action('decidePayout','6 · 审批出款','payout','经理批准或驳回；申请人不能审批自己的申请。驳回时冲正预留分录，释放资金。',[ref('payout','出款单','payout'),choice('decision','审批决定',['APPROVED','REJECTED']),param('reason','审批意见')],true),
  action('sendPayment','7 · 发送模拟付款','payout','仅已批准的 PENDING 出款可发送。创建带幂等键的模拟银行付款指令；尚未表示付款成功。',[ref('payout','出款单','payout')],true),
  action('recordPaymentResult','8 · 登记模拟银行回执','bank-payment','成功时记出账分录并生成房东结算快照；失败时释放预留资金。重复或冲突回执不会重复记账。',[ref('payment','银行付款指令','bank-payment'),choice('result','回执结果',['COMPLETED','FAILED']),param('receiptId','银行回执唯一号'),param('reason','回执说明')],true)
 ];
 AGENT_WORKSPACES.loftyworks={name:'LoftyWorks · 租赁资金业务',types,links,actionTypes,actions:{},
  views:[{id:'loftyTenantProperty',name:'租客 → 租约 → 房产',description:'按参与方姓名或编号，沿租约查询关联房产。',root:'Party',lookup:['id','name'],links:[{apiName:'tenancies'},{apiName:'rentalProperty'}],columns:[{step:1,property:'id',label:'租约',link:true},{step:2,property:'name',label:'房产',link:true},{step:1,property:'status',label:'租约状态'}]},
   {id:'loftyRentInvoices',name:'租客 → 租约 → 账单',description:'查询指定租客关联租约的租金账单、剩余应收和状态。金额为 GBP 便士。',root:'Party',lookup:['id','name'],links:[{apiName:'tenancies'},{apiName:'invoices'}],columns:[{step:2,property:'id',label:'账单',link:true},{step:2,property:'remainingPence',label:'未收（便士）'},{step:2,property:'status',label:'状态'}]}],
  examples:[{text:'张三关联哪些租约和房产？'},{text:'张三的租金账单还有多少没收？'},{text:'帮我为 TNY-001 开 2026-11 的租金账单。',action:'issueRent'}]};
})();
