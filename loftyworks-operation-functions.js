// Compiled into the existing Function repository; no direct edits to S or localStorage.
const LOFTY_HELPERS_SOURCE=String.raw`
 private api(alias) { return __LOFTY_API_MAP__[alias]; }
 private rows(alias) { return Objects.search()[this.api(alias)]().all(); }
 private get(alias,id) {
  const r=this.rows(alias).find(x=>x.id===id);
  if(!r)throw new UserFacingError("找不到 "+alias+"："+id);return r;
 }
 private make(alias,id,values) {
  const r=Objects.create()[this.api(alias)](id);
  Object.entries(values).forEach(([key,value])=>{r[key]=value;});
  return r;
 }
 private check(condition,message) { if(!condition)throw new UserFacingError(message); }
 private list(text) {
  this.check(typeof text==="string"&&text.length<=100000,"JSON 输入过长。");
  let a;try{a=JSON.parse(text);}catch{throw new UserFacingError("请填写有效 JSON 数组。");}
  this.check(Array.isArray(a)&&a.length>0&&a.length<=100,"每次需要 1–100 条数据。");return a;
 }
 private sameOrg(a,b) { this.check(a.organisationId===b.organisationId,"对象必须属于同一机构。"); }
 private evidence(alias,id,values,actor) { return this.make(alias,id,Object.assign({createdBy:actor,createdAt:new Date().toISOString()},values)); }
 private owners(t) {
  const found=this.rows("ownership").filter(o=>o.propertyId===t.propertyId&&o.status==="ACTIVE");
  return found.length?found:[{partyId:t.landlordId,shareBps:10000}];
 }
 private rentAt(t,period) {
  const periods=this.rows("period").filter(p=>p.tenancyId===t.id&&p.status==="ACTIVE"&&String(p.effectiveDate).slice(0,7)<=period).sort((a,b)=>String(b.effectiveDate).localeCompare(String(a.effectiveDate)));
  return periods.length?periods[0].amountPence:t.rentPence;
 }
 private outbox(t,id,kind,details,actor) { this.evidence("outbox",id,{tenancyId:t.id,organisationId:t.organisationId,kind,status:"PENDING",details},actor); }
 private settleRequest(t,kind,recipient,amount,sourceId,key,actor) {
  this.positive(amount);this.sameOrg(t,recipient);
  const accounts={AGENCY:["2450","2570","AGENCY"],SUPPLIER:["2200","2520","SUPPLIER"],DEPOSIT_SCHEME:["2300","2500","TENANCY_DEPOSIT_SCHEME"],DEPOSIT_REFUND:["2300","2560","TENANT"],REFUND:["2530","2560","TENANT"],HMRC:["2540","2550","AGENCY"]};
  const cfg=accounts[kind];this.check(cfg,"不支持的结算类型。");this.check(recipient.role===cfg[2],"收款方业务角色不匹配。");
  if(kind==="REFUND"||kind==="DEPOSIT_REFUND")this.check(recipient.id===t.tenantId,"退款必须退给该租约租客。");
  this.check(this.balance(t,cfg[0])>=amount,"对应账户可用余额不足。");
  if(kind==="SUPPLIER"){
   const inv=Objects.search().rentInvoice().all().find(i=>i.id===sourceId);
   this.check(inv&&inv.tenancyId===t.id&&inv.direction==="INBOUND"&&inv.supplierId===recipient.id&&inv.status==="FUNDED","请选择同租约已备款的供应商账单。");
   const held=Objects.search().payout().all().filter(p=>p.invoiceId===inv.id&&["PENDING","PROCESSING"].includes(p.status)).reduce((n,p)=>n+p.netPence,0);
   this.check(amount<=inv.remainingPence-held,"供应商账单可支付金额不足或已预留。");
  }
  if(kind.startsWith("DEPOSIT")){
   const d=this.get("deposit",sourceId);this.check(d.tenancyId===t.id,"押金不属于此租约。");
   if(kind==="DEPOSIT_SCHEME")this.check(d.schemeId===recipient.id,"收款方必须为登记的押金机构。");
   const held=Objects.search().payout().all().filter(p=>p.depositId===d.id&&["PENDING","PROCESSING"].includes(p.status)).reduce((n,p)=>n+p.netPence,0);
   this.check(amount<=d.remainingPence-held,"押金剩余可支付金额不足。");
  }
  const p=Objects.create().payout("PO-"+key);p.organisationId=t.organisationId;p.tenancyId=t.id;p.landlordId=t.landlordId;
  p.grossPence=amount;p.feePence=0;p.netPence=amount;p.status="PENDING";p.createdBy=actor;p.reason="";
  p.kind=kind;p.recipientId=recipient.id;p.sourceAccount=cfg[0];p.reserveAccount=cfg[1];
  if(kind==="SUPPLIER")p.invoiceId=sourceId;if(kind.startsWith("DEPOSIT"))p.depositId=sourceId;
  const a=Objects.create().payoutApproval(p.id+"-approval");a.payoutId=p.id;a.status="PENDING";a.createdBy=actor;a.decidedBy="";a.reason="";
  const i=Objects.create().paymentItem(p.id+"-item");i.payoutId=p.id;i.tenancyId=t.id;i.partyId=recipient.id;i.kind=kind;i.amountPence=amount;i.status="PENDING";
  this.post(p.id+"-reserve",t,"RAISE_PAY_"+kind,[[cfg[0],amount,0],[cfg[1],0,amount]],"");this.trackPayout(p);return p;
 }
 private trackPayout(p) {
  this.make("payoutSource",p.id+"-source",{payoutId:p.id,entryId:p.id+"-reserve-0",amountPence:p.grossPence});
  this.make("allocation",p.id+"-allocation",{payoutId:p.id,transactionId:p.id+"-reserve",kind:p.kind||"LANDLORD"});
  if(p.invoiceId)this.make("payoutParty",p.id+"-invoice",{payoutId:p.id,invoiceId:p.invoiceId});
 }
 private settled(p,receipt,actor) {
  if(p.kind==="REFUND"){
   let remainder=p.netPence;
   for(const c of this.rows("credit").filter(c=>c.tenancyId===p.tenancyId&&c.remainingPence>0)){const n=Math.min(remainder,c.remainingPence);c.remainingPence-=n;remainder-=n;if(c.remainingPence===0)c.status="REFUNDED";if(!remainder)break;}
   this.check(remainder===0,"退款负债与 Credit Note 不一致。");
  }
  if(p.kind==="SUPPLIER"){
   const i=Objects.search().rentInvoice().all().find(i=>i.id===p.invoiceId);this.check(i&&i.remainingPence>=p.netPence,"供应商账单余额不一致。");
   i.remainingPence-=p.netPence;i.status=i.remainingPence===0?"RECONCILED":"FUNDED";
   this.rows("workOrder").filter(w=>w.invoiceId===i.id).forEach(w=>{w.status=i.remainingPence===0?"PAID":"PARTIALLY_PAID";});
  }
  if(p.depositId){const d=this.get("deposit",p.depositId);d.remainingPence-=p.netPence;d.status=d.remainingPence===0?(p.kind==="DEPOSIT_SCHEME"?"PROTECTED":"REFUNDED"):"PARTIAL";}
  if(p.kind==="AGENCY")this.evidence("rollup","INC-"+p.id,{organisationId:p.organisationId,tenancyId:p.tenancyId,payoutId:p.id,amountPence:p.netPence,status:"PAID",details:receipt},actor);
 }
 private paymentEvidence(payment,p,actor) {
  this.evidence("gatewayEvent",payment.id+"-receipt",{paymentId:payment.id,kind:"SIMULATED_RECEIPT",status:payment.status,details:payment.receiptId},actor);
  this.evidence("tracking",payment.id+"-tracking",{payoutId:p.id,status:p.status,amountPence:p.netPence,details:payment.reason},actor);
  const record=this.rows("paymentRecord").find(r=>r.paymentId===payment.id);
  if(record){record.status=payment.status;const f=this.get("paymentFile",record.parentId),items=this.rows("paymentRecord").filter(r=>r.parentId===f.id);
   f.status=items.every(r=>r.status==="COMPLETED")?"COMPLETED":items.every(r=>["COMPLETED","FAILED"].includes(r.status))?"COMPLETED_WITH_FAILURES":"PROCESSING";}
 }
 private checkBatchLimit(org,items) {
  const limit=this.rows("roleLimit").find(l=>l.organisationId===org&&l.status==="ACTIVE");this.check(limit,"请先设置机构批次审批限额。");
  this.check(items.reduce((n,p)=>n+p.netPence,0)<=limit.amountPence&&items.every(p=>p.netPence<=limit.lineLimitPence),"超出批次或单笔审批限额。");
 }
 private checkTreasury(payout) {
  const day=String(LocalDate.now());this.check(!this.rows("holiday").some(h=>String(h.effectiveDate).slice(0,10)===day&&h.status==="ACTIVE"),"今天被配置为银行休息日，暂不能发送付款。");
  const rules=this.rows("accountList").filter(r=>r.organisationId===payout.organisationId&&r.status==="ACTIVE");
  const bank=this.rows("bankDetails").find(b=>b.partyId===(payout.recipientId||payout.landlordId)&&b.status==="ACTIVE");
  if(rules.length){this.check(bank,"机构已配置收款清单，请先登记收款账户。");this.check(!rules.some(r=>r.kind==="BLOCK"&&r.accountNumber===bank.accountNumber),"收款账户在禁止清单中。");if(rules.some(r=>r.kind==="ALLOW"))this.check(rules.some(r=>r.kind==="ALLOW"&&r.accountNumber===bank.accountNumber),"收款账户不在允许清单中。");}
  if(payout.batchId){const f=this.get("paymentFile",payout.batchId);this.check(["APPROVED","PROCESSING"].includes(f.status),"出款所在批次尚未完成复核。");}
 }
 private sentEvidence(payout,payment,actor) {
  if(payout.batchId){const f=this.get("paymentFile",payout.batchId),r=this.rows("paymentRecord").find(r=>r.payoutId===payout.id&&r.parentId===f.id);this.check(r,"批次缺少对应明细。");r.paymentId=payment.id;r.status="PROCESSING";payment.batchId=f.id;f.status="PROCESSING";}
 }
 private dispatch(op,v,key,actor) {
  this.identifier(key);
  this.make("dedup","OP-"+key,{name:op,createdBy:actor,createdAt:new Date().toISOString(),status:"APPLIED"});
  if(op==="savePaymentTemplate"){
   this.check(v.recipient.organisationId===v.organisation.id,"收款方须属于同机构。");this.check(/^\d{6}$/.test(v.sortCode)&&/^\d{8}$/.test(v.accountNumber),"账户格式无效。");this.evidence("paymentTemplate","PT-"+key,{organisationId:v.organisation.id,name:v.name,recipientId:v.recipient.id,sortCode:v.sortCode,accountNumber:v.accountNumber,status:"ACTIVE"},actor);return;
  }
  if(op==="usePaymentTemplate"){
   this.sameOrg(v.tenancy,v.template);this.check(v.template.status==="ACTIVE","模板已停用。");this.settleRequest(v.tenancy,v.kind,this.get("party",v.template.recipientId),v.amountPence,v.sourceId,key,actor);return;
  }
  if(op==="setAccountRule"){
   this.check(/^\d{8}$/.test(v.accountNumber),"账户号码需要 8 位。");this.rows("accountList").filter(r=>r.organisationId===v.organisation.id&&r.accountNumber===v.accountNumber&&r.status==="ACTIVE").forEach(r=>{r.status="SUPERSEDED";});this.make("accountList","AL-"+key,{organisationId:v.organisation.id,accountNumber:v.accountNumber,kind:v.kind,name:v.name,status:"ACTIVE"});return;
  }
  if(op==="addBankHoliday"){this.check(!this.rows("holiday").some(h=>String(h.effectiveDate).slice(0,10)===String(v.effectiveDate)),"该日期已登记。");this.make("holiday","HOL-"+key,{effectiveDate:v.effectiveDate,name:v.name,status:"ACTIVE"});return;}
  if(op==="dismissReminder"){this.check(v.itemId.trim()&&v.reason.trim(),"请填写提醒编号和原因。");this.evidence("dismissal","DISMISS-"+key,{parentId:v.itemId,reason:v.reason,status:"DISMISSED"},actor);return;}
  if(op==="pauseRecurring"){this.check(v.template.status==="ACTIVE","模板已停用。");v.template.status="PAUSED";v.template.reason=v.reason;return;}
  if(op==="registerParty"){
   this.check(v.name.trim()&&v.email.includes("@"),"请填写名称和有效邮箱。");
   const p=Objects.create().party("PTY-"+key);p.name=v.name.trim();p.role=v.role;p.email=v.email;p.organisationId=v.organisation.id;
   this.make("member","MEM-"+key,{partyId:p.id,organisationId:p.organisationId});
   this.evidence("userHistory","UH-"+key,{partyId:p.id,details:JSON.stringify({name:p.name,role:p.role,email:p.email})},actor);return;
  }
  if(op==="registerProperty"){
   this.check(v.landlord.role==="LANDLORD"&&v.landlord.organisationId===v.organisation.id,"主房东需要属于该机构。");this.check(v.name.trim(),"房产名称不能为空。");
   const p=Objects.create().rentalProperty("PROP-"+key);p.name=v.name;p.organisationId=v.organisation.id;p.landlordId=v.landlord.id;p.status="AVAILABLE";
   this.make("ownership","OWN-"+key,{propertyId:p.id,partyId:v.landlord.id,shareBps:10000,status:"ACTIVE",effectiveDate:LocalDate.now()});return;
  }
  if(op==="setOwners"){
   const owners=this.list(v.owners);this.check(new Set(owners.map(o=>o.partyId)).size===owners.length,"房东不能重复。");
   owners.forEach(o=>{const p=this.get("party",o.partyId);this.sameOrg(p,v.property);this.check(p.role==="LANDLORD"&&Number.isInteger(o.shareBps)&&o.shareBps>0,"房东或份额无效。");});
   this.check(owners.reduce((n,o)=>n+o.shareBps,0)===10000,"房东份额必须合计 10000 基点。");
   this.rows("ownership").filter(o=>o.propertyId===v.property.id&&o.status==="ACTIVE").forEach(o=>{o.status="SUPERSEDED";});
   owners.forEach((o,n)=>this.make("ownership","OWN-"+key+"-"+n,{propertyId:v.property.id,partyId:o.partyId,shareBps:o.shareBps,status:"ACTIVE",effectiveDate:LocalDate.now()}));v.property.landlordId=owners[0].partyId;return;
  }
  if(op==="saveBankDetails"){
   this.check(/^\d{6}$/.test(v.sortCode)&&/^\d{8}$/.test(v.accountNumber),"Sort code 需要 6 位，账户号码需要 8 位。");
   this.rows("bankDetails").filter(b=>b.partyId===v.party.id&&b.status==="ACTIVE").forEach(b=>{b.status="SUPERSEDED";});
   this.make("bankDetails","BD-"+key,{partyId:v.party.id,organisationId:v.party.organisationId,sortCode:v.sortCode,accountNumber:v.accountNumber,status:"ACTIVE"});
   this.evidence("userHistory","UH-"+key,{partyId:v.party.id,details:"收款资料变更，尾号 "+v.accountNumber.slice(-4)},actor);return;
  }
  if(op==="configureOrganisation"){v.organisation.autoInvoice=v.autoInvoice;v.organisation.paymentsEnabled=v.paymentsEnabled;return;}
  if(op==="grantBusinessRole"){
   this.check(v.party.organisationId===v.organisation.id&&v.party.role==="TEAM","请选择同机构员工。");
   let role=this.rows("role").find(r=>r.name===v.roleName&&r.organisationId===v.organisation.id);
   if(!role)role=this.make("role","ROLE-"+key,{name:v.roleName,organisationId:v.organisation.id,status:"ACTIVE"});
   this.check(!this.rows("roleGrant").some(r=>r.partyId===v.party.id&&r.roleId===role.id),"角色已授予。");
   this.make("roleGrant","GRANT-"+key,{partyId:v.party.id,roleId:role.id,parentId:role.id,organisationId:v.organisation.id,status:"ACTIVE"});
   const privilege=this.make("privilege","PRIV-"+key,{name:v.roleName.includes("Manager")||v.roleName==="Super Admin"?"APPROVE_PAYMENT":"PREPARE_BUSINESS",status:"ACTIVE"});
   this.make("rolePrivilege","RP-"+key,{parentId:role.id,privilegeId:privilege.id});return;
  }
  if(op==="setAllocationPriority"){
   this.check(Number.isInteger(v.priority)&&v.priority>=0&&v.priority<=100,"优先级须为 0–100 的整数。");
   let p=this.rows("priority").find(p=>p.organisationId===v.organisation.id&&p.kind===v.kind);
   if(!p)p=this.make("priority","PRI-"+key,{organisationId:v.organisation.id,kind:v.kind});p.priority=v.priority;p.status="ACTIVE";return;
  }
  if(op==="createRecurringCharge"){
   this.positive(v.amountPence);this.check(v.effectiveDate<=v.endDate&&v.effectiveDate>=v.tenancy.start&&v.endDate<=v.tenancy.end,"模板起止日期须在租约范围内。");
   const r=this.make("recurring","RT-"+key,{name:v.name,tenancyId:v.tenancy.id,organisationId:v.tenancy.organisationId,propertyId:v.tenancy.propertyId,amountPence:v.amountPence,frequency:v.frequency,effectiveDate:v.effectiveDate,endDate:v.endDate,status:"ACTIVE"});
   this.make("recurringLine",r.id+"-line",{parentId:r.id,name:v.name,amountPence:v.amountPence});return;
  }
  if(op==="runBilling"){
   this.check(/^\d{4}-(0[1-9]|1[0-2])$/.test(v.period),"账期格式须为 YYYY-MM。");
   const j=this.evidence("job","JOB-"+key,{name:"AUTO_TENANT_RENT_INVOICE",organisationId:v.organisation.id,status:"COMPLETED",details:v.period},actor);
   for(const t of Objects.search().tenancy().all().filter(t=>t.organisationId===v.organisation.id)){
    const eligible=["ACTIVE","PERIODIC","NOTICE_GIVEN"].includes(t.status)&&String(t.start).slice(0,7)<=v.period&&String(t.end).slice(0,7)>=v.period;
    let result="SKIPPED",detail="租约状态或账期不满足";
    if(eligible){
     if(v.organisation.autoInvoice!==false){
      if(!t.invoices.all().some(i=>i.period===v.period&&(!i.category||i.category==="RENT")&&i.direction==="OUTBOUND"&&i.status!=="DELETED")){
       this.issueRent(t,v.period,actor);result="CREATED";detail="生成租金账单";
       const inv=t.invoices.all().find(i=>i.id==="INV-"+t.id+"-"+v.period);this.make("invoiceLine",inv.id+"-line",{invoiceId:inv.id,amountPence:inv.amountPence,remainingPence:inv.remainingPence,name:"月租金"});
       this.evidence("invoiceAudit",inv.id+"-created",{invoiceId:inv.id,details:"批次 "+j.id},actor);
      }else detail="账单已存在，幂等跳过";
     }else detail="机构自动开租金开关关闭";
     for(const r of this.rows("recurring").filter(r=>r.tenancyId===t.id&&r.status==="ACTIVE")){
      const start=String(r.effectiveDate).slice(0,7),end=String(r.endDate).slice(0,7),months=(Number(v.period.slice(0,4))-Number(start.slice(0,4)))*12+Number(v.period.slice(5))-Number(start.slice(5));
      const interval=r.frequency==="MONTHLY"?1:r.frequency==="QUARTERLY"?3:12;
      if(v.period<start||v.period>end||months%interval!==0)continue;
      const id="INV-"+r.id+"-"+v.period;if(Objects.search().rentInvoice().all().some(i=>i.id===id))continue;
      const i=Objects.create().rentInvoice(id);i.organisationId=t.organisationId;i.tenancyId=t.id;i.tenantId=t.tenantId;i.propertyId=t.propertyId;i.period=v.period;i.direction="OUTBOUND";i.category="SERVICE";i.amountPence=r.amountPence;i.remainingPence=r.amountPence;i.creditPence=0;i.status="UNPAID";i.currency="GBP";i.dueDate=v.period+"-01";i.templateId=r.id;
      this.make("invoiceLine",id+"-line",{invoiceId:id,name:r.name,amountPence:i.amountPence,remainingPence:i.amountPence});result="CREATED";detail+="；生成周期服务费";
     }
    }
    this.make("jobItem",j.id+"-"+t.id,{parentId:j.id,tenancyId:t.id,status:result,details:detail});
   }return;
  }
  if(op==="allocateIncoming"){
   const b=v.bankLine,j=this.evidence("job","JOB-"+key,{name:"AUTO_ALLOCATION_OF_TENANT_FUNDS_TO_RENT",organisationId:b.organisationId,status:"COMPLETED"},actor);
   const priorities=this.rows("priority").filter(p=>p.organisationId===b.organisationId),rank=i=>{const r=priorities.find(p=>p.kind===(i.category||"RENT"));return r?r.priority:50;};
   const invoices=Objects.search().rentInvoice().all().filter(i=>i.organisationId===b.organisationId&&i.tenantId===b.tenantId&&i.direction==="OUTBOUND"&&i.remainingPence>0&&["UNPAID","PARTIALLY_RECONCILED"].includes(i.status)).sort((a,c)=>rank(a)-rank(c)||String(a.dueDate||a.period).localeCompare(String(c.dueDate||c.period)));
   let n=0;for(const i of invoices){if(b.remainingPence<=0)break;const amount=Math.min(b.remainingPence,i.remainingPence);this.reconcileRent(i,b,amount,key+"-"+n,actor);this.make("jobItem",j.id+"-"+n,{parentId:j.id,invoiceId:i.id,status:"ALLOCATED",amountPence:amount});this.make("bankMatch","MATCH-"+key+"-"+n,{invoiceId:i.id,bankLineId:b.id,status:"RECONCILED",amountPence:amount});n++;}return;
  }
  if(op==="issueCredit"){
   const i=v.invoice;this.positive(v.amountPence);this.check(i.direction==="OUTBOUND"&&i.status!=="DELETED","只支持有效应收账单的 Credit Note。");this.check(v.reason.trim(),"需要冲减说明。");
   const prior=i.creditPence||0;this.check(v.amountPence<=i.amountPence-prior,"累计 Credit Note 不能超过原账单金额。");
   const unpaid=Math.min(i.remainingPence,v.amountPence),refund=v.amountPence-unpaid,t=this.tenancyFor(i.tenancyId);
   if(refund>0){this.check(this.balance(t,"2100")>=refund,"已收款已分配，房东可用余额不足以退款。");this.post("CREDIT-"+key,t,"CREDIT_NOTE_REFUND",[["2100",refund,0],["2530",0,refund]],"");}
   i.creditPence=prior+v.amountPence;i.remainingPence-=unpaid;i.status=i.remainingPence===0?"RECONCILED":"PARTIALLY_RECONCILED";
   this.evidence("credit","CN-"+key,{invoiceId:i.id,tenancyId:t.id,amountPence:v.amountPence,remainingPence:refund,refundPence:refund,status:refund?"REFUND_DUE":"APPLIED",mode:refund?"REFUND":"REDUCE",reason:v.reason,details:JSON.stringify({unpaid,refund})},actor);
   this.evidence("invoiceAudit","IA-"+key,{invoiceId:i.id,details:"Credit Note "+v.amountPence},actor);return;
  }
  if(op==="sendArrearsReminder"){
   const unpaid=v.tenancy.invoices.all().filter(i=>i.direction==="OUTBOUND"&&i.remainingPence>0&&String(i.dueDate||i.period+"-01")<=v.asOf);
   this.check(unpaid.length>0,"截至该日期没有到期欠款。");const id="ARR-"+v.tenancy.id+"-"+v.asOf;this.check(!this.rows("arrears").some(a=>a.id===id),"该日期已生成催缴提醒。");
   const amount=unpaid.reduce((n,i)=>n+i.remainingPence,0);this.evidence("arrears",id,{tenancyId:v.tenancy.id,organisationId:v.tenancy.organisationId,amountPence:amount,status:"QUEUED",details:unpaid.map(i=>i.id).join(",")},actor);this.outbox(v.tenancy,"EV-"+id,"ARREARS_REMINDER",String(amount),actor);return;
  }
  if(op==="proposeRenewal"){
   this.positive(v.newRentPence);this.check(["ACTIVE","PERIODIC"].includes(v.tenancy.status),"仅在租合同可续约。");this.check(v.effectiveDate>v.tenancy.start&&v.endDate>v.tenancy.end&&v.effectiveDate<=v.endDate,"续租生效日和到期日不正确。");
   this.check(!this.rows("renewal").some(r=>r.tenancyId===v.tenancy.id&&r.status==="PROPOSED"),"已有待确认续租方案。");
   this.evidence("renewal","REN-"+key,{tenancyId:v.tenancy.id,organisationId:v.tenancy.organisationId,propertyId:v.tenancy.propertyId,effectiveDate:v.effectiveDate,endDate:v.endDate,newRentPence:v.newRentPence,status:"PROPOSED",kind:"RENEWAL"},actor);this.outbox(v.tenancy,"EV-"+key,"RENEWAL_PROPOSED","续租待确认",actor);return;
  }
  if(op==="confirmRenewal"){
   const r=v.renewal,t=this.tenancyFor(r.tenancyId);this.check(r.status==="PROPOSED"&&["ACTIVE","PERIODIC"].includes(t.status),"方案或租约状态不允许确认。");
   this.check(!t.invoices.all().some(i=>i.direction==="OUTBOUND"&&(!i.category||i.category==="RENT")&&i.period>=String(r.effectiveDate).slice(0,7)),"新租金生效区间已经开票，请先处理现有账单再调整方案。");
   const p=this.make("period","PER-"+key,{tenancyId:t.id,amountPence:r.newRentPence,effectiveDate:r.effectiveDate,endDate:r.endDate,status:"ACTIVE"});
   this.owners(t).forEach((o,n)=>this.make("periodOwner",p.id+"-"+n,{parentId:p.id,partyId:o.partyId,shareBps:o.shareBps}));
   t.end=r.endDate;r.status="CONFIRMED";this.evidence("tenancyAudit","TA-"+key,{tenancyId:t.id,details:"续租期段 "+p.id},actor);this.outbox(t,"EV-"+key,"RENEWAL_CONFIRMED",p.id,actor);return;
  }
  if(op==="giveNotice"){
   const t=v.tenancy;this.check(["ACTIVE","PERIODIC"].includes(t.status),"租约当前不能登记通知。");this.check(v.effectiveDate>=t.start&&v.effectiveDate<=t.end,"退租日期必须在租期内。");
   this.check(!t.invoices.all().some(i=>i.period>String(v.effectiveDate).slice(0,7)&&i.direction==="OUTBOUND"&&i.status!=="DELETED"),"通知日之后仍有账单，请先处理。");
   t.status="NOTICE_GIVEN";t.noticeDate=v.effectiveDate;t.end=v.effectiveDate;
   this.evidence("renewal","END-"+key,{tenancyId:t.id,propertyId:t.propertyId,organisationId:t.organisationId,effectiveDate:v.effectiveDate,status:"NOTICE_GIVEN",kind:"VACATE",reason:v.reason},actor);this.evidence("tenancyAudit","TA-"+key,{tenancyId:t.id,details:"退租通知"},actor);this.outbox(t,"EV-"+key,"NOTICE_GIVEN",v.reason,actor);return;
  }
  if(op==="completeVacate"){
   const t=v.tenancy;this.check(t.status==="NOTICE_GIVEN","请先登记退租通知。");
   this.check(!t.invoices.all().some(i=>i.remainingPence>0),"仍有未结清账单。");
   this.check(!Objects.search().payout().all().some(p=>p.tenancyId===t.id&&["PENDING","PROCESSING"].includes(p.status)),"仍有在途出款。");
   this.check(this.ledgerFor(t).entries.all().reduce((n,e)=>n+(e.account==="1000"?e.debitPence-e.creditPence:0),0)===0,"租约仍有资金、管理费、税款或押金待结算。");
   t.status="VACATED";t.rentalProperty.get().status="AVAILABLE";this.rows("renewal").filter(r=>r.tenancyId===t.id&&r.kind==="VACATE").forEach(r=>{r.status="COMPLETED";});
   this.evidence("tenancyAudit","TA-"+key,{tenancyId:t.id,details:"退租完成"},actor);this.outbox(t,"EV-"+key,"VACATED","资金与账单已结清",actor);return;
  }
  if(op==="addTenancyNote"){this.check(v.details.trim(),"备注不能为空。");this.evidence("note","NOTE-"+key,{tenancyId:v.tenancy.id,details:v.details},actor);return;}
  if(op==="recordDeposit"){
   const t=v.tenancy,b=v.bankLine;this.sameOrg(t,b);this.sameOrg(t,v.scheme);this.positive(v.amountPence);
   this.check(b.tenantId===t.tenantId&&v.scheme.role==="TENANCY_DEPOSIT_SCHEME","租客或押金机构不匹配。");this.check(b.remainingPence>=v.amountPence,"来款未分配余额不足。");
   b.remainingPence-=v.amountPence;b.status=b.remainingPence===0?"RECONCILED":"PARTIALLY_RECONCILED";
   this.post("DEP-"+key,t,"PAYMENT_RECEIVED_BANK_DEPOSIT",[["1000",v.amountPence,0],["2300",0,v.amountPence]],"");
   this.make("deposit","DEP-"+key,{tenancyId:t.id,organisationId:t.organisationId,bankLineId:b.id,schemeId:v.scheme.id,amountPence:v.amountPence,remainingPence:v.amountPence,status:"HELD"});return;
  }
  if(op==="issueSupplierBill"){
   this.positive(v.amountPence);this.sameOrg(v.tenancy,v.supplier);this.check(v.supplier.role==="SUPPLIER","请选择供应商。");
   const t=v.tenancy,i=Objects.create().rentInvoice("SUP-"+key);i.organisationId=t.organisationId;i.tenancyId=t.id;i.propertyId=t.propertyId;i.supplierId=v.supplier.id;i.direction="INBOUND";i.category="SUPPLIER";i.amountPence=v.amountPence;i.remainingPence=v.amountPence;i.creditPence=0;i.currency="GBP";i.status="UNPAID";
   this.make("invoiceLine",i.id+"-line",{invoiceId:i.id,name:v.name,amountPence:v.amountPence,remainingPence:v.amountPence});this.evidence("workOrder","WO-"+key,{tenancyId:t.id,propertyId:t.propertyId,supplierId:v.supplier.id,invoiceId:i.id,name:v.name,status:"INVOICED"},actor);return;
  }
  if(op==="fundSupplierBill"){
   const i=v.invoice;this.check(i.direction==="INBOUND"&&i.status==="UNPAID","请选择尚未备款的供应商账单。");const t=this.tenancyFor(i.tenancyId),src=v.source==="FLOAT"?"2420":"2100";this.check(this.balance(t,src)>=i.remainingPence,"来源资金不足。");
   this.post("SUPF-"+key,t,"LANDLORD_TO_SUPPLIER",[[src,i.remainingPence,0],["2200",0,i.remainingPence]],"");i.status="FUNDED";return;
  }
  if(op==="moveFloat"){
   this.positive(v.amountPence);const t=v.tenancy,src=v.direction==="FUND"?"2100":"2420",dst=v.direction==="FUND"?"2420":"2100";this.check(this.balance(t,src)>=v.amountPence,"来源资金不足。");
   this.post("FLOAT-"+key,t,v.direction==="FUND"?"FLOAT_FUNDING":"FLOAT_RELEASE",[[src,v.amountPence,0],[dst,0,v.amountPence]],"");this.evidence("floatTarget","FLOAT-"+key,{propertyId:t.propertyId,tenancyId:t.id,amountPence:v.amountPence,kind:v.direction,status:"APPLIED"},actor);return;
  }
  if(op==="configureNrl"){
   this.check(Number.isInteger(v.rateBps)&&v.rateBps>=0&&v.rateBps<=10000,"比例必须为 0–10000 基点。");
   this.rows("nrl").filter(r=>r.tenancyId===v.tenancy.id&&r.status==="ACTIVE").forEach(r=>{r.status="SUPERSEDED";});this.make("nrl","NRL-"+key,{tenancyId:v.tenancy.id,rateBps:v.rateBps,exempt:String(v.exempt),status:"ACTIVE"});return;
  }
  if(op==="allocateNrl"){
   this.positive(v.taxablePence);const rule=this.rows("nrl").find(r=>r.tenancyId===v.tenancy.id&&r.status==="ACTIVE");this.check(rule,"请先配置模拟分配规则。");this.check(rule.exempt!=="true","该规则标记为豁免。");
   const n=Math.round(v.taxablePence*rule.rateBps/10000);this.positive(n);this.check(this.balance(v.tenancy,"2100")>=n,"可用房东资金不足。");
   this.post("NRL-"+key,v.tenancy,"LANDLORD_TO_NRL_TAX",[["2100",n,0],["2540",0,n]],"");this.make("nrl","NRLA-"+key,{tenancyId:v.tenancy.id,parentId:rule.id,amountPence:n,status:"ALLOCATED",details:"人工确认计提基数 "+v.taxablePence});return;
  }
  if(op==="requestSettlement"){this.settleRequest(v.tenancy,v.kind,v.recipient,v.amountPence,v.sourceId,key,actor);return;}
  if(op==="distributeOwners"){
   this.positive(v.amountPence);const t=v.tenancy,owners=this.owners(t);this.check(this.balance(t,"2100")>=v.amountPence,"房东可用资金不足。");this.check(owners.reduce((n,o)=>n+o.shareBps,0)===10000,"当前房东份额未满 100%。");
   let allocated=0;for(let n=0;n<owners.length;n++){
    const owner=owners[n],gross=n===owners.length-1?v.amountPence-allocated:Math.floor(v.amountPence*owner.shareBps/10000);allocated+=gross;if(gross===0)continue;
    const fee=Math.round(gross*t.feeBps/10000),net=gross-fee;this.check(net>0,"分拆后净额太小。");const p=Objects.create().payout("PO-"+key+"-"+n);
    p.organisationId=t.organisationId;p.tenancyId=t.id;p.landlordId=owner.partyId;p.recipientId=owner.partyId;p.kind="LANDLORD";p.grossPence=gross;p.feePence=fee;p.netPence=net;p.status="PENDING";p.createdBy=actor;p.sourceAccount="2100";p.reserveAccount="2510";
    const a=Objects.create().payoutApproval(p.id+"-approval");a.payoutId=p.id;a.status="PENDING";a.createdBy=actor;
    const i=Objects.create().paymentItem(p.id+"-item");i.payoutId=p.id;i.tenancyId=t.id;i.partyId=owner.partyId;i.kind="LL_PAYOUT_TO_LANDLORD";i.amountPence=net;i.status="PENDING";
    this.post(p.id+"-reserve",t,"RAISE_PAY_LANDLORD",[["2100",gross,0],["2510",0,net],["2450",0,fee]],"");this.trackPayout(p);
   }return;
  }
  if(op==="carryBalance"){this.positive(v.amountPence);this.check(this.balance(v.tenancy,"2100")>=v.amountPence,"不能结转不存在的余额。");this.evidence("carried","CARRY-"+key,{tenancyId:v.tenancy.id,amountPence:v.amountPence,reason:v.reason,status:"RECORDED"},actor);return;}
  if(op==="connectSimulatedBank"){
   this.check(/^\d{6}$/.test(v.sortCode)&&/^\d{8}$/.test(v.accountNumber),"银行账户格式无效。");this.check(v.expiresAt>=LocalDate.now(),"授权到期日已经过去。");
   const c=this.make("consent","CONSENT-"+key,{organisationId:v.organisation.id,status:"ACTIVE",expiresAt:v.expiresAt+"T23:59:59Z"});
   this.make("bankAccount","BA-"+key,{organisationId:v.organisation.id,name:v.name,sortCode:v.sortCode,accountNumber:v.accountNumber,consentId:c.id,status:"ACTIVE"});
   this.make("connection","CONN-"+key,{organisationId:v.organisation.id,consentId:c.id,provider:"SIMULATED",status:"ACTIVE"});return;
  }
  if(op==="syncSimulatedLines"){
   const a=v.account,c=this.get("consent",a.consentId);this.check(a.status==="ACTIVE"&&c.status==="ACTIVE"&&String(c.expiresAt).slice(0,10)>=LocalDate.now(),"账户或授权已失效。");const lines=this.list(v.lines);
   const sync=this.evidence("bankSync","SYNC-"+key,{bankAccountId:a.id,organisationId:a.organisationId,status:"COMPLETED"},actor);
   lines.forEach((r,n)=>{const tenant=this.get("party",r.tenantId);this.sameOrg(a,tenant);this.identifier(r.externalId);this.positive(r.amountPence);this.check(/^\d{4}-\d{2}-\d{2}$/.test(r.bookingDate)&&!Number.isNaN(Date.parse(r.bookingDate)),"入账日期无效。");
    const existing=Objects.search().bankLine().all().find(b=>b.organisationId===a.organisationId&&b.externalId===r.externalId);
    if(existing){this.make("duplicate","DUP-"+key+"-"+n,{externalId:r.externalId,parentId:sync.id,status:"DUPLICATE",details:JSON.stringify(r)});return;}
    this.receiveBankLine(tenant,r.externalId,r.amountPence,r.bookingDate,actor);const b=Objects.search().bankLine().all().find(b=>b.organisationId===a.organisationId&&b.externalId===r.externalId);b.bankAccountId=a.id;b.description=r.description||"";
   });return;
  }
  if(op==="suggestMatches"){
   const b=v.bankLine,candidates=Objects.search().rentInvoice().all().filter(i=>i.tenantId===b.tenantId&&i.organisationId===b.organisationId&&i.direction==="OUTBOUND"&&i.remainingPence>0);
   this.evidence("aiMatch","MATCH-"+key,{bankLineId:b.id,partyId:b.tenantId,status:candidates.length?"SUGGESTED":"NO_MATCH",confidence:candidates.length===1?1:0,details:JSON.stringify({method:"EXACT_TENANT_ID_RULE",invoices:candidates.map(i=>i.id),requiresReview:true})},actor);return;
  }
  if(op==="processOutbox"){this.rows("outbox").filter(e=>e.organisationId===v.organisation.id&&e.status==="PENDING").forEach(e=>{e.status="SENT_SIMULATED";e.reason="本地事件投递，无外部消息";});return;}
  if(op==="createDocumentTemplate"){
   this.check(v.content.trim()&&v.name.trim(),"模板名称与正文不能为空。");const type=this.make("docType","DT-"+key,{organisationId:v.organisation.id,name:"租约文档"});this.make("docTemplate","TPL-"+key,{organisationId:v.organisation.id,name:v.name,content:v.content,status:"ACTIVE",parentId:type.id});return;
  }
  if(op==="generateDocument"){
   this.sameOrg(v.tenancy,v.template);this.check(v.template.status==="ACTIVE","模板已停用。");
   const t=v.tenancy,tenant=this.get("party",t.tenantId),property=this.get("property",t.propertyId),content=v.template.content.replaceAll("{{tenant}}",tenant.name).replaceAll("{{property}}",property.name);
   this.evidence("document","DOC-"+key,{name:v.template.name,tenancyId:t.id,propertyId:t.propertyId,organisationId:t.organisationId,templateId:v.template.id,content,expiresAt:v.expiresAt,status:"DRAFT"},actor);return;
  }
  if(op==="signDocument"){
   const d=v.document;this.check(d.status==="DRAFT"&&v.signer.trim(),"文档须为草稿且填写签署人。");this.check(String(d.expiresAt).slice(0,10)>=LocalDate.now(),"文档已过期。");d.status="SIGNED";d.signedBy=v.signer;
   this.outbox(this.tenancyFor(d.tenancyId),"EV-"+key,"DOCUMENT_SIGNED_SIMULATED",d.id,actor);return;
  }
  if(op==="shareDocument"){
   this.sameOrg(v.document,v.supplier);this.check(v.supplier.role==="SUPPLIER","请选择同机构供应商。");this.check(!this.rows("docShare").some(s=>s.parentId===v.document.id&&s.partyId===v.supplier.id),"已存在共享关系。");
   this.make("docShare","SHARE-"+key,{parentId:v.document.id,partyId:v.supplier.id,organisationId:v.document.organisationId,status:"SHARED"});this.make("permission","PERM-"+key,{parentId:v.document.id,partyId:v.supplier.id,details:"本地共享关系记录，不等于生产访问控制"});return;
  }
  if(op==="checkCompliance"){
   for(const d of this.rows("document").filter(d=>d.organisationId===v.organisation.id&&d.status!=="EXPIRED"&&d.expiresAt&&String(d.expiresAt).slice(0,10)<v.asOf)){d.status="EXPIRED";this.outbox(this.tenancyFor(d.tenancyId),"EXPIRED-"+d.id,"DOCUMENT_EXPIRED",d.id,actor);}return;
  }
  if(op==="submitFeedback"){this.check(v.details.trim(),"反馈不能为空。");this.evidence("feedback","FB-"+key,{details:v.details,status:"OPEN"},actor);return;}
  if(op==="setPaymentLimit"){
   this.positive(v.amountPence);this.positive(v.lineLimitPence);this.check(v.lineLimitPence<=v.amountPence,"单笔上限不能超过批次上限。");this.rows("roleLimit").filter(l=>l.organisationId===v.organisation.id&&l.status==="ACTIVE").forEach(l=>{l.status="SUPERSEDED";});this.make("roleLimit","LIM-"+key,{organisationId:v.organisation.id,name:"managers",amountPence:v.amountPence,lineLimitPence:v.lineLimitPence,status:"ACTIVE"});return;
  }
  if(op==="createPaymentBatch"){
   const ids=this.list(v.payoutIds);this.check(new Set(ids).size===ids.length,"批次中不能重复出款。");const ps=ids.map(id=>this.get("payout",id));ps.forEach(p=>{this.check(p.organisationId===v.organisation.id&&p.status==="PENDING"&&!p.batchId,"出款不属于机构、已发送或已入批。");this.check(p.approvals.all().length===1&&p.approvals.all()[0].status==="APPROVED","所有出款必须已批准。");});this.checkBatchLimit(v.organisation.id,ps);
   const f=this.evidence("paymentFile","FILE-"+key,{organisationId:v.organisation.id,amountPence:ps.reduce((n,p)=>n+p.netPence,0),status:"PENDING_REVIEW"},actor);
   ps.forEach((p,n)=>{p.batchId=f.id;this.evidence("paymentRecord",f.id+"-"+n,{parentId:f.id,payoutId:p.id,amountPence:p.netPence,status:"PENDING_REVIEW"},actor);});return;
  }
  if(op==="approvePaymentBatch"){
   const f=v.file;this.check(f.status==="PENDING_REVIEW"&&f.createdBy!==actor,"批次须待复核且不能由创建人复核。");const items=this.rows("paymentRecord").filter(r=>r.parentId===f.id);this.check(items.length>0,"批次为空。");this.checkBatchLimit(f.organisationId,items.map(r=>this.get("payout",r.payoutId)));
   f.status="APPROVED";f.decidedBy=actor;f.verifiedBy=actor;items.forEach(r=>{r.status="APPROVED";r.decidedBy=actor;});this.evidence("mfa","REVIEW-"+key,{parentId:f.id,status:"SIMULATED_REVIEW",details:"演示角色复核；未进行真实 OTP/MFA"},actor);return;
  }
  if(op==="sendPaymentBatch"){
   const f=v.file;this.check(f.status==="APPROVED","批次必须先复核。");const items=this.rows("paymentRecord").filter(r=>r.parentId===f.id);this.checkBatchLimit(f.organisationId,items.map(r=>this.get("payout",r.payoutId)));
   for(const r of items){const p=this.get("payout",r.payoutId);this.sendPayment(p,actor);r.paymentId="PAY-"+p.id;r.status="PROCESSING";const b=this.get("bank-payment",r.paymentId);b.batchId=f.id;}f.status="PROCESSING";return;
  }
  if(op==="importDailyStatement"){
   const moves=this.list(v.movements);this.check(Number.isSafeInteger(v.openingPence)&&Number.isSafeInteger(v.closingPence)&&moves.every(m=>Number.isSafeInteger(m.signedPence)&&Math.abs(m.signedPence)<=1000000000),"余额和流水必须为安全范围的整数便士。");
   this.check(v.openingPence+moves.reduce((n,m)=>n+m.signedPence,0)===v.closingPence,"期初 + 流水变动不等于期末余额。");this.check(/^[A-Za-z0-9-]{1,40}$/.test(v.accountNumber),"账户编号无效。");
   const id="DAY-"+v.organisation.id+"-"+v.accountNumber+"-"+v.date;this.check(!this.rows("statementDay").some(d=>d.id===id),"该账户该日对账单已导入。");
   const day=this.make("statementDay",id,{organisationId:v.organisation.id,date:v.date,status:"COMPLETED"}),upload=this.evidence("statementUpload","UPLOAD-"+key,{parentId:day.id,status:"IMPORTED"},actor),bal=this.make("statementBalance","BAL-"+key,{parentId:upload.id,accountNumber:v.accountNumber,amountPence:v.closingPence,details:"期初 "+v.openingPence});
   moves.forEach((m,n)=>this.make("statementMovement","MOV-"+key+"-"+n,{parentId:bal.id,signedPence:m.signedPence,details:String(m.description||"")}));return;
  }
  if(op==="queueAssistantTask"){
   this.check(v.name.trim(),"任务问题不能为空。");let agent=this.rows("agentDefinition").find(a=>a.name==="运营辅助任务");if(!agent)agent=this.make("agentDefinition","AGENT-"+key,{name:"运营辅助任务",provider:"EXISTING_AIP_OR_MANUAL",details:"任务结果必须由已有 AIP 工具执行或人工核验，不假装已调用模型。"});
   this.evidence("agentTask","TASK-"+key,{parentId:agent.id,organisationId:v.organisation.id,name:v.name,status:"PENDING"},actor);return;
  }
  if(op==="completeAssistantTask"){this.check(v.task.status==="PENDING"&&v.details.trim(),"任务已结束或结果为空。");v.task.status="MANUAL_REVIEWED";v.task.details=v.details;return;}
  throw new UserFacingError("未知业务操作。");
 }
`;
(() => {
 const w=AGENT_WORKSPACES.loftyworks;
 const apiMap={...LOFTY_APIS};
 const classNames=aliases=>[...new Set(aliases.map(a=>w.types.find(t=>t.id===(LOFTY_IDS[a]||a))?.apiName).filter(Boolean))];
 // Original operations now also emit evidence and settle multiple payment kinds.
 const extraEdits={requestPayout:['payoutSource','allocation','payoutParty'],decidePayout:['approvalHistory'],sendPayment:['gatewayEvent','paymentFile','paymentRecord'],recordPaymentResult:['invoice','credit','workOrder','deposit','rollup','gatewayEvent','tracking','paymentRecord','paymentFile']};
 for(const id of ['requestSettlement','usePaymentTemplate','distributeOwners'])LOFTY_OPERATIONS.find(o=>o.id===id).writes.push('payoutSource','allocation','payoutParty');
 for(const [method,aliases] of Object.entries(extraEdits)){
  const re=new RegExp('@Edits\\(([^)]*)\\)(\\s*@OntologyEditFunction\\(\\)\\s*public '+method+'\\()');
  LOFTY_FUNCTION_SOURCE=LOFTY_FUNCTION_SOURCE.replace(re,(_,list,tail)=>'@Edits('+[...new Set([...list.split(',').map(s=>s.trim()),...classNames(aliases)])].join(', ')+')'+tail);
 }
 const helpers=LOFTY_HELPERS_SOURCE.replace('__LOFTY_API_MAP__',JSON.stringify(apiMap));
 const wrappers=LOFTY_OPERATIONS.map(d=>{
  const parameters=[...d.params,{id:'requestId',type:'String'},{id:'actor',type:'String'}];
  const type=p=>p.type==='Object reference'?w.types.find(t=>t.id===p.objectType).apiName:p.type==='Integer'?'Integer':p.type==='Boolean'?'boolean':p.type==='Date'?'LocalDate':'string';
  return '@Edits('+classNames([...d.writes,'dedup']).join(', ')+')\n@OntologyEditFunction()\npublic '+d.id+'('+parameters.map(p=>p.id+': '+type(p)).join(', ')+'): void { this.dispatch('+JSON.stringify(d.id)+', {'+d.params.map(p=>p.id).join(', ')+'}, requestId, actor); }';
 }).join('\n');
 LOFTY_FUNCTION_SOURCE=LOFTY_FUNCTION_SOURCE.slice(0,LOFTY_FUNCTION_SOURCE.lastIndexOf('}'))+helpers+'\n'+wrappers+'\n}';
})();
