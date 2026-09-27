import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL_ISTANBUL_NEIGHBORHOODS as catalog } from '../src/data/istanbulNeighborhoodsData.js';
const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
const manifest = read('../public/map/neighborhoods/manifest.json');
function inside(p,ring) { let yes=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++) {const a=ring[i],b=ring[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes; }

test('39 district packages account for every catalog entry and retain source provenance',()=>{
 assert.equal(manifest.districts.length,39);
 assert.match(manifest.sourceSha256,/^[a-f0-9]{64}$/);
 assert.ok(Number.isFinite(Date.parse(manifest.sourceTimestamp)));
 assert.equal(manifest.source,'OpenStreetMap contributors');
 assert.equal(manifest.license,'ODbL-1.0');
 const seen=new Set(); const seenOsmIds=new Set(); let count=0;
 for(const d of manifest.districts) {
  const data=read(`../public/map/neighborhoods/${d.id}.json`);
  assert.equal(data.official,false); assert.equal(data.license,'ODbL-1.0');
  const expected=catalog.filter(n=>n.districtId===d.id).map(n=>n.id).sort();
  assert.deepEqual([...data.features.map(f=>f.id),...data.missingIds].sort(),expected);
  for(const f of data.features) {
   assert.ok(!seen.has(f.id)); seen.add(f.id);
   assert.ok(Number.isSafeInteger(f.osmId) && f.osmId > 0,f.id);
   assert.ok(!seenOsmIds.has(f.osmId),f.id); seenOsmIds.add(f.osmId);
   count++;
  }
 }
 assert.equal(count,manifest.matched);assert.equal(manifest.catalogCount,catalog.length);
});
test('all generated label anchors lie inside their actual closed polygon rings',()=>{
 for(const d of manifest.districts)for(const f of read(`../public/map/neighborhoods/${d.id}.json`).features) {
  assert.match(f.path,/^M/);assert.ok(f.path.endsWith('Z'));
  const rings=f.path.split('Z').filter(Boolean).map(p=>{const a=p.match(/-?\d+(?:\.\d+)?/g).map(Number);assert.equal(a.length%2,0);return Array.from({length:a.length/2},(_,i)=>a.slice(i*2,i*2+2));});
  assert.equal(rings.filter(r=>inside(f.anchor,r)).length%2,1,f.id);
  for(const r of rings) {assert.deepEqual(r[0],r.at(-1),f.id);assert.ok(r.flat().every(Number.isFinite));}
 }
});
test('Fatih and Kadıköy have complete boundaries while unresolved district conflicts remain missing',()=>{
 for(const [id,total] of [['fatih',57],['kadikoy',21]]) {const data=read(`../public/map/neighborhoods/${id}.json`);assert.equal(data.features.length,total);assert.deepEqual(data.missingIds,[]);}
 assert.ok(read('../public/map/neighborhoods/sisli.json').missingIds.includes('sisli-muradiye'));
 assert.ok(read('../public/map/neighborhoods/besiktas.json').missingIds.includes('besiktas-rumeli-hisari'));
});
