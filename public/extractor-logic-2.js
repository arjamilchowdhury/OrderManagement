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
        if (seg === "'" || seg === '’') return seg;
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
    .replace(/\b(?:Club|Delivery Info|Player ID|Player Number|Number|Qty|Quantity|Size|Color|Region|Warehouse|Ship To|Ship Via|Orders? Will Be Received)\b.*$/i, '')
    .replace(/^[\s:;,\-_=]+/, '')
    .replace(/[\s:;,\-_=]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (/^(yes|no|x|xx|n\/a|na|null)$/i.test(cleaned)) return '';
  if (!/[A-Za-z]/.test(cleaned)) return '';
  if (/^\d+$/.test(cleaned)) return '';
  if (/\b(?:CLUB|DELIVERY INFO|PLAYER ID|ORDERS? WILL BE RECEIVED|PREMIER|UNITED|SC|FC|ACADEMY|REGION|WAREHOUSE|SHIP TO|SHIP VIA)\b/i.test(cleaned)) return '';
  if (/^(RTHEAST|ORTHEAST|NORTHEAST|SOUTHEAST|SOUTHWEST|NORTHWEST|NORTH|SOUTH|EAST|WEST|MIDWEST|CENTRAL|USA|BD)$/i.test(cleaned)) return '';

  if (!/\s/.test(cleaned)) {
    if (cleaned.length < 2 || cleaned.length > 15) return '';
  }

  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  if (wordCount > 3) return '';
  if (!/^[A-Za-z][A-Za-z'’.\-]*(?:\s+[A-Za-z][A-Za-z'’.\-]*){0,2}$/.test(cleaned)) return '';
  return toTitleCaseName(cleaned);
}
function cleanInferredNameCandidate(candidate){
  let cleaned = cleanupNameValue(candidate)
    .replace(/\b(?:Club|Delivery Info|Player ID|Player Number|Number|Qty|Quantity|Size|Color|Region|Warehouse|Ship To|Ship Via|Orders? Will Be Received)\b.*$/i, '')
    .replace(/^[\s:;,\-_=#]+/, '')
    .replace(/[\s:;,\-_=#]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (/^(yes|no|x|xx|n\/a|na|null)$/i.test(cleaned)) return '';
  if (!/[A-Za-z]/.test(cleaned)) return '';
  if (/^\d+$/.test(cleaned)) return '';
  if (/\b(?:CLUB|DELIVERY INFO|PLAYER ID|ORDERS? WILL BE RECEIVED|PREMIER|UNITED|SC|FC|ACADEMY|REGION|WAREHOUSE|SHIP TO|SHIP VIA|ORDERS?|MATERIAL|COLOR|SIZE)\b/i.test(cleaned)) return '';
  if (/^(RTHEAST|ORTHEAST|NORTHEAST|SOUTHEAST|SOUTHWEST|NORTHWEST|NORTH|SOUTH|EAST|WEST|MIDWEST|CENTRAL|USA|BD)$/i.test(cleaned)) return '';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 2) return '';
  if (!words.every(w => /^[A-Za-z][A-Za-z'’.\-]*$/.test(w))) return '';
  if (words.length === 1){
    const w = words[0];
    if (w.length < 2 || w.length > 15) return '';
  }
  return toTitleCaseName(cleaned);
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
function extractAdaptiveCandidates(segment, segmentType){
  const s = String(segment || '').trim();
  const candidates = [];
  let m;

  if (segmentType === 'player_number'){
    m = s.match(/^PLAYER[\s_-]*(?:NUMBER|NO|#|NUM(?:BER)?)\s*[:=-]?\s*([0-9A-Za-z]+)/i);
    if (m){
      const val = cleanupNameValue(m[1] || '');
      if (val && !/^(YES|NO)$/i.test(val)) candidates.push(makeCandidate('number', val, 0.99, s, segmentType, 'explicit player number label'));
    }
  }

  if (segmentType === 'player_id'){
    m = s.match(/^PLAYER[\s_-]*ID\s*[:=-]?\s*([0-9A-Za-z!Xx]+)/i);
    if (m){
      const val = cleanupNameValue(m[1] || '');
      if (val) candidates.push(makeCandidate('id', val, 0.98, s, segmentType, 'explicit player id label'));
    }
  }

  if (segmentType === 'player_initial'){
    m = s.match(/^(?:PLAYER[\s_-]*)?(?:INITIALS|INITIAL|INITAILS|INITALS)\s*[:=-]?\s*([^,;|\n]+)/i);
    if (m){
      const val = cleanupNameValue(m[1] || '').replace(/[^A-Za-z\/& -]/g, '').replace(/\s+/g, ' ').trim();
      if (val && !/^(YES|X|XX)$/i.test(val)) candidates.push(makeCandidate('initial', val, 0.97, s, segmentType, 'explicit player initial label'));
    }
  }

  if (segmentType === 'player_name'){
    m = s.match(/^(?:PLAYER[\s_-]*)?(?:NAME|LAST[\s_-]*NAME|LASTNAME|LAST-NAME)\s*[:=-]?\s*(.+)$/i) || s.match(/^PLAYER(?:NAME|LASTNAME)\s*[:=-]?\s*(.+)$/i);
    if (m){
      const val = cleanNameCandidate(m[1] || '');
      if (val) candidates.push(makeCandidate('name', val, 0.97, s, segmentType, 'explicit player name label'));
    }
  }

  if (segmentType === 'customization_flag_number'){
    m = s.match(/\b(YES|NO)\b/i);
    if (m) candidates.push(makeCandidate('number_requirement', /^yes$/i.test(m[1]) ? 'Yes' : 'No', 0.99, s, segmentType, 'player number customization flag'));
  }

  if (segmentType === 'customization_flag_name'){
    m = s.match(/\b(YES|NO)\b/i);
    if (m) candidates.push(makeCandidate('name_requirement', /^yes$/i.test(m[1]) ? 'Yes' : 'No', 0.99, s, segmentType, 'player name customization flag'));
  }

  return candidates;
}
function dedupeCandidates(candidates){
  const seen = new Set();
  const out = [];
  for (const c of (candidates || [])){
    const key = [c.field, String(c.value || '').toUpperCase(), c.segmentType].join('||');
    if (!c.value || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
function resolveAdaptiveExtraction(rawText){
  const segments = splitAdaptiveSegments(rawText).map(seg => ({ text: seg, type: classifySegment(seg) }));
  let candidates = [];
  segments.forEach(seg => {
    candidates.push(...extractAdaptiveCandidates(seg.text, seg.type));
  });
  candidates.push(...inferNameCandidatesFromContext(segments));
  candidates = dedupeCandidates(candidates);

  let numbers = candidates.filter(c => c.field === 'number').sort((a,b)=>b.confidence-a.confidence);
  const ids = candidates.filter(c => c.field === 'id').sort((a,b)=>b.confidence-a.confidence);
  const initials = candidates.filter(c => c.field === 'initial').sort((a,b)=>b.confidence-a.confidence);
  const names = candidates.filter(c => c.field === 'name').sort((a,b)=>b.confidence-a.confidence);
  const numberReqs = standardizeYesNo(uniqueClean(candidates.filter(c => c.field === 'number_requirement').map(c => c.value)));
  const nameReqs = standardizeYesNo(uniqueClean(candidates.filter(c => c.field === 'name_requirement').map(c => c.value)));

  const suppression = [];
  if (String(numberReqs[0] || '').toUpperCase() === 'NO'){
    if (numbers.length) suppression.push('Player number suppressed because customization flag is No');
    numbers = [];
  }

  const numberValues = uniqueClean(numbers.map(c => cleanupNameValue(c.value)));
  const idValues = uniqueClean(ids.map(c => cleanupNameValue(c.value)));
  const initialValues = uniqueClean(initials.map(c => cleanupNameValue(c.value)));
  const nameValues = uniqueClean(names.map(c => cleanNameCandidate(c.value)).filter(Boolean));

  const confidence = {
    number: numberValues.length ? Math.max(...numbers.map(c => c.confidence), 0) : 0,
    initial: initialValues.length ? Math.max(...initials.map(c => c.confidence), 0) : 0,
    name: nameValues.length ? Math.max(...names.map(c => c.confidence), 0) : 0
  };

  const sources = {
    number: numberValues.length ? numbers.map(c => c.source).join(' | ') : '',
    initial: initialValues.length ? initials.map(c => c.source).join(' | ') : '',
    name: nameValues.length ? names.map(c => c.source).join(' | ') : ''
  };

  return {
    segments,
    candidates,
    nums: numberValues,
    ids: idValues,
    initials: initialValues,
    names: nameValues,
    requirements: numberReqs,
    nameRequirements: nameReqs,
    confidence,
    sources,
    suppression
  };
}
