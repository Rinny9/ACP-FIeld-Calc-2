const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const expected='https://ontariobasehospitalgroup.ca/wp-content/uploads/2026/09/ALS-PCS-v5.4-Companion-Document-v-26.08.27-FINAL.pdf';
const context=vm.createContext({esc:String});
vm.runInContext(html.slice(html.indexOf('const SRC_LINKS='),html.indexOf('function criteriaHTML')),context);
assert.equal(vm.runInContext("srcHref('CD',58)",context),expected+'#page=58');
let count=0;
for(const match of html.matchAll(/CD p\.?\s*(\d+)/g)){
  const label='CD p.'+match[1];
  const link=vm.runInContext(`srcLink(${JSON.stringify(label)})`,context);
  assert.ok(link.includes(`href="${expected}#page=${match[1]}"`),label);count++;
}
assert.ok(count>20,'Checks the shared reference generator against actual Companion citations throughout the app');
assert.ok(!html.includes('/2025/06/ALS-PCS-v5.4-Companion-Document.pdf'));
if(process.env.COMPARE_REF){
  const old=execFileSync('git',['show',`${process.env.COMPARE_REF}:index.html`],{cwd:root,encoding:'utf8'});
  const clinical=s=>s.slice(s.indexOf('const CONC ='),s.indexOf('// ============ APP STATE')).replace(/\r/g,'');
  assert.equal(html.match(/const PEDS54\s*=([^\n]+)/)[1],old.match(/const PEDS54\s*=([^\n]+)/)[1],'Printed chart transcription unchanged');
}
console.log(`PASS: ${count} Companion citations use the current PDF and page target; no old URL.`);
