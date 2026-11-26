import {readFileSync,writeFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

// Build a reviewable inventory from the same model and coverage logic as the UI.
// This isolated workspace never reads or modifies browser business records.
const root=new URL('../',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8');
const context=vm.createContext({console,structuredClone,URLSearchParams,URL,Date,setTimeout,clearTimeout,crypto:webcrypto,performance,
 location:{search:'?workspace=loftyworks',hash:'',protocol:'http:'},document:{addEventListener(){},querySelector(){return {addEventListener(){}}}},window:{addEventListener(){}}});
for(const name of ['agent-workspaces.js','loftyworks-workspace.js','loftyworks-catalog-data.js','loftyworks-catalog.js','loftyworks-operations.js','loftyworks-functions.js','loftyworks-operation-functions.js','loftyworks-ui.js','loftyworks-business-ui.js','aip-exposure.js'])vm.runInContext(read(name),context);
const source=read('index.html').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
vm.runInContext(source.slice(0,source.indexOf('installAipExposure()')),context);
const report=vm.runInContext(`loadConfiguredWorkspace();({
 modelVersion:LOFTY_MODEL_VERSION,
 counts:{sourceTables:LOFTY_CATALOG.tables.length,sourceRelationships:WORKSPACE.sourceLinks.length,objectTypes:WORKSPACE.types.length,linkTypes:WORKSPACE.links.length,actions:WORKSPACE.actionTypes.length},
 coverage:loftyCoverage().reduce((result,row)=>(result[row.level]=(result[row.level]||0)+1,result),{}),
 tables:loftyCoverage().map(row=>({source:row.source.id,description:row.source.desc,objectType:row.type.apiName,status:row.level,
  actions:row.operations.map(id=>C().actionTypes['lw-'+id]?.apiName||id),
  fields:row.source.cols.map(([column,sqlType])=>({column,sqlType,property:LOFTY_COLUMN_MAP[row.source.id][column]}))})),
 relationships:WORKSPACE.sourceLinks,
 localSupplementTypes:WORKSPACE.types.filter(t=>!t.source).map(t=>({apiName:t.apiName,description:t.description})),
 nameOnlyAmplifyModels:LOFTY_CATALOG.amplify,nameOnlyServiceDeclarations:LOFTY_CATALOG.ddbsvc,
 limitations:['结构映射不是原系统业务完整性保证。','历史和工程表仅保留结构。','外部银行、签署、通知为模拟。','向量索引、AI 会话源表、生产并发锁、真实身份和 OTP 未接入。','仅有名称的模型没有推断完整 schema。']
})`,context);
writeFileSync(new URL('loftyworks-coverage.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({counts:report.counts,coverage:report.coverage}));
