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
  const materialKey = keys.find(k=>['material','material number','materialnumber'].includes(normalizeHeader(k)));

  let maxNums=1, maxInitials=1, maxNames=1, matchedRows=0;

  const staged = inputObjects.map((row, i)=>{
    const txt = String(row[variationKey] || '').trim();
    const smart = resolveAdaptiveExtraction(txt);
    const hasMatch = [smart.nums, smart.ids, smart.initials, smart.names, smart.requirements].some(a=>a.length);
    if (hasMatch) matchedRows++;
    maxNums = Math.max(maxNums, smart.nums.length || 1);
    maxInitials = Math.max(maxInitials, smart.initials.length || 1);
    maxNames = Math.max(maxNames, smart.names.length || 1);

    const assess = buildExtractionAssessment(txt, smart);

    return {
      'Source Row': String(i+2),
      'Order ID': orderKey ? String(row[orderKey] || '').trim() : '',
      'Product Qty': qtyKey ? String(row[qtyKey] || '').trim() : '',
      'Product SKU': skuKey ? String(row[skuKey] || '').trim() : '',
      'Material': materialKey ? String(row[materialKey] || '').trim() : '',
      'Product Name': nameKey ? String(row[nameKey] || '').trim() : '',
      'Original Product Variation Details': txt,
      '_nums': smart.nums,
      '_initials': smart.initials,
      '_names': smart.names,
      '_extract_status': assess.status,
      '_extract_note': assess.note,
      '_num_conf': smart.confidence.number,
      '_init_conf': smart.confidence.initial,
      '_name_conf': smart.confidence.name,
      '_num_source': smart.sources.number,
      '_init_source': smart.sources.initial,
      '_name_source': smart.sources.name,
      'Notes': !txt ? 'Blank Product Variation Details' : (hasMatch ? 'Adaptive match found' : 'No target value found')
    };
  });

  const output = staged.map(r=>{
    const out = {
      'Source Row': r['Source Row'],
      'Order ID': r['Order ID'],
      'Product Qty': r['Product Qty'],
      'Product SKU': r['Product SKU'],
      'Material': r['Material'],
      'Product Name': r['Product Name'],
      'Original Product Variation Details': r['Original Product Variation Details']
    };
    for (let i=0;i<maxNums;i++) out[`Player Number ${i+1}`] = r._nums[i] || '';
    for (let i=0;i<maxInitials;i++) out[`Player Initial ${i+1}`] = r._initials[i] || '';
    out['Player Name Raw 1'] = r._names[0] || '';
    for (let i=0;i<maxNames;i++) out[`Player Name ${i+1}`] = r._names[i] || '';
    out['Player Number Confidence'] = r._num_conf || '';
    out['Player Initial Confidence'] = r._init_conf || '';
    out['Player Name Confidence'] = r._name_conf || '';
    out['Player Number Source'] = r._num_source || '';
    out['Player Initial Source'] = r._init_source || '';
    out['Player Name Source'] = r._name_source || '';
    out['Extraction Status'] = r._extract_status || 'OK';
    out['Extraction Review Note'] = r._extract_note || '';
    out['Notes'] = r['Notes'];
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

async function readCsvRows(file){
  return new Promise((resolve, reject)=>{
    Papa.parse(file, {
      header:true,
      skipEmptyLines:true,
      complete:r=>resolve(r.data),
      error:e=>reject(e)
    });
  });
}
async function loadWorkbook(input){
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const wb = new window.ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}
async function readOrderRows(file){
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || name.endsWith('.xltx') || name.endsWith('.xltm')){
    const wb = await loadWorkbook(file);
    const ws = wb.worksheets[0];
    const headerRow = ws.getRow(1);
    const headers = [];
    headerRow.eachCell((cell, colNum)=>{ headers[colNum] = String(cell.value ?? '').trim(); });
    const rows = [];
    for (let r = 2; r <= ws.rowCount; r++){
      const row = ws.getRow(r);
      const obj = {};
      let hasData = false;
      headers.forEach((h, c)=>{
        if (!h || !c) return;
        const cell = row.getCell(c);
        let val = cell.text ?? cell.value ?? '';
        if (typeof val === 'object' && val && val.richText) val = val.richText.map(x=>x.text).join('');
        val = String(val ?? '').trim();
        if (val !== '') hasData = true;
        obj[h] = val;
      });
      if (hasData) rows.push(obj);
    }
    return rows;
  }
  return await readCsvRows(file);
}
function mapHeaders(ws){
  const out = {};
  ws.getRow(1).eachCell((cell, colNum)=>{ out[String(cell.value || '').trim()] = colNum; });
  return out;
}
function getRowValue(row, idx){ return idx ? String(row.getCell(idx).value ?? '').trim() : ''; }
function packingNameMatches(packValue, orderInitial, orderName){
  const pv = normText(packValue);
  if (['', 'X', 'XX'].includes(pv)) return !String(orderInitial||'').trim() && !String(orderName||'').trim();

  const candidates = new Set();
  const addCand = (v) => {
    const s = normText(v);
    if (!s) return;
    candidates.add(s);
    const tokens = s.split(/\s+/).filter(Boolean);
    tokens.forEach(t => candidates.add(t));
    if (tokens.length >= 2) {
      candidates.add(tokens[tokens.length - 1]);
      candidates.add(tokens[0]);
    }
  };

  addCand(orderInitial);
  addCand(orderName);

  if (candidates.has(pv)) return true;
  for (const c of candidates){
    if (c && (c.includes(pv) || pv.includes(c))) return true;
  }
  return false;
}
function cleanCsvValue(v){ return String(v ?? '').replace(/\u00A0/g, ' ').trim(); }
function csvTextValueForExcel(v){
  const s = cleanCsvValue(v);
  return s ? `="${s.replace(/"/g, '""')}"` : '';
}
function isPlayerNumberColumn(key){
  const k = String(key || '').trim().toLowerCase();
  return /^player number\s+\d+$/.test(k);
}

function scoreStage2Candidate(cand, packPlayer, packName, packQty){
  let score = 100;
  const ordPlayerList = getAllValuesByPrefixes(cand, ['Player Number']);
  const ordInitList = getAllValuesByPrefixes(cand, ['Player Initial']);
  const ordNameList = getAllValuesByPrefixes(cand, ['Player Name', 'Player Name Raw', 'Player Last Name', 'Last Name']);
  const ordQty = qtyNumber(cand.__qty);

  if (ordPlayerList.some(v => samePlayerNumber(packPlayer, v))) score += 60;
  else if ((!packPlayer || ['X','XX','YES','NO'].includes(normText(packPlayer))) && !ordPlayerList.length) score += 8;
  else if (numericOnly(packPlayer) && ordPlayerList.length) score -= 15;

  let nameMatched = false;
  for (const initVal of ordInitList){
    if (packingNameMatches(packName, initVal, '')) { nameMatched = true; break; }
  }
  if (!nameMatched){
    for (const nameVal of ordNameList){
      if (packingNameMatches(packName, '', nameVal)) { nameMatched = true; break; }
    }
  }
  if (!nameMatched && ordInitList.length && ordNameList.length){
    for (const initVal of ordInitList){
      for (const nameVal of ordNameList){
        if (packingNameMatches(packName, initVal, nameVal)) { nameMatched = true; break; }
      }
      if (nameMatched) break;
    }
  }
  if (nameMatched) score += 25;
  else if (!['','X','XX'].includes(normText(packName)) && (ordInitList.length || ordNameList.length)) score -= 12;

  if (packQty === ordQty) score += 10;
  else score -= 8;

  const confidence = getCandidateConfidenceScore(cand);
  score += Math.min(12, confidence * 3);

  return {
    score,
    ordPlayerList,
    ordInitList,
    ordNameList
  };
}
