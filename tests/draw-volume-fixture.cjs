// Narrow fixture migration for pre-rounding regression snapshots. It copies
// only the independently tested draw helpers/renderer, then mechanically wraps
// the original, unchanged volume expressions. Every dose/formula stays original.
const assert=require('node:assert/strict');
function expressionAt(text,start){
  let depth=1,end=start;
  for(;end<text.length&&depth;end++){if(text[end]==='(')depth++;else if(text[end]===')')depth--;}
  assert.equal(depth,0,'Balanced volume expression');return{value:text.slice(start,end-1),end};
}
function migrateDrawFixture(before,after){
  const helperStart=before.indexOf('function mlRound('),helperEnd=before.indexOf('function fmt(',helperStart);
  const currentStart=after.indexOf('function mlRound('),currentEnd=after.indexOf('function fmt(',currentStart);
  assert.ok(helperStart>=0&&helperEnd>helperStart&&currentEnd>currentStart);
  let output=before.slice(0,helperStart)+after.slice(currentStart,currentEnd)+before.slice(helperEnd),singles=0,ranges=0;
  output=output.replace(/`\$\{fmt\(mlRound\([^`]*`/g,template=>{
    const first=expressionAt(template,'`${fmt(mlRound('.length);
    assert.equal(template.slice(first.end,first.end+2),')}','Known original draw wrapper');
    const rest=template.slice(first.end+2,-1);
    if(rest.startsWith('–${fmt(mlRound(')){
      const second=expressionAt(rest,'–${fmt(mlRound('.length);assert.equal(rest.slice(second.end),')} mL','Known original range suffix');ranges++;
      return `drawMlRange(${first.value}, ${second.value})`;
    }
    assert.ok(rest.startsWith(' mL'),'Known original draw unit');const suffix=rest.slice(3);singles++;
    return `drawMl(${first.value}${suffix?', {suffix: `'+suffix+'`}':''})`;
  });
  assert.equal(singles,38,'Every original single draw expression accounted for');assert.equal(ranges,6,'Every original draw range accounted for');
  for(const value of ['Math.min(2 * w, 50)','Math.min(2 * w, 250)','Math.min(1 * w, 50)']){
    const original='`${Math.round('+value+')} mL`';assert.equal(output.split(original).length-1,1,'One original dextrose bypass');output=output.replace(original,'drawMl('+value+')');
  }
  output=output.replace('CONC, stepRound, mlRound };','CONC, stepRound, mlRound, drawInfo, drawMl, drawMlRange };');
  const renderStart=output.indexOf('function drawHTML('),renderEnd=output.indexOf('function rowHTML(',renderStart),currentRender=after.indexOf('function drawHTML('),currentRenderEnd=after.indexOf('function rowHTML(',currentRender);
  assert.ok(renderStart>=0&&renderEnd>renderStart&&currentRenderEnd>currentRender);
  output=output.slice(0,renderStart)+after.slice(currentRender,currentRenderEnd)+output.slice(renderEnd);
  return output;
}
module.exports={migrateDrawFixture};
