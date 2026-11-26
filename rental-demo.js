/* Local walkthrough using the existing Ontology and Action runtime.
   Action search is our demo protocol, not Palantir's private implementation. */
AGENT_WORKSPACES['rental-demo']={...AGENT_WORKSPACES.rental,name:'租房闭环体验',
 actions:{...AGENT_WORKSPACES.rental.actions,'renew-lease':{enabled:true}},examples:[]}
function initializeRentalDemo(){
 loadSample()
 const today=new Date().toISOString().slice(0,10)
 const shift=days=>{const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
 const values={lease_id:'L-DEMO-001',house:'H01',tenant:'T01',agent:'A01',start:shift(-30),end:shift(180),monthly_rent:'8500',deposit:'17000'}
 const result=evaluateAction(C().actionTypes['sign-lease'],values,C(),{dry:false})
 if(result.failures.length)throw Error('创建租房样例失败：'+result.failures.join('；'))
 S.rentalDemo={today,originalEnd:values.end,renewEnd:shift(365)}
}
function renderAipReceipt(turn){
 if(!turn.receipt?.length)return ''
 return '<div class="demo-receipt"><h4>执行结果 · 对象与关系变化</h4><table><thead><tr><th>对象 / 属性或关系</th><th>执行前</th><th>执行后</th></tr></thead><tbody>'+turn.receipt.map(r=>'<tr><td>'+esc(r.object)+'<br><strong>'+esc(r.field)+'</strong></td><td>'+esc(r.before||'（空）')+'</td><td>'+esc(r.after||'（空）')+'</td></tr>').join('')+'</tbody></table><p><a href="#/action-log">查看 Action Log →</a></p></div>'
}
function renderRentalDemo(){
 if(WORKSPACE_ID!=='rental-demo'||!S.rentalDemo)return ''
 const demo=S.rentalDemo,lease=findObj('lease','L-DEMO-001',C()),house=findObj('house','H01',C()),busy=aipState().busy
 const ended=lease?.status==='已结束',renewed=lease?.end===demo.renewEnd
 const steps=[
  ['查房与租约','从张三沿 leases → house，查到他租的房屋。','张三现在租哪套房，什么时候到期？',false],
  ['续签租约','AI 搜索 Action、读取定义，然后准备确认表单。','请把张三的租约 L-DEMO-001 续签至 '+demo.renewEnd+'，月租改为 8800。',ended||renewed],
  ['核验续签','重新查询租约，检查到期日和月租。','查询租约 L-DEMO-001 的到期日、月租和状态。',false],
  ['办理退租','一次 Action 更新租约和房屋两个对象。','请为张三的租约 L-DEMO-001 办理提前退租，退租日是 '+demo.today+'。',ended],
  ['核验退租','检查租约已结束、房屋空置、当前租客已清空。','查询租约 L-DEMO-001 的状态和到期日，再沿 house 查询房屋状态和当前租客。',false]
 ]
 return '<style>.demo-flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:16px}.demo-stage{border:1px solid #d6dce5;border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:10px;background:#fff}.demo-stage p{flex:1;margin:0;line-height:1.6;color:#536174}.demo-stage button{min-height:44px;width:100%}.demo-number{color:#536174;font-size:12px}.demo-state{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}.demo-state a{padding:10px 14px;background:#eef3f9;border-radius:6px}.demo-receipt{overflow-x:auto;margin:12px 0}.demo-receipt table{min-width:420px;width:100%;border-collapse:collapse}.demo-receipt th,.demo-receipt td{text-align:left;border-bottom:1px solid #d6dce5;padding:8px}@media(max-width:1100px){.demo-flow{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.demo-flow{grid-template-columns:1fr}}</style>'+
 '<section class="card"><div class="spread"><div><h2>张三的租约：查询 → 续签 → 退租</h2><p class="muted">按顺序体验。操作由真实模型选择工具，提交前会打开确认表单。初始租约由签约 Action 创建。</p></div>'+badge(ended?'已退租':renewed?'已续签':'待续签',ended?'gray':'ok')+'</div>'+
 '<div class="demo-state"><a href="#/explorer/tenant/T01">租客：张三 · T01</a><a href="#/explorer/lease/L-DEMO-001">租约：'+esc(lease?.status)+' · 到期 '+esc(lease?.end)+' · 月租 ¥'+esc(lease?.monthly_rent)+'</a><a href="#/explorer/house/H01">海淀区学区房：'+esc(house?.status)+' · 当前租客 '+esc(house?.current_tenant_id||'无')+'</a><a href="#/action-log">Action Log · '+S.logs.length+' 条</a></div>'+
 '<div class="demo-flow">'+steps.map(([name,description,question,locked],i)=>'<article class="demo-stage"><span class="demo-number">STEP 0'+(i+1)+'</span><strong>'+name+'</strong><p>'+description+'</p>'+B('rentalDemoAsk',name,i===0?'primary':'',question,(busy||locked?'disabled ':'')+'title="'+esc(question)+'"')+'</article>').join('')+'</div></section>'
}
