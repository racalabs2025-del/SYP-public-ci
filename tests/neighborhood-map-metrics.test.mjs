import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNeighborhoodMapMetrics, neighborhoodScale, neighborhoodColorLevel } from '../src/domain/neighborhoodMapMetrics.js';
const base = { districtId:'fatih', neighborhoods:[{id:'fatih-a',districtId:'fatih'},{id:'fatih-b',districtId:'fatih'}], from:'2026-09-01',to:'2026-09-30',status:'ready' };
const plan = (id,extra={}) => ({id,ilceId:'fatih',mahalleId:'fatih-a',tarih:'2026-09-25',personelId:'p1',birimId:'MEYDAN',...extra});
test('people are unique per neighborhood and district while plans retain their count',()=>{
 const r=buildNeighborhoodMapMetrics({...base,plans:[plan('1'),plan('2'),plan('3',{mahalleId:'fatih-b'}),plan('4',{mahalleId:''}),plan('5',{mahalleId:'unknown',personelId:'p2'})]});
 assert.equal(r.byId['fatih-a'].people,1); assert.equal(r.byId['fatih-a'].plans,2);assert.equal(r.district.people,2); assert.equal(r.district.plans,5);assert.equal(r.districtOnly.plans,1);assert.equal(r.unmatched.plans,1);
});
test('date, unit, archive and cancellation filters prevent unrelated data leaking into counts',()=>{
 const r=buildNeighborhoodMapMetrics({...base,unit:'MEYDAN',plans:[plan('good'),plan('cancel',{iptal:true}),plan('archived',{arsivli:true}),plan('old',{tarih:'2025-09-25'}),plan('other-unit',{birimId:'SAHA'}),plan('other-district',{ilceId:'sisli'})]});
 assert.equal(r.district.plans,1);assert.equal(r.byId['fatih-b'].plans,0);
});
test('joint activities count once and open work follows the explicit date-independent rule',()=>{
 const activity=plan('a',{birimId:'SAHA',katilimciBirimIds:['MEYDAN']});
 const r=buildNeighborhoodMapMetrics({...base,unit:'MEYDAN',activities:[activity,activity],tasks:[plan('open',{tarih:'2025-01-01',durum:'Bekliyor'}),plan('closed',{durum:'Tamamlandı'})]});
 assert.equal(r.district.activities,1);assert.equal(r.byId['fatih-a'].tasks,1);
});
test('unmapped records stay in district totals and active point inventory is independent of date',()=>{
 const r=buildNeighborhoodMapMetrics({...base,servicePoints:[plan('p',{active:true,tarih:''}),plan('p2',{active:true,mahalleId:'sisli-a'}),plan('p3',{active:false})]});
 assert.equal(r.district.points,2);assert.equal(r.unmatched.points,1);assert.equal(r.byId['fatih-a'].points,1);
});
test('unavailable and waiting state never become a zero-value color',()=>{
 const r=buildNeighborhoodMapMetrics({...base,status:'unavailable'});assert.equal(r.status,'unavailable');
 const scale=neighborhoodScale([0,1,9]);assert.equal(neighborhoodColorLevel(0,scale,false),-1);assert.equal(neighborhoodColorLevel(0,scale),0);assert.equal(neighborhoodColorLevel(9,scale),3);
 assert.deepEqual(neighborhoodScale([0,0]).thresholds,[]);
});

test('unknown identifiers cannot be treated as inherited record buckets',()=>{
 const r=buildNeighborhoodMapMetrics({...base,plans:[plan('unknown',{mahalleId:'__proto__'})]});
 assert.equal(r.unmatched.plans,1);assert.equal(r.district.people,1);
});
