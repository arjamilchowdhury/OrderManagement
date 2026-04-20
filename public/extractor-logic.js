let extractedRows = [];
let extractedCsvBlob = null;
let matchedWorkbookBlob = null;
let cachedCleanOrdersRows = null;
let cachedPackingArrayBuffer = null;
let cachedCleanOrdersName = '';
let cachedPackingName = '';
let cachedCombinedOrderRows = null;

function setText(id, value){ document.getElementById(id) && (document.getElementById(id).textContent = value); }
function setStatus(id, text, kind=''){
  const el = document.getElementById(id);
  if(el) {
     el.className = 'status-bar' + (kind ? ' status-' + kind : '');
     el.textContent = text;
  }
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
function qtyNumber(v){ const s = String(v ?? '').replace(/,/g,'').trim(); const n = Number(s); return Number.isFinite(n) ? n : 0; }
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function orderIdFromAny(s){ const m = String(s ?? '').match(/(\d+)/); return m ? m[1] : ''; }
function normMaterialKey(v){
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
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

function buildCombinedMaterialLookup(rows){
  const lookup = {};
  for (const row of (rows || [])) {
    const oid = orderIdFromAny(rowValueByHeader(row, ['Order ID','OrderID','BC Order','BC Order #','BC order','BC order #']));
    const sku = normMaterialKey(rowValueByHeader(row, ['Product SKU','SKU','ProductSku','Product SKU ']));
    const material = String(rowValueByHeader(row, ['Material','Material ','Material Number','MaterialNumber']) || '').trim();
    if (!oid || !sku || !material) continue;
    const key = oid + '||' + sku;
    if (!lookup[key]) lookup[key] = material;
  }
  return lookup;
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
  if (!root) return;
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

const eleClean = document.getElementById('cleanOrdersFile');
if(eleClean) {
eleClean.addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  cachedCleanOrdersRows = null;
  cachedCleanOrdersName = '';
  if (!f) return;
  try{
    setStatus('matchStatus', 'Reading cleaned order file into memory...', 'warn');
    cachedCleanOrdersRows = await readOrderRows(f);
    cachedCleanOrdersName = f.name || '';
    setStatus('matchStatus', 'Cleaned order file loaded. Now upload the packing list and click Match.', 'ok');
  }catch(err){
    console.error(err);
    setStatus('matchStatus', 'Could not read cleaned order file: ' + err.message, 'bad');
  }
});
}

const elePack = document.getElementById('packingFile');
if(elePack) {
elePack.addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  cachedPackingArrayBuffer = null;
  cachedPackingName = '';
  if (!f) return;
  try{
    setStatus('matchStatus', 'Reading packing list workbook into memory...', 'warn');
    cachedPackingArrayBuffer = await f.arrayBuffer();
    cachedPackingName = f.name || '';
    setStatus('matchStatus', 'Packing list loaded. Click Match when both files are ready.', 'ok');
  }catch(err){
    console.error(err);
    setStatus('matchStatus', 'Could not read packing list: ' + err.message, 'bad');
  }
});
}

