// Business contracts for the local simulator. External connectors always say SIMULATED.
const LOFTY_OPERATIONS=[];
const LOFTY_OPERATION_GROUPS={setup:'机构与主数据',tenancy:'租约与生命周期',billing:'账单与催缴',funds:'资金分配与付款',bank:'银行与匹配',docs:'文档与合规',tlp:'财务批次与对账单',ai:'辅助任务'};
(() => {
 const w=AGENT_WORKSPACES.loftyworks;
 const common=[['name','名称'],['status','状态'],['organisationId','机构'],['tenancyId','租约'],['propertyId','房产'],['partyId','参与方'],['invoiceId','账单'],['payoutId','出款'],['parentId','上级记录'],['createdBy','创建人'],['createdAt','创建时间'],['details','详情'],['reason','说明'],['kind','业务类别'],['effectiveDate','生效日'],['amountPence','金额（便士）','Integer'],['remainingPence','剩余（便士）','Integer']].map(([id,name,type])=>loftyField(id,type||'String',name));
 for(const [alias,id] of Object.entries(LOFTY_IDS)){
  const t=w.types.find(t=>t.id===id);
  if(!Object.hasOwn(LOFTY_EXTRA_SOURCES,alias)&&!id.startsWith('lw-local-'))continue;
  loftyAddFields(t,common);
 }
 const add=(alias,fields)=>loftyAddFields(w.types.find(t=>t.id===(LOFTY_IDS[alias]||alias)),fields.map(f=>Array.isArray(f)?loftyField(f[0],f[1],f[2]||f[0]):loftyField(f)));
 add('organisation',[['autoInvoice','Boolean'],['paymentsEnabled','Boolean']]);
 add('party',['email','paymentBlocked']);add('tenancy',['autoInvoice','noticeDate']);
 add('invoice',['category','supplierId','dueDate',['creditPence','Integer'],'templateId']);
 add('payout',['kind','recipientId','sourceAccount','reserveAccount','invoiceId','depositId','batchId']);
 add('bank-line',['bankAccountId','description']);add('bank-payment',['batchId']);
 add('ownership',[['shareBps','Integer']]);add('period',['endDate']);
 add('bankDetails',['sortCode','accountNumber']);add('bankAccount',['consentId','sortCode','accountNumber']);add('consent',['expiresAt']);
 add('connection',['consentId','provider']);add('gatewayEvent',['paymentId']);add('bankSync',['bankAccountId']);add('bankMatch',['bankLineId']);add('duplicate',['externalId']);
 add('recurring',['frequency','endDate']);add('credit',['mode',['refundPence','Integer']]);add('document',['content','expiresAt','signedBy','templateId']);
 add('docTemplate',['content']);add('renewal',['endDate',['newRentPence','Integer']]);add('roleGrant',['roleId']);add('rolePrivilege',['privilegeId']);
 add('deposit',['bankLineId','schemeId']);add('nrl',[['rateBps','Integer'],'exempt']);add('workOrder',['supplierId']);
 add('paymentFile',['decidedBy','verifiedBy']);add('paymentRecord',['paymentId','decidedBy']);add('roleLimit',[['lineLimitPence','Integer']]);
 add('paymentTemplate',['sortCode','accountNumber','recipientId']);add('accountList',['accountNumber']);
 add('statementDay',['date']);add('statementBalance',['accountNumber']);add('statementMovement',[['signedPence','Integer']]);
 add('aiMatch',['bankLineId',['confidence','Double']]);add('priority',[['priority','Integer']]);
 const party=w.types.find(t=>t.id==='party');
 for(const [id,name] of [['agent','赵磊 · 租赁专员'],['manager','王敏 · 运营经理'],['finance','陈会计 · 财务经理']]){
  const data={id,name,role:'TEAM',organisationId:'ORG-01'};party.rows.push(party.properties.map(p=>data[p[0]]??''));
 }
 const seed=(alias,data)=>{const t=w.types.find(t=>t.id===LOFTY_IDS[alias]);t.rows.push(t.properties.map(p=>data[p[0]]??''));};
 for(const label of LOFTY_CATALOG.enums.coa){const code=label.split(' ')[0];seed('coa',{id:code,name:label,coaCode:code,coaName:label,status:'REFERENCE'});}
 for(const label of LOFTY_CATALOG.enums.tt){const code=label.split(' ')[0];seed('txKind',{id:code,name:label,ttCode:code,ttName:label,status:'REFERENCE'});}
 seed('schemaSnapshot',{id:'SOURCE-2026-11-20',name:'用户附件结构快照',status:'REFERENCE',details:JSON.stringify({tables:LOFTY_CATALOG.tables.map(t=>({id:t.id,pk:t.pk,cols:t.cols})),edges:LOFTY_CATALOG.edges})});
 for(const t of w.types)for(const p of t.properties)if(/password|secret|codeHash|codeSalt/i.test(p[0]))p[3]={...p[3],visibility:'hidden',description:(p[3]?.description||'')+'；凭据字段默认隐藏，不暴露给 AIP。'};
 // Canonical relationships used by operational Functions, in addition to the source graph.
 const rel=(a,b,field,name)=>{const from=LOFTY_IDS[a]||a,to=LOFTY_IDS[b]||b;if(w.links.some(l=>l.from===from&&l.to===to&&l.property===field))return;
  w.links.push({id:'lw-flow-'+a+'-'+field,from,to,property:field,forward:[name,name],reverse:[a+' records','flow'+a[0].toUpperCase()+a.slice(1)+field[0].toUpperCase()+field.slice(1)],source:{kind:'local',description:'本地业务关系'}});};
 for(const a of ['period','recurring','credit','arrears','outbox','note','tenancyAudit','renewal','deposit','nrl','workOrder'])rel(a,'tenancy','tenancyId','businessTenancy');
 for(const a of ['ownership','floatTarget','document'])rel(a,'property','propertyId','businessProperty');
 for(const a of ['ownership','bankDetails','member','roleGrant','userHistory','docShare','aiMatch'])rel(a,'party','partyId','businessParty');
 for(const a of ['invoiceLine','credit','invoiceAudit','bankMatch','payoutParty'])rel(a,'invoice','invoiceId','businessInvoice');
 for(const a of ['carried','payoutSource','payoutParty','allocation','tracking','paymentRecord'])rel(a,'payout','payoutId','businessPayout');
 rel('jobItem','job','parentId','job');rel('recurringLine','recurring','parentId','template');rel('docShare','document','parentId','document');rel('periodOwner','period','parentId','rentPeriod');
 rel('deposit','bank-line','bankLineId','incomingLine');rel('deposit','party','schemeId','custodian');rel('aiMatch','bank-line','bankLineId','incomingLine');
 rel('bankAccount','consent','consentId','consent');rel('bankSync','bankAccount','bankAccountId','account');rel('connection','consent','consentId','consent');
 rel('document','docTemplate','templateId','template');rel('workOrder','party','supplierId','supplier');
 rel('roleGrant','role','roleId','role');rel('rolePrivilege','privilege','privilegeId','privilege');rel('rolePrivilege','role','parentId','role');
 rel('paymentRecord','paymentFile','parentId','file');rel('paymentRecord','bank-payment','paymentId','payment');rel('gatewayEvent','bank-payment','paymentId','payment');
 rel('paymentTemplate','party','recipientId','recipient');rel('entry','coa','account','chartAccount');
 rel('statementUpload','statementDay','parentId','day');rel('statementBalance','statementUpload','parentId','upload');rel('statementMovement','statementBalance','parentId','balance');
 const p=(id,name,type='String',extra={})=>({id,name,type,...extra});
 const ref=(id,name,alias)=>p(id,name,'Object reference',{objectType:LOFTY_IDS[alias]||alias});
 const choice=(id,name,values)=>p(id,name,'String',{constraint:'choice',options:values.join('\n')});
 const money=p('amountPence','金额（GBP 便士）','Integer'),reason=p('reason','说明'),tenancy=ref('tenancy','租约','tenancy'),org=ref('organisation','机构','organisation');
 const key=p('requestId','操作编号','String',{hidden:true,default:{kind:'uuid'}}),actor=p('actor','操作人','String',{hidden:true,default:{kind:'currentUser'}});
 const define=(id,name,group,params,writes,description,manager=false)=>{
  const definition={id,name,group,params,writes,description,manager};LOFTY_OPERATIONS.push(definition);
  const parameters=[...params,key,actor],objectType=params.find(p=>p.objectType)?.objectType||'organisation';
  w.actionTypes.push({id:'lw-'+id,apiName:id,name,objectType,description,allowRevert:false,allowScenario:false,parameters,
   criteria:[{kind:'user',groups:manager?['managers']:['managers','agents'],message:manager?'需要经理角色。':'只读角色不能提交。'}],
   rules:[{type:'function',fn:'LoftyFunctions.'+id,version:'1.0.0',inputs:Object.fromEntries(parameters.map(p=>[p.id,p.id]))}],actionLog:{enabled:true,summary:name},agent:{enabled:true}});
 };
 define('registerParty','登记参与方','setup',[org,p('name','姓名或公司名'),choice('role','角色',['TENANT','LANDLORD','SUPPLIER','GUARANTOR','TENANCY_DEPOSIT_SCHEME','AGENCY','TEAM']),p('email','邮箱')],['party','member','userHistory'],'登记参与方与所属机构，保留初始资料快照。');
 define('registerProperty','登记房产','setup',[org,p('name','房产名称'),ref('landlord','主房东','party')],['property','ownership'],'建立可出租房产及 100% 初始持有关系。');
 define('setOwners','配置多房东份额','setup',[ref('property','房产','property'),p('owners','份额 JSON，例如 [{"partyId":"LL-01","shareBps":10000}]')],['ownership','property'],'份额必须合计 10000 基点；保留旧版本。出款按当前有效份额分配。',true);
 define('saveBankDetails','登记收款账户','setup',[ref('party','收款方','party'),p('sortCode','Sort code（6 位）'),p('accountNumber','Account number（8 位）')],['bankDetails','userHistory'],'维护模拟收款信息并保存历史；不连接真实银行。',true);
 define('configureOrganisation','配置机构开关','setup',[org,p('autoInvoice','允许自动开租金账单','Boolean'),p('paymentsEnabled','允许发送付款','Boolean')],['organisation'],'机构级跑批与付款开关，关闭付款时保留已有预留。',true);
 define('grantBusinessRole','配置业务角色','setup',[org,ref('party','员工','party'),choice('roleName','角色',['Letting Agent','TLP Staff','TLP Manager','Super Admin'])],['role','roleGrant','privilege','rolePrivilege'],'登记机构角色与权限模型。页面登录身份仍使用本地演示角色，不等于真实认证。',true);
 define('setAllocationPriority','配置费用分配顺序','setup',[org,choice('kind','收费类别',['RENT','SERVICE','DEPOSIT']),p('priority','优先级（小数值优先）','Integer')],['priority'],'配置自动分配来款的账单类别顺序。',true);
 define('createRecurringCharge','建立周期收费模板','billing',[tenancy,p('name','收费说明'),money,choice('frequency','频率',['MONTHLY','QUARTERLY','ANNUALLY']),p('effectiveDate','开始日','Date'),p('endDate','结束日','Date')],['recurring','recurringLine'],'为服务费等建立模板和收费项；按账期跑批生成，不与租金混为一项。');
 define('runBilling','执行开票批次','billing',[org,p('period','账期 YYYY-MM')],['invoice','invoiceLine','job','jobItem','dedup','invoiceAudit'],'按机构开关、租期与模板生成账单；重跑跳过已有账单，并逐条保存结果。');
 define('allocateIncoming','自动分配租客来款','billing',[ref('bankLine','银行流水','bank-line')],['invoice','bank-line','reconciliation','transaction','entry','job','jobItem','bankMatch'],'按机构优先级及到期日顺序分配给该租客账单；剩余款保持未分配，避免跨租客分配。');
 define('issueCredit','开 Credit Note','billing',[ref('invoice','原租金/服务费账单','invoice'),money,reason],['credit','invoice','transaction','entry','invoiceAudit'],'先冲减未收金额；已收部分仅从尚可用房东余额转到退款负债，之后经审批付款退租客。',true);
 define('sendArrearsReminder','生成催缴提醒','billing',[tenancy,p('asOf','检查日期','Date')],['arrears','outbox'],'根据到期未收账单生成催缴事件；本地模拟发送，不会给租客发真实消息。');
 define('proposeRenewal','提出续租方案','tenancy',[tenancy,p('effectiveDate','新租金生效日','Date'),p('endDate','新到期日','Date'),p('newRentPence','新月租（便士）','Integer')],['renewal','outbox'],'创建待确认续租方案，不立即修改已开账单或现租金。');
 define('confirmRenewal','确认续租方案','tenancy',[ref('renewal','续租方案','renewal')],['renewal','tenancy','period','periodOwner','tenancyAudit','outbox'],'确认新租期段；后续跑批使用该账期有效租金，旧账单保持不变。',true);
 define('giveNotice','登记退租通知','tenancy',[tenancy,p('effectiveDate','计划退租日','Date'),reason],['tenancy','renewal','tenancyAudit','outbox'],'租约进入 NOTICE_GIVEN，继续允许到退租日的正常开票和结算。');
 define('completeVacate','完成退租交接','tenancy',[tenancy],['tenancy','property','renewal','tenancyAudit','outbox'],'只有无未收账单、未付款项、账面资金与押金待处理额时才能退租，房产恢复可出租。',true);
 define('addTenancyNote','添加内部备注','tenancy',[tenancy,p('details','备注正文')],['note'],'记录内部运营备注；不生成对外通知。');
 define('recordDeposit','登记押金到账','funds',[tenancy,ref('bankLine','未分配来款','bank-line'),ref('scheme','押金保管机构','party'),money],['deposit','bank-line','transaction','entry'],'从未分配流水中确认押金到账，记入 2300 押金负债；不可作为房东租金出款。');
 define('issueSupplierBill','登记供应商账单','funds',[tenancy,ref('supplier','供应商','party'),money,p('name','费用说明')],['invoice','invoiceLine','workOrder'],'创建 INBOUND 应付和维修工单，尚未表示资金已分配或支付。');
 define('fundSupplierBill','为供应商账单预备资金','funds',[ref('invoice','供应商账单','invoice'),choice('source','资金来源',['LANDLORD','FLOAT'])],['invoice','transaction','entry'],'从可用房东余额或备用金转入 2200 供应商应付账户。',true);
 define('moveFloat','补充或释放房产备用金','funds',[tenancy,money,choice('direction','方向',['FUND','RELEASE'])],['floatTarget','transaction','entry'],'在房东余额与 2420 备用金间划转；备用金不会混入可出款余额。',true);
 define('configureNrl','配置模拟 NRL 分配规则','funds',[tenancy,p('rateBps','分配比例（基点，人工提供）','Integer'),p('exempt','本地标记为豁免','Boolean')],['nrl'],'按人工提供的比例演示税款留存，不推断法定税率或纳税义务。',true);
 define('allocateNrl','留存 NRL 税款','funds',[tenancy,p('taxablePence','人工确认的计提基数（便士）','Integer')],['nrl','transaction','entry'],'从房东可用余额转到 2540 税款负债；每次操作独立留痕。',true);
 define('requestSettlement','申请其他款项结算','funds',[tenancy,choice('kind','类型',['AGENCY','SUPPLIER','DEPOSIT_SCHEME','DEPOSIT_REFUND','REFUND','HMRC']),ref('recipient','收款方','party'),money,p('sourceId','供应商 invoice / 押金 deposit 编号；其他类型填 NA')],['payout','approval','payment-item','transaction','entry'],'管理费、供应商、押金、退款、税款共用预留→分人审批→模拟付款→回执流程，不绕过资金校验。');
 define('distributeOwners','按份额申请房东出款','funds',[tenancy,money],['payout','approval','payment-item','transaction','entry','payoutSource'],'根据房产当前房东份额分拆净额，合计分配精确到便士；每笔均需独立审批。');
 define('carryBalance','登记资金结转','funds',[tenancy,money,reason],['carried'],'记录暂不支付的房东可用余额及原因；不额外增加或扣减资金。');
 define('connectSimulatedBank','建立模拟银行授权','bank',[org,p('name','账户名称'),p('sortCode','Sort code（6 位）'),p('accountNumber','Account number（8 位）'),p('expiresAt','授权到期日','Date')],['bankAccount','consent','connection'],'创建本地授权和账户；没有网络连接或真实 Open Banking 授权。',true);
 define('syncSimulatedLines','同步模拟银行流水','bank',[ref('account','机构银行账户','bankAccount'),p('lines','JSON 数组：externalId、tenantId、amountPence、bookingDate、description')],['bank-line','bankSync','duplicate'],'检查授权有效期；导入来款并记录同步，重复流水保存为重复记录。');
 define('suggestMatches','生成流水匹配建议','bank',[ref('bankLine','流水','bank-line')],['aiMatch'],'使用已有租客标识与账单候选做确定性匹配建议；不调用大模型、不自动入账。');
 define('processOutbox','处理待发事件','tenancy',[org],['outbox'],'模拟事件发布，保留 SENT 状态和原内容；重复执行不重复发布。');
 define('createDocumentTemplate','建立文档模板','docs',[org,p('name','模板名'),p('content','正文模板，支持 {{tenant}} / {{property}}')],['docType','docTemplate'],'建立本地文本模板，合同字段来自已有租约。');
 define('generateDocument','生成租约文档','docs',[tenancy,ref('template','模板','docTemplate'),p('expiresAt','有效期截止','Date')],['document'],'从模板和租约生成可查看的正文，保留模板 Link 与到期日。');
 define('signDocument','登记模拟签署','docs',[ref('document','文档','document'),p('signer','签署人姓名')],['document','outbox'],'将 DRAFT 文档标为 SIGNED；这是模拟签署记录，不会联系 DocuSign。');
 define('shareDocument','共享给供应商','docs',[ref('document','文档','document'),ref('supplier','供应商','party')],['docShare','permission'],'登记同机构供应商共享关系，避免重复共享。');
 define('checkCompliance','检查文档到期','docs',[org,p('asOf','检查日期','Date')],['document','outbox'],'扫描到期文档并生成一次性提醒事件；不把过期文档当合规有效。');
 define('submitFeedback','提交反馈','docs',[p('details','反馈内容')],['feedback'],'保存本地用户反馈记录。');
 define('setPaymentLimit','设置批次审批限额','tlp',[org,money,p('lineLimitPence','单笔上限（便士）','Integer')],['roleLimit'],'本地经理单批次与单笔金额限额，创建和批准批次时都会校验。',true);
 define('createPaymentBatch','创建付款批次','tlp',[org,p('payoutIds','已批准的出款编号 JSON 数组')],['paymentFile','paymentRecord','payout'],'把已批准、未发送出款编入批次，禁止重复入批；按限额校验。');
 define('approvePaymentBatch','复核付款批次','tlp',[ref('file','付款批次','paymentFile')],['paymentFile','paymentRecord','mfa'],'由另一经理复核批次和限额；只记录模拟复核，不冒充 MFA 认证。',true);
 define('sendPaymentBatch','发送模拟付款批次','tlp',[ref('file','付款批次','paymentFile')],['paymentFile','paymentRecord','payout','payment-item','bank-payment','gatewayEvent'],'整批验证后原子生成付款指令；每笔仍要成功/失败回执，才进入批次终态。',true);
 define('importDailyStatement','导入每日对账单','tlp',[org,p('date','对账日期','Date'),p('accountNumber','账户编号'),p('openingPence','期初余额（便士）','Integer'),p('closingPence','期末余额（便士）','Integer'),p('movements','变动 JSON 数组：[{"signedPence":100000,"description":"收款"}]')],['statementDay','statementUpload','statementBalance','statementMovement'],'验证期初 + 变动合计 = 期末后生成对账单层级；同机构账户日期不能重复。',true);
 define('queueAssistantTask','建立辅助任务','ai',[org,p('name','任务问题')],['agentDefinition','agentTask'],'建立待处理任务；可交给已有 AIP，记录人工核对的结果，不伪造模型执行。');
 define('completeAssistantTask','登记辅助任务结果','ai',[ref('task','任务','agentTask'),p('details','已核对结果')],['agentTask'],'记录操作者核对后的结果，标记 MANUAL_REVIEWED，不冒充 LLM 响应。');
 define('savePaymentTemplate','保存常用付款模板','tlp',[org,p('name','模板名'),ref('recipient','收款方','party'),p('sortCode','Sort code（6 位）'),p('accountNumber','Account number（8 位）')],['paymentTemplate'],'保存同机构收款方模板；模板本身不转账，使用时仍必须选择负债来源并审批。',true);
 define('usePaymentTemplate','用模板申请结算','tlp',[tenancy,ref('template','付款模板','paymentTemplate'),choice('kind','类型',['AGENCY','SUPPLIER','DEPOSIT_SCHEME','DEPOSIT_REFUND','REFUND','HMRC']),money,p('sourceId','账单 / 押金编号；其他填 NA')],['payout','approval','payment-item','transaction','entry'],'从模板读取收款方，复用相同余额校验与出款审批流程。');
 define('setAccountRule','设置收款账户规则','tlp',[org,p('accountNumber','账户号码（8 位）'),choice('kind','规则',['ALLOW','BLOCK']),p('name','账户说明')],['accountList'],'BLOCK 账户禁止生成新付款指令；若机构存在 ALLOW 清单则只允许清单内账户。',true);
 define('addBankHoliday','登记模拟银行休息日','tlp',[p('effectiveDate','日期','Date'),p('name','说明')],['holiday'],'仅使用人工录入的日期；当日发送会被拒绝，不内置或推断英国法定假日。',true);
 define('dismissReminder','忽略一项首页提醒','docs',[p('itemId','提醒对应对象编号'),reason],['dismissal'],'仅保存当前操作人的忽略记录；不改变账单欠款或文档合规状态。');
 define('pauseRecurring','暂停周期收费模板','billing',[ref('template','周期模板','recurring'),reason],['recurring'],'暂停后跑批不再生成新收费，已有账单和历史数据保留。');
})();
