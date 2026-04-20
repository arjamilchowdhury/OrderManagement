let extractedRows = [];
let matchedWorkbookBlob = null;
let cachedCleanOrdersRows = null;
let cachedPackingArrayBuffer = null;

function setText(id, value){ document.getElementById(id).textContent = value; }
function setStatus(id, text, kind=''){
  const el = document.getElementById(id);
  el.className = 'status-bar' + (kind ? ' status-' + kind : '');
  el.textContent = text;
}
function downloadBlob(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function normalizeHeader(v){ return String(v || '').trim().toLowerCase(); }
function normText(v){ return String(v ?? '').replace(/\s+/g,' ').trim().toUpperCase(); }
function numericOnly(v){ return /^\d+$/.test(String(v || '').trim()); }
function qtyNumber(v){
  const s = String(v ?? '').replace(/,/g,'').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function orderIdFromAny(s){ const m = String(s ?? '').match(/(\d+)/); return m ? m[1] : ''; }
function normMaterialKey(v){ return String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function rowValueByHeader(rowObj, names){
  const keys = Object.keys(rowObj || {});
  for (const wanted of names){
    const hit = keys.find(k => normalizeHeader(k) === normalizeHeader(wanted));
    if (hit) return rowObj[hit];
  }
  return '';
}
function canonicalPlayerNumber(v){
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s.toUpperCase();
}
function samePlayerNumber(a,b){
  const ca = canonicalPlayerNumber(a);
  const cb = canonicalPlayerNumber(b);
  return ca !== '' && cb !== '' && ca === cb;
}
function getAllValuesByPrefixes(rowObj, prefixes){
  const out = [];
  const seen = new Set();
  const keys = Object.keys(rowObj || {});
  for (const key of keys){
    const normalizedKey = normalizeHeader(key);
    for (const prefix of prefixes){
      if (normalizedKey.startsWith(normalizeHeader(prefix))){
        const raw = String(rowObj[key] ?? '').trim();
        if (!raw) continue;
        const dedupeKey = raw.toUpperCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(raw);
        break;
      }
    }
  }
  return out;
}
function firstUsefulValue(values){
  for (const v of (values || [])){
    const s = String(v || '').trim();
    if (s) return s;
  }
  return '';
}

function getCandidateConfidenceScore(cand){
  let score = 0;
  if (getAllValuesByPrefixes(cand, ['Player Number']).length) score += 1;
  if (getAllValuesByPrefixes(cand, ['Player Initial']).length) score += 1;
  if (getAllValuesByPrefixes(cand, ['Player Name']).length) score += 1;
  if (getAllValuesByPrefixes(cand, ['Player Name Raw']).length) score += 1;
  if (String(cand['Extraction Status'] || '').toUpperCase() === 'OK') score += 1;
  return score;
}

const HIDDEN_PREVIEW_COLUMNS = new Set([
  'Player Number Confidence',
  'Player Initial Confidence',
  'Player Name Confidence',
  'Player Number Source',
  'Player Initial Source',
  'Player Name Source'
]);

function visibleColumnsForPreview(rows){
  if (!rows || !rows.length) return [];
  return Object.keys(rows[0]).filter(c => !HIDDEN_PREVIEW_COLUMNS.has(String(c || '').trim()));
}

function renderTable(containerId, rows, mismatchColumn){
  const root = document.getElementById(containerId);
  if (!rows || !rows.length){ root.innerHTML = ''; return; }
  const cols = visibleColumnsForPreview(rows);
  let html = '<table><thead><tr>' + cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('') + '</tr></thead><tbody>';
  rows.slice(0,1000).forEach(r=>{
    const mm = mismatchColumn && String(r[mismatchColumn] || '').toUpperCase() === 'MISMATCH';
    const exStatus = String(r['Extraction Status'] || '').toUpperCase();
    const un = exStatus === 'UNCERTAIN';
    const unpaid = exStatus === 'UNPAID NAME';
    const rowCls = mm ? 'mismatch' : (unpaid ? 'unpaid' : (un ? 'uncertain' : ''));
    html += `<tr class="${rowCls}">` + cols.map(c=>{
      const v = r[c] ?? '';
      let cls = '';
      if (String(v).toUpperCase() === 'OK') cls = 'text-ok';
      if (String(v).toUpperCase() === 'MISMATCH') cls = 'text-bad';
      if (String(v).toUpperCase() === 'UNCERTAIN') cls = 'text-warn';
      return `<td class="${cls}">${escapeHtml(v)}</td>`;
    }).join('') + '</tr>';
  });
  html += '</tbody></table>';
  root.innerHTML = html;
}

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

document.getElementById('cleanOrdersFile').addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  cachedCleanOrdersRows = null;
  if (!f) return;
  try{
    setStatus('matchStatus', 'Reading cleaned order file into memory...', 'warn');
    cachedCleanOrdersRows = await readOrderRows(f);
    setStatus('matchStatus', 'Cleaned order file loaded. Now upload the packing list and click Match.', 'ok');
  }catch(err){
    console.error(err);
    setStatus('matchStatus', 'Could not read cleaned order file: ' + err.message, 'bad');
  }
});

document.getElementById('packingFile').addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  cachedPackingArrayBuffer = null;
  if (!f) return;
  try{
    setStatus('matchStatus', 'Reading packing list workbook into memory...', 'warn');
    cachedPackingArrayBuffer = await f.arrayBuffer();
    setStatus('matchStatus', 'Packing list loaded. Click Match when both files are ready.', 'ok');
  }catch(err){
    console.error(err);
    setStatus('matchStatus', 'Could not read packing list: ' + err.message, 'bad');
  }
});
