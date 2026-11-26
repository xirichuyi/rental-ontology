/* Published through the same local Function compiler/runtime as user-authored
   Functions; helpers only read/write runtime Objects, never mutate UI state. */
let LOFTY_FUNCTION_SOURCE = String.raw`import { OntologyEditFunction, Edits, Integer, LocalDate, UserFacingError } from "@foundry/functions-api";
import { Objects, Tenancy, RentalProperty, Party, TenancyParticipant, RentInvoice, BankLine, Reconciliation, Ledger, LedgerTransaction, LedgerEntry, Payout, PayoutApproval, PaymentItem, BankPayment, LandlordStatement } from "@foundry/ontology-api";
export class LoftyFunctions {
 private positive(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 1000000000) throw new UserFacingError("金额必须是 1 到 1,000,000,000 之间的整数便士。");
 }
 private identifier(value) {
  if (!value || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new UserFacingError("编号请使用 1–80 位英文字母、数字、下划线或短横线。");
 }
 private tenancyFor(id) {
  const t = Objects.search().tenancy().all().find(t => t.id === id);
  if (!t) throw new UserFacingError("关联租约不存在。");
  return t;
 }
 private ledgerFor(tenancy) {
  const ledgers = tenancy.ledgers.all();
  if (ledgers.length !== 1) throw new UserFacingError("租约必须有且只有一个分类账。");
  return ledgers[0];
 }
 private balance(tenancy, account) {
  return this.ledgerFor(tenancy).entries.all().filter(e => e.account === account).reduce((n,e) => n + e.creditPence - e.debitPence, 0);
 }
 private post(id, tenancy, kind, entries, reversesId) {
  const debit = entries.reduce((n,e) => n + e[1],0), credit = entries.reduce((n,e) => n + e[2],0);
  if (!Number.isSafeInteger(debit) || debit !== credit || debit <= 0 || entries.some(e => !Number.isSafeInteger(e[1]) || !Number.isSafeInteger(e[2]) || e[1] < 0 || e[2] < 0)) throw new UserFacingError("记账交易借贷不平衡。");
  const ledger = this.ledgerFor(tenancy);
  const tx = Objects.create().ledgerTransaction(id);
  tx.organisationId = tenancy.organisationId; tx.tenancyId = tenancy.id; tx.kind = kind;
  tx.reversesId = reversesId || ""; tx.date = LocalDate.now();
  entries.forEach((values,i) => {
   const e = Objects.create().ledgerEntry(id + "-" + i);
   e.transactionId = tx.id; e.ledgerId = ledger.id; e.account = values[0];
   e.debitPence = values[1]; e.creditPence = values[2];
  });
  return tx;
 }
 private release(payout, suffix) {
  const t = this.tenancyFor(payout.tenancyId);
  this.post(payout.id + suffix,t,"REJECT_RAISE_PAY_LANDLORD",[[payout.reserveAccount||"2510",payout.netPence,0],["2450",payout.feePence,0],[payout.sourceAccount||"2100",0,payout.grossPence]],payout.id + "-reserve");
 }
 @Edits(Tenancy, RentalProperty, TenancyParticipant, Ledger)
 @OntologyEditFunction()
 public createTenancy(id: string, property: RentalProperty, tenant: Party, start: LocalDate, end: LocalDate, rentPence: Integer, feeBps: Integer, actor: string): void {
  this.identifier(id); this.positive(rentPence);
  if (String(start) >= String(end)) throw new UserFacingError("到期日必须晚于起租日。");
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps >= 10000) throw new UserFacingError("管理费率必须为 0–9999 基点。");
  if (tenant.role !== "TENANT") throw new UserFacingError("承租人必须是 TENANT。");
  if (property.organisationId !== tenant.organisationId) throw new UserFacingError("房产和租客必须属于同一机构。");
  const landlord = property.landlord.get();
  if (!landlord || landlord.role !== "LANDLORD" || landlord.organisationId !== property.organisationId) throw new UserFacingError("房产需要同机构的有效房东。");
  if (property.status !== "AVAILABLE" || property.tenancies.all().some(t => ["ACTIVE","PERIODIC"].includes(t.status))) throw new UserFacingError("房产已有在租合同，不能重复签约。");
  const t = Objects.create().tenancy(id);
  t.organisationId = property.organisationId; t.propertyId = property.id; t.tenantId = tenant.id; t.landlordId = landlord.id;
  t.start = start; t.end = end; t.rentPence = rentPence; t.feeBps = feeBps; t.currency = "GBP"; t.period = "MONTHLY"; t.status = "ACTIVE";
  property.status = "LET";
  const a = Objects.create().tenancyParticipant(id + "-tenant");
  a.tenancyId = id; a.partyId = tenant.id; a.role = "TENANT"; a.shareBps = 10000;
  const b = Objects.create().tenancyParticipant(id + "-landlord");
  b.tenancyId = id; b.partyId = landlord.id; b.role = "LANDLORD"; b.shareBps = 10000;
  const l = Objects.create().ledger("LED-" + id);
  l.organisationId = t.organisationId; l.tenancyId = id; l.landlordId = landlord.id; l.propertyId = property.id;
 }
 @Edits(RentInvoice)
 @OntologyEditFunction()
 public issueRent(tenancy: Tenancy, period: string, actor: string): void {
  if (!["ACTIVE","PERIODIC","NOTICE_GIVEN"].includes(tenancy.status)) throw new UserFacingError("仅在租合同可以开租金账单。");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new UserFacingError("账期格式应为 YYYY-MM。");
  if (period < String(tenancy.start).slice(0,7) || period > String(tenancy.end).slice(0,7)) throw new UserFacingError("账期不在租期内。");
  if (tenancy.invoices.all().some(i => i.period === period && (!i.category || i.category === "RENT") && i.direction === "OUTBOUND" && i.status !== "DELETED")) throw new UserFacingError("这个租约的该账期已经开票，不能重复开票。");
  this.positive(tenancy.rentPence);
  const i = Objects.create().rentInvoice("INV-" + tenancy.id + "-" + period);
  i.organisationId = tenancy.organisationId; i.tenancyId = tenancy.id; i.tenantId = tenancy.tenantId; i.propertyId = tenancy.propertyId;
  i.period = period; i.direction = "OUTBOUND"; i.amountPence = this.rentAt(tenancy,period); i.remainingPence = i.amountPence; i.status = "UNPAID"; i.currency = "GBP";
  i.category = "RENT"; i.dueDate = period + "-01"; i.creditPence = 0;
 }
 @Edits(BankLine)
 @OntologyEditFunction()
 public receiveBankLine(tenant: Party, externalId: string, amountPence: Integer, bookingDate: LocalDate, actor: string): void {
  this.identifier(externalId); this.positive(amountPence);
  if (tenant.role !== "TENANT") throw new UserFacingError("来款人必须是租客。");
  if (Objects.search().bankLine().all().some(b => b.organisationId === tenant.organisationId && b.externalId === externalId)) throw new UserFacingError("这笔银行流水已导入，不能重复导入。");
  const b = Objects.create().bankLine("BL-" + tenant.organisationId + "-" + externalId);
  b.organisationId = tenant.organisationId; b.externalId = externalId; b.tenantId = tenant.id;
  b.amountPence = amountPence; b.remainingPence = amountPence; b.status = "UNMATCHED"; b.bookingDate = bookingDate; b.currency = "GBP";
 }
 @Edits(RentInvoice, BankLine, Reconciliation, LedgerTransaction, LedgerEntry)
 @OntologyEditFunction()
 public reconcileRent(invoice: RentInvoice, bankLine: BankLine, amountPence: Integer, requestId: string, actor: string): void {
  this.identifier(requestId); this.positive(amountPence);
  if (invoice.organisationId !== bankLine.organisationId || invoice.tenantId !== bankLine.tenantId) throw new UserFacingError("流水和账单必须属于同机构、同租客。");
  if (invoice.currency !== "GBP" || bankLine.currency !== "GBP" || invoice.direction !== "OUTBOUND") throw new UserFacingError("此流程只支持 GBP 租金应收。");
  if (!["UNPAID","PARTIALLY_RECONCILED"].includes(invoice.status) || !["UNMATCHED","PARTIALLY_RECONCILED"].includes(bankLine.status)) throw new UserFacingError("账单或流水已结清，不能再次分配。");
  if (amountPence > invoice.remainingPence || amountPence > bankLine.remainingPence) throw new UserFacingError("分配金额不能超过未收账单或未分配流水的余额。");
  const t = invoice.tenancy.get();
  if (!t || t.organisationId !== invoice.organisationId || t.tenantId !== invoice.tenantId) throw new UserFacingError("账单关联租约不一致。");
  const tx = this.post("REC-"+requestId,t,"RENT_RECEIVED_BANK",[["1000",amountPence,0],["2100",0,amountPence]],"");
  const r = Objects.create().reconciliation("REC-"+requestId);
  r.organisationId = t.organisationId; r.invoiceId = invoice.id; r.bankLineId = bankLine.id; r.transactionId = tx.id; r.amountPence = amountPence; r.status = "RECONCILED";
  invoice.remainingPence -= amountPence; bankLine.remainingPence -= amountPence;
  invoice.status = invoice.remainingPence === 0 ? "RECONCILED" : "PARTIALLY_RECONCILED";
  bankLine.status = bankLine.remainingPence === 0 ? "RECONCILED" : "PARTIALLY_RECONCILED";
 }
 @Edits(Payout, PayoutApproval, PaymentItem, LedgerTransaction, LedgerEntry)
 @OntologyEditFunction()
 public requestPayout(tenancy: Tenancy, amountPence: Integer, requestId: string, actor: string): void {
  this.identifier(requestId); this.positive(amountPence);
  if (amountPence > this.balance(tenancy,"2100")) throw new UserFacingError("可分配房东余额不足，未收到账单不能出款，已预留资金不能重复使用。");
  const owners = this.owners(tenancy);
  if (owners.length > 1) throw new UserFacingError("多房东房产请使用「按份额申请房东出款」。");
  const landlord = this.get("party",owners[0].partyId);
  this.sameOrg(tenancy,landlord); this.check(landlord.role === "LANDLORD", "当前收款方必须为房东。");
  if (!Number.isSafeInteger(tenancy.feeBps) || tenancy.feeBps < 0 || tenancy.feeBps >= 10000) throw new UserFacingError("租约管理费率无效。");
  const fee = Math.round(amountPence * tenancy.feeBps / 10000), net = amountPence - fee;
  if (net <= 0) throw new UserFacingError("净出款必须大于零。");
  const p = Objects.create().payout("PO-" + requestId);
  p.organisationId = tenancy.organisationId; p.tenancyId = tenancy.id; p.landlordId = landlord.id;
  p.grossPence = amountPence; p.feePence = fee; p.netPence = net; p.status = "PENDING"; p.createdBy = actor; p.reason = "";
  p.kind = "LANDLORD"; p.recipientId = landlord.id; p.sourceAccount = "2100"; p.reserveAccount = "2510";
  const a = Objects.create().payoutApproval(p.id + "-approval");
  a.payoutId = p.id; a.status = "PENDING"; a.createdBy = actor; a.decidedBy = ""; a.reason = "";
  const i = Objects.create().paymentItem(p.id + "-item");
  i.payoutId = p.id; i.tenancyId = tenancy.id; i.partyId = landlord.id; i.kind = "LL_PAYOUT_TO_LANDLORD"; i.amountPence = net; i.status = "PENDING";
  this.post(p.id + "-reserve",tenancy,"RAISE_PAY_LANDLORD",[["2100",amountPence,0],["2510",0,net],["2450",0,fee]],"");
  this.trackPayout(p);
 }
 @Edits(Payout, PayoutApproval, PaymentItem, LedgerTransaction, LedgerEntry)
 @OntologyEditFunction()
 public decidePayout(payout: Payout, decision: string, reason: string, actor: string): void {
  if (!["APPROVED","REJECTED"].includes(decision) || !reason.trim()) throw new UserFacingError("请选择决定并填写审批意见。");
  const approvals = payout.approvals.all();
  if (payout.status !== "PENDING" || approvals.length !== 1 || approvals[0].status !== "PENDING") throw new UserFacingError("此出款已审批或已结束。");
  if (payout.createdBy === actor) throw new UserFacingError("申请人不能审批自己的出款，请切换另一位运营经理。");
  const a = approvals[0]; a.status = decision; a.decidedBy = actor; a.reason = reason;
  this.make("approvalHistory",payout.id + "-decision",{parentId:a.id,status:decision,createdBy:actor,details:reason});
  if (decision === "REJECTED") {
   this.release(payout,"-reject"); payout.status = "REJECTED"; payout.reason = reason;
   payout.items.all().forEach(i => { i.status = "REJECTED"; });
  }
 }
 @Edits(Payout, PaymentItem, BankPayment)
 @OntologyEditFunction()
 public sendPayment(payout: Payout, actor: string): void {
  this.checkTreasury(payout);
  const org = Objects.search().organisation().all().find(o => o.id === payout.organisationId);
  if (org && org.paymentsEnabled === false) throw new UserFacingError("机构付款开关已关闭。");
  const approvals = payout.approvals.all(), items = payout.items.all();
  if (payout.status !== "PENDING" || approvals.length !== 1 || approvals[0].status !== "APPROVED") throw new UserFacingError("出款需要先由另一位经理批准。");
  if (items.length !== 1 || items[0].amountPence !== payout.netPence || payout.bankPayments.all().length) throw new UserFacingError("付款明细异常或付款指令已存在。");
  const b = Objects.create().bankPayment("PAY-" + payout.id);
  b.payoutId = payout.id; b.paymentItemId = items[0].id; b.idempotencyKey = payout.id; b.amountPence = payout.netPence;
  b.status = "PROCESSING"; b.provider = "SIMULATED"; b.receiptId = ""; b.reason = "等待模拟银行回执";
  payout.status = "PROCESSING"; items[0].status = "PROCESSING";
  this.sentEvidence(payout,b,actor);
  this.make("gatewayEvent",b.id + "-sent",{paymentId:b.id,kind:"SIMULATED_SEND",createdBy:actor,details:"本地模拟，未调用银行"});
 }
 @Edits(BankPayment, Payout, PaymentItem, LandlordStatement, LedgerTransaction, LedgerEntry)
 @OntologyEditFunction()
 public recordPaymentResult(payment: BankPayment, result: string, receiptId: string, reason: string, actor: string): void {
  this.identifier(receiptId);
  if (!["COMPLETED","FAILED"].includes(result) || !reason.trim()) throw new UserFacingError("请选择结果并填写回执说明。");
  if (payment.status !== "PROCESSING") throw new UserFacingError("该付款已有终态回执，不能重复或覆盖结果。");
  if (Objects.search().bankPayment().all().some(b => b.receiptId === receiptId)) throw new UserFacingError("银行回执号已使用。");
  const p = payment.payout.get(), i = payment.item.get();
  if (!p || !i || p.status !== "PROCESSING" || i.status !== "PROCESSING" || payment.amountPence !== p.netPence || i.payoutId !== p.id) throw new UserFacingError("付款指令与出款状态不一致。");
  const t = this.tenancyFor(p.tenancyId);
  if (this.balance(t,p.reserveAccount||"2510") < p.netPence) throw new UserFacingError("出款预留资金不足。");
  if (result === "COMPLETED") {
   if (-this.balance(t,"1000") < p.netPence) throw new UserFacingError("分类账银行余额不足。");
   this.post(p.id + "-paid",t,"PAY_"+(p.kind||"LANDLORD"),[[p.reserveAccount||"2510",p.netPence,0],["1000",0,p.netPence]],"");
   if (!p.kind || p.kind === "LANDLORD") {
   const s = Objects.create().landlordStatement("ST-" + p.id);
   s.payoutId = p.id; s.landlordId = p.landlordId; s.tenancyId = t.id;
   s.grossPence = p.grossPence; s.feePence = p.feePence; s.netPence = p.netPence; s.receiptId = receiptId; s.issuedAt = new Date().toISOString();
   }
   this.settled(p,receiptId,actor);
  } else this.release(p,"-failed");
  payment.status = result; payment.receiptId = receiptId; payment.reason = reason; p.status = result; p.reason = reason; i.status = result;
  this.paymentEvidence(payment,p,actor);
 }
}`;
