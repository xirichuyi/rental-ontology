// Local simulator contract, not a reproduction of Palantir's private prompts.
export const MAX_TOOL_STEPS = 8
const text = { type: 'string' }
export const filtersSchema = {
  type: 'array', maxItems: 8,
  items: { type: 'object', properties: {
    property: text, operator: { type: 'string', enum: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'contains'] }, value: text
  }, required: ['property', 'operator', 'value'], additionalProperties: false }
}
export const ontologyQuerySchema = {
  type: 'object', properties: {
    objectType: { ...text, description: '查询起点的 Object Type API name' },
    mode: { type: 'string', enum: ['count', 'list'] }, filters: filtersSchema,
    properties: { type: 'array', maxItems: 8, items: text, description: '最终对象类型要返回的属性；count 用空数组' },
    related: { anyOf: [{ type: 'object', properties: { link: text, filters: filtersSchema }, required: ['link', 'filters'], additionalProperties: false }, { type: 'null' }],
      description: '按起点是否存在满足条件的关联对象筛选；不改变结果类型。无条件用 null。' },
    traverse: { type: 'array', maxItems: 3, description: 'Search Around：按顺序沿方向 Link 查询，每一步把结果切换到关联对象。直接查询用空数组。',
      items: { type: 'object', properties: { link: text, filters: filtersSchema }, required: ['link', 'filters'], additionalProperties: false } },
    offset: { type: 'integer', minimum: 0, maximum: 10000 },
    limit: { type: 'integer', minimum: 1, maximum: 50 }
  }, required: ['objectType', 'mode', 'filters', 'properties', 'related', 'traverse', 'offset', 'limit'], additionalProperties: false
}
export const actionProposalSchema = {
  type: 'object', properties: {
    actionType: text, mode: { type: 'string', enum: ['new', 'revise'] },
    clear: { type: 'array', items: text, description: '修改草稿时清空的参数 ID；新草稿用空数组' },
    parameters: { type: 'array', items: { type: 'object', properties: { name: text, value: text }, required: ['name', 'value'], additionalProperties: false } }
  }, required: ['actionType', 'mode', 'clear', 'parameters'], additionalProperties: false
}
export const savedViewSchema = { type: 'object', properties: { id: text, lookup: text }, required: ['id', 'lookup'], additionalProperties: false }
export const searchTypesSchema = { type: 'object', properties: { query: text, offset: { type: 'integer', minimum: 0 } }, required: ['query', 'offset'], additionalProperties: false }
export const describeTypeSchema = { type: 'object', properties: { objectType: text }, required: ['objectType'], additionalProperties: false }
export const searchActionsSchema = { type:'object', properties:{query:text,objectType:{...text,description:'可选的适用 Object Type API name；不限类型用空字符串'},offset:{type:'integer',minimum:0}},required:['query','objectType','offset'],additionalProperties:false }
export const describeActionSchema = {type:'object',properties:{actionType:text},required:['actionType'],additionalProperties:false}
const hasActions=input=>!!(input.actionCatalog?.totalActions||input.actions?.length)
const tool = (name, description, parameters) => ({ type: 'function', function: { name, description, parameters } })
export const callFunctionSchema={type:'object',properties:{functionId:text,version:text,parameters:{type:'array',maxItems:32,items:{type:'object',properties:{name:text,value:{...text,description:'标量以字符串传递，数组用 JSON 数组字符串；对象引用传主键。'}},required:['name','value'],additionalProperties:false}}},required:['functionId','version','parameters'],additionalProperties:false}
export function validateFunctionCall(args,functions=[]){
 const f=functions.find(f=>f.id===args?.functionId&&f.version===args.version)
 if(!f||!Array.isArray(args.parameters)||args.parameters.length>32)throw Error('Function 未开放或调用参数无效。')
 const seen=new Set()
 for(const p of args.parameters){if(!f.parameters.some(i=>i.name===p.name)||seen.has(p.name)||typeof p.value!=='string'||p.value.length>4000)throw Error('Function 参数无效。');seen.add(p.name)}
 if(f.parameters.some(p=>!p.optional&&!seen.has(p.name)))throw Error('Function 缺少必填参数。')
 return args
}
export function toolsFor(input) {
  return [
    tool('search_object_types', '按 API name、名称或业务说明搜索已开放的类型目录；空查询分页浏览。只返回类型摘要，不返回对象数据。', searchTypesSchema),
    tool('describe_object_type', '获取已开放类型的属性、主键、方向 Link、目标类型和基数。只有定义，没有对象记录。', describeTypeSchema),
    tool('query_ontology', '按明确的类型和属性查询对象，可执行过滤、统计、分页和沿 Link 多跳查询；结构不清楚时先获取定义。'+(input.toolGuidance?.query_ontology?'\n当前助手的业务说明：\n'+input.toolGuidance.query_ontology:''), ontologyQuerySchema),
    ...(input.functions?.length?[tool('call_function','运行 functions 目录中已开放的只读 Function；遵循对应 description，使用目录中的版本、输入参数和返回类型。不能修改对象。',callFunctionSchema)]:[]),
    ...(input.views?.length ? [tool('run_view', '执行已配置的业务查询视图。lookup 为起始对象的名称或编号。', savedViewSchema)] : []),
    ...(hasActions(input) ? [
      tool('search_actions','按业务词搜索已开放的 Action；可按 Object Type 筛选。只返回候选摘要，每页最多 8 个。空查询可分页浏览。',searchActionsSchema),
      tool('describe_action','读取候选 Action 的适用对象、变更效果与参数。准备动作前必须先读取定义。',describeActionSchema),
      tool('prepare_action', '准备已读取定义的 Action 表单，等待用户核对提交；不会自动修改数据。', actionProposalSchema)
    ] : [])
  ]
}
export function modelInput(input) {
  const { objectTypes = [], actions = [], ...rest } = input
  return { ...rest, objectTypes: objectTypes.slice(0,12).map(({apiName,name,description})=>({apiName,name,description})),
    actionCatalog:{totalActions:actions.length,next:'先用 search_actions 找候选，再用 describe_action 读取参数和变更效果。只有 prepare_action 能准备表单，提交由用户确认。'},
    catalog: { totalTypes: objectTypes.length, includedTypes: Math.min(12,objectTypes.length),
      next: objectTypes.length > 12 ? '用 search_object_types 搜索或分页；属性和 Link 用 describe_object_type 获取。' : '属性和 Link 用 describe_object_type 获取。' } }
}
export function actionDiscoveryResult(name,args,actions){
  if(name==='describe_action'){
    const action=actions.find(a=>a.apiName===args?.actionType)
    if(!action)throw Error('该 Action 未向此助手开放。')
    return {kind:'action_schema',action}
  }
  if(typeof args?.query!=='string'||args.query.length>120||typeof args.objectType!=='string'||!Number.isInteger(args.offset)||args.offset<0)throw Error('Action 搜索参数无效。')
  const terms=args.query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches=actions.filter(a=>(!args.objectType||a.objectType===args.objectType||a.effects?.some(e=>[e.objectType,e.from,e.to,...(e.objectTypes||[]),...(e.implementations||[]).map(i=>i.objectType)].includes(args.objectType)))&&terms.every(q=>[a.apiName,a.name,a.description,a.intent].some(v=>String(v||'').normalize('NFKC').toLowerCase().includes(q))))
  const items=matches.slice(args.offset,args.offset+8).map(({apiName,name,description,objectType})=>({apiName,name,description,objectType}))
  return {kind:'action_catalog',total:matches.length,items,nextOffset:args.offset+items.length<matches.length?args.offset+items.length:null}
}
export function discoveryResult(name, args, catalog) {
  if (name === 'describe_object_type') {
    const found = catalog.find(t=>t.apiName===args?.objectType)
    if (!found) throw Error('该 Object Type 未向此助手开放。')
    return { kind:'schema', objectType: found }
  }
  if (typeof args?.query !== 'string' || args.query.length>120 || !Number.isInteger(args.offset) || args.offset<0) throw Error('类型搜索参数无效。')
  const q=args.query.normalize('NFKC').trim().toLowerCase()
  const matches=catalog.filter(t=>[t.apiName,t.name,t.description].some(v=>String(v||'').toLowerCase().includes(q)))
  const items=matches.slice(args.offset,args.offset+12).map(({apiName,name,description})=>({apiName,name,description}))
  return {kind:'catalog',total:matches.length,items,nextOffset:args.offset+items.length<matches.length?args.offset+items.length:null}
}
export function validateQuery(query, catalog) {
  const getType=name=>{const t=catalog.find(t=>t.apiName===name);if(!t)throw Error('查询类型未开放：'+name);return t}
  const checkFilters=(type, filters)=>{
    if(!Array.isArray(filters)||filters.length>8)throw Error('筛选条件无效。')
    for(const f of filters)if(!type.properties.some(p=>p.apiName===f?.property)||!['eq','ne','lt','lte','gt','gte','contains'].includes(f.operator)||typeof f.value!=='string'||f.value.length>120)throw Error('筛选属性或参数未开放。')
  }
  const follow=(type,step)=>{const links=type.links.filter(l=>l.apiName===step?.link);if(links.length!==1)throw Error('Link 未开放或方向不明确。');const target=getType(links[0].to);checkFilters(target,step.filters);return target}
  let type=getType(query?.objectType)
  checkFilters(type,query.filters)
  if(!['count','list'].includes(query.mode))throw Error('查询模式无效。')
  if(query.related!=null)follow(type,query.related)
  const path=query.traverse??[]
  if(!Array.isArray(path)||path.length>3)throw Error('最多支持三跳查询。')
  for(const step of path)type=follow(type,step)
  if(!Array.isArray(query.properties)||query.properties.length>8||query.properties.some(p=>!type.properties.some(f=>f.apiName===p)))throw Error('结果属性未开放。')
  const offset=query.offset??0,limit=query.limit??15
  if(!Number.isInteger(offset)||offset<0||offset>10000||!Number.isInteger(limit)||limit<1||limit>50)throw Error('分页参数无效。')
  return {...query,traverse:path,offset,limit}
}