/* Step 1 */
function extractAll(text, regex){
  const out = [];
  const t = String(text || '');
  for (const m of t.matchAll(regex)) {
    const v = (m[1] || '').trim();
    if (v) out.push(v);
  }
  return out;
}
function standardizeYesNo(values){
  return values.map(v=>{
    const lv = String(v).trim().toLowerCase();
    if (lv === 'yes') return 'Yes';
    if (lv === 'no') return 'No';
    return String(v).trim();
  });
}
function uniqueClean(values){
  const seen = new Set();
  const out = [];
  for (const raw of values || []){
    const v = String(raw || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    const key = v.toUpperCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
function cleanupNameValue(v){
  return String(v || '')
    .replace(/^[\s:;,\-_=]+/, '')
    .replace(/[\s:;,\-_=]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function toTitleCaseName(v){
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw
    .toLowerCase()
    .split(/(\s+|-)/)
    .map(part => {
      if (!part || /^\s+$/.test(part) || part === '-') return part;
      return part.split(/(['’])/).map(seg => {
        if (seg === "'" || seg === "’") return seg;
        return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg;
      }).join('');
    })
    .join('');
}
function normalizeVariationText(raw){
  return String(raw || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;|])\s*/g, '$1 ')
    .trim();
}
function splitAdaptiveSegments(raw){
  const normalized = normalizeVariationText(raw);
  if (!normalized) return [];
  return normalized
    .split(/[,;|\n]+/)
    .map(s => String(s || '').trim())
    .filter(Boolean);
}
function cleanNameCandidate(candidate){
  let cleaned = cleanupNameValue(candidate);
  cleaned = cleaned
    .replace(/(?:Club|Delivery Info|Player ID|Player Number|Number|Qty|Quantity|Size|Color|Region|Warehouse|Ship To|Ship Via|Orders? Will Be Received).*$/i, '')
    .replace(/^[\s:;,\-_=]+/, '')
    .replace(/[\s:;,\-_=]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (/^(yes|no|x|xx|n\/a|na|null)$/i.test(cleaned)) return '';
  if (!/[A-Za-z]/.test(cleaned)) return '';
  if (/^\d+$/.test(cleaned)) return '';
  if (/(?:CLUB|DELIVERY INFO|PLAYER ID|ORDERS? WILL BE RECEIVED|PREMIER|UNITED|SC|FC|ACADEMY|REGION|WAREHOUSE|SHIP TO|SHIP VIA)/i.test(cleaned)) return '';
  if (/^(RTHEAST|ORTHEAST|NORTHEAST|SOUTHEAST|SOUTHWEST|NORTHWEST|NORTH|SOUTH|EAST|WEST|MIDWEST|CENTRAL|USA|BD)$/i.test(cleaned)) return '';
  if (!/\s/.test(cleaned) && cleaned.length > 5) return '';
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  if (wordCount > 3) return '';
  if (!/^[A-Za-z][A-Za-z'’.\-]*(?:\s+[A-Za-z][A-Za-z'’.\-]*){0,2}$/.test(cleaned)) return '';
  return toTitleCaseName(cleaned);
}
function cleanInferredNameCandidate(candidate){
  let cleaned = cleanupNameValue(candidate)
    .replace(/(?:Club|Delivery Info|Player ID|Player Number|Number|Qty|Quantity|Size|Color|Region|Warehouse|Ship To|Ship Via|Orders? Will Be Received).*$/i, '')
    .replace(/^[\s:;,\-_=#]+/, '')
    .replace(/[\s:;,\-_=#]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (/^(yes|no|x|xx|n\/a|na|null)$/i.test(cleaned)) return '';
  if (!/[A-Za-z]/.test(cleaned)) return '';
  if (/^\d+$/.test(cleaned)) return '';
  if (/(?:CLUB|DELIVERY INFO|PLAYER ID|ORDERS? WILL BE RECEIVED|PREMIER|UNITED|SC|FC|ACADEMY|REGION|WAREHOUSE|SHIP TO|SHIP VIA|ORDERS?|MATERIAL|COLOR|SIZE)/i.test(cleaned)) return '';
  if (/^(RTHEAST|ORTHEAST|NORTHEAST|SOUTHEAST|SOUTHWEST|NORTHWEST|NORTH|SOUTH|EAST|WEST|MIDWEST|CENTRAL|USA|BD)$/i.test(cleaned)) return '';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 2) return '';
  if (!words.every(w => /^[A-Za-z][A-Za-z'’.\-]*$/.test(w))) return '';
  if (words.length === 1){
    const w = words[0];
    if (w.length < 3 || w.length > 12) return '';
  }
  return cleaned;
}
function isLikelyNameContext(type){
  return ['player_number','player_initial','player_name','player_id','customization_flag_number','customization_flag_name'].includes(String(type || ''));
}
function inferNameCandidatesFromContext(segments){
  const out = [];
  for (let i = 0; i < (segments || []).length; i++){
    const seg = segments[i] || {};
    if (seg.type !== 'noise' && seg.type !== 'size') continue;
    const prev = segments[i - 1] || {};
    const next = segments[i + 1] || {};
    if (!isLikelyNameContext(prev.type) && !isLikelyNameContext(next.type)) continue;
    const inferred = cleanInferredNameCandidate(seg.text || '');
    if (!inferred) continue;
    out.push(makeCandidate('name', inferred, 0.88, seg.text, 'inferred_player_name', 'inferred unlabeled name near player context'));
  }
  return out;
}
function classifySegment(segment){
  const s = String(segment || '').trim();
  if (/^CLUB\s*[:=-]/i.test(s)) return 'club';
  if (/^(DELIVERY INFO|ORDERS?\s+WILL\s+BE\s+RECEIVED)\s*[:=-]?/i.test(s)) return 'delivery';
  if (/^(REGION|WAREHOUSE|SHIP TO|SHIP VIA)\s*[:=-]/i.test(s)) return 'logistics';
  if (/^ADD\s*\$?\s*\d+(?:\.\d+)?\s*\$?\s*(?:TO\s*HAVE|FOR)\s*PLAYER[\s_-]*(NUMBER|INITIALS|INITIAL)\s*[:=-]?\s*(YES|NO)\b/i.test(s)) return 'customization_flag_number';
  if (/^ADD\s*\$?\s*\d+(?:\.\d+)?\s*\$?\s*(?:TO\s*HAVE|FOR)\s*(?:PLAYER[\s_-]*)?(NAME|LAST[\s_-]*NAME|LASTNAME)\s*[:=-]?\s*(YES|NO)\b/i.test(s)) return 'customization_flag_name';
  if (/^PLAYER[\s_-]*(NUMBER|NO|#|NUM(?:BER)?)\s*[:=-]?/i.test(s)) return 'player_number';
  if (/^PLAYER[\s_-]*ID\s*[:=-]?/i.test(s)) return 'player_id';
  if (/^(?:PLAYER[\s_-]*)?(INITIALS|INITIAL|INITAILS|INITALS)\s*[:=-]?/i.test(s)) return 'player_initial';
  if (/^(?:PLAYER[\s_-]*)?(NAME|LAST[\s_-]*NAME|LASTNAME|LAST-NAME)\s*[:=-]?/i.test(s) || /^PLAYER(NAME|LASTNAME)\s*[:=-]?/i.test(s)) return 'player_name';
  if (/\b(?:WXS|WS|WM|WL|WXL|AXS|AM|AL|AXL|A2XL|A3XL|A4XL|YXS|YS|YM|YL|YXL|NOSZ)\b/i.test(s)) return 'size';
  if (!/[A-Za-z]/.test(s)) return 'noise';
  return 'noise';
}
function makeCandidate(field, value, confidence, source, segmentType, reason){
  return {
    field,
    value: String(value || '').trim(),
    confidence: Number(confidence || 0),
    source: String(source || '').trim(),
    segmentType: String(segmentType || '').trim(),
    reason: String(reason || '').trim()
  };
}
