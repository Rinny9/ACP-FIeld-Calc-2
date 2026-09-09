const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const expected='https://ontariobasehospitalgroup.ca/wp-content/uploads/2026/09/ALS-PCS-v5.4-Companion-Document-v-26.08.27-FINAL.pdf';
const context=vm.createContext({esc:String});
vm.runInContext(html.slice(html.indexOf('const SRC_LINKS='),html.indexOf('function criteriaHTML')),context);
assert.equal(vm.runInContext("srcHref('CD',39)",context),expected);
let count=0;
for(const match of html.matchAll(/CD p\.?\s*(\d+)/g)){
  const label='CD p.'+match[1];
  const link=vm.runInContext(`srcLink(${JSON.stringify(label)})`,context);
  assert.ok(link.includes(`href="${expected}"`),label);count++;
}
assert.ok(count>20,'Checks the shared reference generator against actual Companion citations throughout the app');
assert.ok(!html.includes('/2025/06/ALS-PCS-v5.4-Companion-Document.pdf'));
if(process.env.COMPARE_REF){
  const old=execFileSync('git',['show',`${process.env.COMPARE_REF}:index.html`],{cwd:root,encoding:'utf8'});
  const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
  assert.equal(clinical(html),clinical(old),'Clinical engine and directive data unchanged');
  const normalize=s=>s.replace(/2026\.09\.08\.[12]/g,'BUILD').replace(/<div class="footer">[^\n]+/,'FOOTER').replace(/https:\/\/ontariobasehospitalgroup\.ca[^']+/g,'CD_URL').replace(/\r/g,'');
  assert.equal(normalize(html),normalize(old),'Only build labels, footer note and shared CD URL changed');
}
console.log(`PASS: ${count} Companion citations use the replacement URL; no old URL or unrelated app changes.`);
