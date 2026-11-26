// Every source table is accounted for. Canonical aliases retain source columns in metadata.
const LOFTY_MODEL_VERSION=4;
const LOFTY_EXTRA_SOURCES={
 period:'accounting:tenancy.tenancy_period',periodOwner:'accounting:tenancy.tenancy_period_landlord',ownership:'accounting:accounting.property_landlord',floatTarget:'accounting:accounting.property_float_target',
 credit:'accounting:accounting.credit_note',recurring:'accounting:accounting.recurring_invoice_template',recurringLine:'accounting:accounting.recurring_invoice_template_line_item',invoiceLine:'accounting:accounting.invoice_line_items',arrears:'accounting:accounting.tenant_arrears',
 outbox:'accounting:tenancy.tenancy_event_outbox',note:'accounting:tenancy.private_note',job:'accounting:tenancy.job_run',jobItem:'accounting:tenancy.job_run_items',tenancyAudit:'accounting:tenancy.tenancy_audit',
 coa:'accounting:ledgers.chart_of_account',txKind:'accounting:ledgers.transaction_types',rollup:'accounting:accounting.agency_income_rollup',carried:'accounting:accounting.payout_carried_balance',allocation:'accounting:accounting.allocation_transaction',
 bankDetails:'accounting:users.user_bank_details',member:'accounting:users.users_organisation',role:'accounting:users.roles',roleGrant:'accounting:users.user_roles',privilege:'accounting:users.privileges',rolePrivilege:'accounting:users.role_privileges',priority:'accounting:users.allocation_priorities',userHistory:'accounting:users.users_history',
 bankAccount:'accounting:accounting.bank_account',consent:'accounting:accounting.gocardless_requisition',connection:'accounting:banking_facade.bf_connection',gatewayEvent:'accounting:banking_facade.bf_event',bankSync:'accounting:accounting.bank_statements_sync',bankMatch:'accounting:accounting.bank_statement_line_matched',duplicate:'accounting:accounting.bank_statements_duplicates',
 tracking:'accounting:accounting.bank_payment_tracking',approvalHistory:'accounting:accounting.approval_history',invoiceAudit:'accounting:accounting.audit_invoice',payoutSource:'accounting:accounting.payout_source',payoutParty:'accounting:accounting.payout_parties',dedup:'accounting:accounting.deduplication',
 document:'lw:public.document',docType:'lw:public.document_template_type',docTemplate:'lw:public.document_template',docShare:'lw:public.document_supplier',renewal:'lw:public.end_of_tenancy',feedback:'lw:public.feedback',dismissal:'lw:public.dashboard_skip_item',permission:'lw:public.permission',
 paymentFile:'tlp_payouts:public.payment_files',paymentRecord:'tlp_payouts:public.payment_records',paymentTemplate:'tlp_payouts:public.manual_payment_templates',roleLimit:'tlp_payouts:public.role_limits',operator:'tlp_payouts:public.users',accountList:'tlp_payouts:public.account_list_entries',statementDay:'tlp_payouts:public.statement_days',statementUpload:'tlp_payouts:public.statement_uploads',statementBalance:'tlp_payouts:public.statement_balances',statementMovement:'tlp_payouts:public.statement_movements',otp:'tlp_payouts:public.payment_pay_otp',mfa:'tlp_payouts:public.mfa_step_up',holiday:'tlp_payouts:public.bank_holidays',
 agentDefinition:'accounting:ai.agent_definitions',agentTask:'accounting:ai.agent_task_queue',aiMatch:'accounting:ai.match_results',schemaSnapshot:'accounting:ai.schema_snapshots'
};
const LOFTY_IDS={},LOFTY_APIS={},LOFTY_COLUMN_MAP={};
const LOFTY_ALIASES={
 organisation:{org_id:'id'},party:{usr_id:'id',usr_type:'role',usr_first_name:'name'},property:{p_id:'id',p_name:'name',p_organisation_id:'organisationId',p_primary_landlord_usr_id:'landlordId',p_status:'status'},
 tenancy:{t_id:'id',t_organisation_id:'organisationId',t_property_id:'propertyId',t_status:'status',t_rent:'rentPence',t_currency:'currency',t_period:'period',t_start_date:'start',t_end_date:'end'},participant:{tu_id:'id',tu_t_id:'tenancyId',tu_usr_id:'partyId',tu_user_type:'role',tu_landlord_split:'shareBps'},
 invoice:{inv_id:'id',inv_tenancy_id:'tenancyId',inv_p_id:'propertyId',inv_organisation_id:'organisationId',inv_type:'direction',inv_status:'status',inv_gross_amount:'amountPence',inv_remain_amount:'remainingPence',inv_currency:'currency',inv_payer_usr_id:'tenantId'},
 'bank-line':{bsl_id:'id',bsl_external_id:'externalId',bsl_amount:'amountPence',bsl_currency:'currency',bsl_status:'status',bsl_booking_date:'bookingDate'},reconciliation:{rec_id:'id',rec_inv_id:'invoiceId',rec_bsl_id:'bankLineId',rec_tr_id:'transactionId',rec_organisation_id:'organisationId',rec_amount:'amountPence',rec_status:'status'},
 ledger:{li_id:'id',li_organisation_id:'organisationId',li_tenancy_id:'tenancyId',li_p_id:'propertyId',li_landlord_usr_id:'landlordId'},transaction:{tra_id:'id',tra_organisation_id:'organisationId',tra_date:'date',tra_reversal_parent_id:'reversesId'},entry:{gl_id:'id',gl_tr_id:'transactionId',gl_li_id:'ledgerId',gl_debit:'debitPence',gl_credit:'creditPence'},
 payout:{po_id:'id',po_landlord_id:'landlordId',po_payout_status:'status',po_created_by:'createdBy',po_organisation_id:'organisationId',po_net_payout:'netPence'},approval:{pa_id:'id',pa_payout_id:'payoutId',pa_status:'status',pa_created_by:'createdBy'},'payment-item':{pri_id:'id',pri_payout_id:'payoutId',pri_tenancy_id:'tenancyId',pri_user_id:'partyId',pri_type:'kind',pri_amount:'amountPence',pri_status:'status'},'bank-payment':{bf_payment_id:'id',bf_provider:'provider',bf_idempotency_key:'idempotencyKey',bf_amount:'amountPence',bf_status:'status',bf_status_reason:'reason'},statement:{pss_po_id:'payoutId'},
 period:{tp_t_id:'tenancyId',tp_rent_amount:'amountPence',tp_active_from:'effectiveDate',tp_status:'status'},periodOwner:{tpl_tp_id:'parentId',tpl_usr_id:'partyId',tpl_split:'shareBps'},ownership:{pl_p_id:'propertyId',pl_usr_id:'partyId',pl_shares:'shareBps',pl_valid_from:'effectiveDate'},floatTarget:{pft_p_id:'propertyId',pft_amount:'amountPence'},
 credit:{cn_invoice_id:'invoiceId',cn_tenancy_id:'tenancyId',cn_amount:'amountPence',cn_reason:'reason',cn_status:'status'},recurring:{rit_organisation_id:'organisationId',rit_template_name:'name',rit_p_id:'propertyId',rit_frequency:'frequency',rit_gross_amount:'amountPence',rit_status:'status',rit_start_date:'effectiveDate'},recurringLine:{ritli_rit_id:'parentId',ritli_gross_amount:'amountPence',ritli_description:'name'},invoiceLine:{ili_inv_id:'invoiceId',ili_gross_amount:'amountPence',ili_remain_amount:'remainingPence'},arrears:{ta_tenancy_id:'tenancyId',ta_organisation_id:'organisationId',ta_note:'details',ta_last_reminder_status:'status'},
 outbox:{teo_aggregate_id:'tenancyId',teo_status:'status',teo_payload:'details'},note:{pn_t_id:'tenancyId',pn_note:'details'},job:{jr_name:'name',jr_status:'status'},jobItem:{jri_jr_id:'parentId',jri_status:'status',jri_response:'details'},tenancyAudit:{ta_tenancy_id:'tenancyId',ta_actor_id:'createdBy',ta_changed_fields:'details'},
 bankDetails:{ubd_user_id:'partyId',ubd_organisation_id:'organisationId',ubd_sort_code:'sortCode',ubd_account_number:'accountNumber'},member:{uo_org_id:'organisationId',uo_usr_id:'partyId'},role:{r_name:'name',r_organisation_id:'organisationId'},roleGrant:{ur_user_id:'partyId',ur_role_id:'parentId',ur_org_id:'organisationId'},privilege:{pr_name:'name'},rolePrivilege:{rp_role_id:'parentId',rp_privilege_id:'privilegeId'},priority:{ap_org_id:'organisationId',ap_charge_type:'kind',ap_priority:'priority'},userHistory:{usr_id:'partyId'},
 bankAccount:{ba_organisation_id:'organisationId',ba_name:'name',ba_number:'accountNumber',ba_sort_code:'sortCode',ba_status:'status',ba_gre_id:'consentId'},consent:{gre_status:'status',gre_expires_at:'expiresAt'},connection:{bf_status:'status',bf_provider:'provider',bf_consent_id:'consentId'},gatewayEvent:{bf_payment_id:'paymentId',bf_event_type:'kind',bf_actor_user_login:'createdBy'},bankSync:{bss_ba_id:'bankAccountId',bss_status:'status'},bankMatch:{bslm_bank_statement_id:'bankLineId',bslm_invoice_id:'invoiceId',bslm_status:'status'},duplicate:{bsd_external_id:'externalId'},
 approvalHistory:{ah_approval_id:'parentId',ah_action:'status',ah_performed_by:'createdBy'},invoiceAudit:{ai_invoice_id:'invoiceId',ai_change:'details'},payoutSource:{ps_po_id:'payoutId',ps_gl_id:'entryId'},payoutParty:{pp_po_id:'payoutId',pp_inv_id:'invoiceId'},allocation:{at_po_id:'payoutId',at_transaction_id:'transactionId'},carried:{pcb_po_id:'payoutId',pcb_amount:'amountPence',pcb_description:'reason'},
 document:{document_tenancy_id:'tenancyId',document_property_id:'propertyId',document_organisation_id:'organisationId',expiry:'effectiveDate'},docType:{organisation_id:'organisationId'},docTemplate:{title:'name',organisation_id:'organisationId'},docShare:{user_id:'partyId',document_id:'parentId',organisation_id:'organisationId'},renewal:{tenancy_id:'tenancyId',organisation_id:'organisationId',property_id:'propertyId'},feedback:{text:'details'},
 paymentRecord:{payment_file_id:'parentId',banking_facade_payment_id:'paymentId',approved_by:'decidedBy',uploaded_by:'createdBy',amount:'amountPence'},paymentFile:{batch_total:'amountPence',uploaded_by:'createdBy'},roleLimit:{role_name:'name',file_total_limit:'amountPence',line_item_limit:'lineLimitPence'},paymentTemplate:{payee_name:'name',approved_by:'decidedBy'},accountList:{account_value:'accountNumber',list_type:'kind'},statementUpload:{statement_day_id:'parentId'},statementBalance:{statement_upload_id:'parentId',closing_balance:'amountPence'},statementMovement:{statement_balance_id:'parentId',amount:'amountPence'},holiday:{holiday_date:'effectiveDate',title:'name'},
 agentDefinition:{ad_name:'name',ad_system_prompt:'details',ad_model_id:'provider'},agentTask:{atq_target_agent_id:'parentId',atq_status:'status',atq_prompt:'name',atq_result:'details'},aiMatch:{mr_bank_statement_line_id:'bankLineId',mr_user_id:'partyId',mr_explanation:'details'},schemaSnapshot:{ss_schema_data:'details'}
};
function loftyField(id,type='String',name=id){return [id,name,type];}
function loftyAddFields(type,fields){for(const f of fields)if(!type.properties.some(p=>p[0]===f[0])){type.properties.push(f);for(const row of type.rows)row.push('');}}
(() => {
 const w=AGENT_WORKSPACES.loftyworks,bySource={};
 const pascal=s=>s.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g,(_,a,b)=>b.toUpperCase());
 const canonical={...Object.fromEntries(Object.entries(LOFTY_SOURCE_TABLES).map(([k,v])=>[k,'accounting:'+v])),...LOFTY_EXTRA_SOURCES};
 const aliasesBySource=Object.fromEntries(Object.entries(canonical).map(([k,s])=>[s,k]));
 const primitive=s=>/^(integer|bigint|smallint)/.test(s)?'Integer':/^(numeric|double|real)/.test(s)?'Double':s==='boolean'?'Boolean':s==='date'?'Date':/^timestamp/.test(s)?'Timestamp':'String';
 for(const source of LOFTY_CATALOG.tables){
  const alias=aliasesBySource[source.id],id=alias&&w.types.some(t=>t.id===alias)?alias:'lwsrc-'+(alias||source.id.replace(/[^a-zA-Z0-9]/g,'-')).replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
  let t=w.types.find(t=>t.id===id);
  if(!t){t={id,apiName:'Lw'+pascal(alias||source.id),name:source.t,icon:'▦',title:'id',properties:[loftyField('id')],rows:[]};w.types.push(t);}
  const map={...LOFTY_ALIASES[alias]};
  if(source.pk.length===1&&!map[source.pk[0]])map[source.pk[0]]='id';
  t.source=source;t.alias=alias||'';t.description=source.desc+' 来源：'+source.id+'。空表表示尚无本地模拟记录。';
  const baseIds=new Set(t.properties.map(p=>p[0]));
  for(const [col,sqlType] of source.cols){
   const field=map[col]||col.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());map[col]=field;
   const numeric=/Pence$|Bps$|^priority$/.test(field)?'Integer':primitive(sqlType);
   loftyAddFields(t,[[field,numeric==='Integer'&&/Pence$/.test(field)?field+'（便士）':col,numeric,{description:'来源列 '+col+' ('+sqlType+')'+(/Pence$/.test(field)?'；本地金额换算为整数便士。':'')}]]);
  }
  LOFTY_COLUMN_MAP[source.id]=map;bySource[source.id]=t;
  LOFTY_IDS[alias||source.id]=id;LOFTY_APIS[alias||source.id]=t.apiName[0].toLowerCase()+t.apiName.slice(1);
 }
 // Source edges retain the author's fk/inferred/cross-db distinction. They never manufacture records.
 w.sourceLinks=[];
 LOFTY_CATALOG.edges.forEach((e,i)=>{
  const from=bySource[e.src],to=bySource[e.tgt],property=LOFTY_COLUMN_MAP[e.src][e.col];
  if(!property)throw Error('Source relationship column missing: '+e.src+'.'+e.col);
  from.properties.find(p=>p[0]===property)[2]='String';
  const existing=w.links.find(l=>l.from===from.id&&l.to===to.id&&l.property===property);
  const id=existing?.id||'lw-source-edge-'+i;
  if(!existing)w.links.push({id,from:from.id,to:to.id,property,forward:[e.col+' → '+to.name,'sourceLink'+i],reverse:[from.name+' ← '+e.col,'sourceBack'+i],source:e});
  w.sourceLinks.push({...e,linkId:id});
 });
 w.sourceTypes=bySource;
 // These models have names only in the supplied file. Minimal schemas are explicitly local supplements.
 for(const [alias,name] of [['deposit','押金登记'],['nrl','NRL 分配规则'],['workOrder','维修工单']]){
  const id='lw-local-'+alias.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),apiName='Lw'+pascal(alias);
  const t={id,apiName,name,icon:'▦',title:'id',alias,properties:[loftyField('id')],rows:[],description:'本地补充模型：附件仅列出相关 DynamoDB/Amplify 名称，未提供字段。非原始 schema 复刻。'};
  w.types.push(t);LOFTY_IDS[alias]=id;LOFTY_APIS[alias]=apiName[0].toLowerCase()+apiName.slice(1);
 }
})();
