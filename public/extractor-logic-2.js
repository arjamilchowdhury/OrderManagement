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
function buildExtractionAssessment(txt, smart){
  const notes = [];
  const rawText = String(txt || '');
  const hasPlayerWord = /player/i.test(rawText);
  let status = 'OK';
  const req = String((smart.nameRequirements || [])[0] || '').trim().toUpperCase();

  if ((smart.suppression || []).length){
    notes.push(...smart.suppression);
    if (status === 'OK') status = 'SUPPRESSED_BY_RULE';
  }
  if (hasPlayerWord && !smart.nums.length && !smart.initials.length && !smart.names.length && !smart.ids.length){
    notes.push('Player text found but no structured player value extracted');
    if (status === 'OK') status = 'UNCERTAIN';
  }
  if (hasPlayerWord && smart.names.length && !smart.nums.length && String((smart.requirements || [])[0] || '').toUpperCase() !== 'NO'){
    notes.push('Player name found but player number missing');
    if (status === 'OK') status = 'UNCERTAIN';
  }
  if (hasPlayerWord && smart.initials.length && !smart.names.length && !smart.nums.length){
    notes.push('Only initials found; verify player details');
    if (status === 'OK') status = 'UNCERTAIN';
  }
  if (smart.names.length && req === 'NO'){
    notes.push('Name found but customization charge marked No');
    status = 'UNPAID NAME';
  } else if (smart.names.length && !req){
    notes.push('Name found but name charge flag missing');
    if (status === 'OK') status = 'UNCERTAIN';
  }

  const segmentSummary = uniqueClean((smart.segments || []).map(s => s.type)).join(', ');
  if (segmentSummary) notes.push('Segment types: ' + segmentSummary);

  return { status, note: uniqueClean(notes).join('; ') };
}

function buildExtractorOutput(inputObjects){
  const first = inputObjects[0] || {};
  const keys = Object.keys(first);
  const variationKey = keys.find(k=>normalizeHeader(k)==='product variation details');
  if (!variationKey) throw new Error("Required column 'Product Variation Details' was not found.");

  const orderKey = keys.find(k=>normalizeHeader(k)==='order id');
  const qtyKey = keys.find(k=>normalizeHeader(k)==='product qty');
  const skuKey = keys.find(k=>normalizeHeader(k)==='product sku');
  const nameKey = keys.find(k=>normalizeHeader(k)==='product name');

  let maxNums=1, maxInitials=1, maxNames=1, matchedRows=0;

  const staged = inputObjects.map((row, i)=>{
    const txt = String(row[variationKey] || '').trim();
    const orderId = orderKey ? String(row[orderKey] || '').trim() : '';
    const productSku = skuKey ? String(row[skuKey] || '').trim() : '';

    const smart = resolveAdaptiveExtraction(txt);
    const nums = smart.nums;
    const ids = smart.ids;
    const initials = smart.initials;
    const names = smart.names;
    const requirements = smart.requirements;

    maxNums = Math.max(maxNums, nums.length || 1);
    maxInitials = Math.max(maxInitials, initials.length || 1);
    maxNames = Math.max(maxNames, names.length || 1);

    const hasMatch = [nums, ids, initials, names, requirements].some(a=>a.length);
    if (hasMatch) matchedRows++;

    const assess = buildExtractionAssessment(txt, smart);
    return {
      "Source Row": String(i+2),
      "Order ID": orderId,
      "Product Qty": qtyKey ? String(row[qtyKey] || '') : '',
      "Product SKU": productSku,
      "Product Name": nameKey ? String(row[nameKey] || '') : '',
      "Original Product Variation Details": txt,
      "_nums": nums,
      "_initials": initials,
      "_names": names,
      "_name_requirements": smart.nameRequirements,
      "_extract_status": assess.status,
      "_extract_note": assess.note,
      "_num_conf": smart.confidence.number,
      "_init_conf": smart.confidence.initial,
      "_name_conf": smart.confidence.name,
      "_num_source": smart.sources.number,
      "_init_source": smart.sources.initial,
      "_name_source": smart.sources.name,
      "Notes": !txt ? "Blank Product Variation Details" : (hasMatch ? "Adaptive match found" : "No target value found")
    };
  });

  const output = staged.map(r=>{
    const out = {
      "Source Row": r["Source Row"],
      "Order ID": r["Order ID"],
      "Product Qty": r["Product Qty"],
      "Product SKU": r["Product SKU"],
      "Product Name": r["Product Name"],
      "Original Product Variation Details": r["Original Product Variation Details"],
    };
    for (let i=0;i<maxNums;i++) out[`Player Number ${i+1}`] = r._nums[i] || '';
    for (let i=0;i<maxInitials;i++) out[`Player Initial ${i+1}`] = r._initials[i] || '';
    out["Player Name Raw 1"] = r._names[0] || '';
    for (let i=0;i<maxNames;i++) out[`Player Name ${i+1}`] = r._names[i] || '';
    out["Extraction Status"] = r._extract_status || 'OK';
    out["Extraction Review Note"] = r._extract_note || '';
    out["Notes"] = r["Notes"];
    return out;
  });

  return {
    output,
    stats:{
      input_rows: inputObjects.length,
      output_rows: output.length,
      matched_rows: matchedRows,
      max_player_numbers: maxNums,
    }
  };
}
