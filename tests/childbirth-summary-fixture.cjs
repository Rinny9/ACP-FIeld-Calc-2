// Fixed, source-audited exception for Emergency Childbirth's quick-reference
// summary. It changes only these exact two fields in the one ob record.
const assert=require('node:assert/strict');
const approvedChildbirthSummary={
  cond:['Oxytocin: after delivery of all fetuses and/or placenta, <4 h post-placenta'],
  contra:[
    'Oxytocin: allergy or sensitivity to oxytocin',
    'Oxytocin: undelivered fetus',
    'Oxytocin: suspected or known pre-eclampsia with current pregnancy',
    'Oxytocin: eclampsia (seizures) with current pregnancy',
    'Oxytocin: ≥4 hours post placenta delivery'
  ]
};
const fields=[
  {key:'cond',before:"cond:['Oxytocin: after delivery of all fetuses and/or placenta, ≤4 h post-placenta'],",after:"cond:['Oxytocin: after delivery of all fetuses and/or placenta, <4 h post-placenta'],"},
  {key:'contra',before:"contra:['See directive text'],",after:"contra:['Oxytocin: allergy or sensitivity to oxytocin','Oxytocin: undelivered fetus','Oxytocin: suspected or known pre-eclampsia with current pregnancy','Oxytocin: eclampsia (seizures) with current pregnancy','Oxytocin: ≥4 hours post placenta delivery'],"}
];
function normalizeChildbirthSummaryFixture(source){
  const start=source.indexOf("{id:'ob',n:'Emergency Childbirth'"),end=source.indexOf("{id:",start+1);assert.ok(start>=0&&end>start,'One expected Emergency Childbirth source record');
  let record=source.slice(start,end);
  for(const field of fields){
    const matches=[...record.matchAll(new RegExp('^\\s*'+field.key+':[^\\r\\n]+','gm'))];assert.equal(matches.length,1,'One '+field.key+' field in Emergency Childbirth');
    const actual=matches[0][0].trim();assert.ok(actual===field.before||actual===field.after,'Only the fixed, audited '+field.key+' summary may be normalized');
    if(actual===field.before)record=record.replace(field.before,field.after);
  }
  return source.slice(0,start)+record+source.slice(end);
}
module.exports={approvedChildbirthSummary,normalizeChildbirthSummaryFixture};
