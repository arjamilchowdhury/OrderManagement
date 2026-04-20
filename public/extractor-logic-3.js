const btnE = document.getElementById('extractBtn');
if(btnE) {
btnE.addEventListener('click', async ()=>{
  const rawFile = document.getElementById('rawOrdersFile').files[0];
  if (!rawFile) { alert('Please choose the raw order CSV file first.'); return; }

  try{
    setStatus('extractStatus', 'Processing raw order CSV...', 'warn');

    const rawRows = await readCsvRows(rawFile);
    const {output, stats} = buildExtractorOutput(rawRows);
    extractedRows = output;
    extractedCsvBlob = null;
    document.getElementById('downloadExtractBtn').disabled = false;

    setText('ex_input', stats.input_rows);
    setText('ex_output', stats.output_rows);
    setText('ex_match', stats.matched_rows);
    setText('ex_max', stats.max_player_numbers);
    setText('ex_uncertain', output.filter(r => String(r['Extraction Status'] || '').toUpperCase() === 'UNCERTAIN').length);

    renderTable('extractPreview', output);
    setStatus('extractStatus', 'Extraction completed. The cleaned CSV file is ready to download.', 'ok');
  } catch(err){
    console.error(err);
    setStatus('extractStatus', err.message, 'bad');
  }
});
}

function cleanCsvValue(v){
  return String(v ?? '').replace(/\u00A0/g, ' ').trim();
}
function csvTextValueForExcel(v){
  const s = cleanCsvValue(v);
  return s ? `="${s.replace(/"/g, '""')}"` : '';
}
function isPlayerNumberColumn(key){
  const k = String(key || '').trim().toLowerCase();
  return /^player number\s+\d+$/.test(k);
}

const btnDE = document.getElementById('downloadExtractBtn');
if(btnDE) {
btnDE.addEventListener('click', ()=>{
  if (!extractedRows || !extractedRows.length) return;
  const cleanedRows = extractedRows.map(row => {
    const out = {};
    Object.keys(row).forEach(key => {
      const trimmedKey = String(key).trim();
      if (HIDDEN_PREVIEW_COLUMNS.has(trimmedKey)) return;
      out[trimmedKey] = isPlayerNumberColumn(trimmedKey)
        ? csvTextValueForExcel(row[key])
        : cleanCsvValue(row[key]);
    });
    return out;
  });
  const csv = Papa.unparse(cleanedRows, {
    quotes: false,
    skipEmptyLines: true
  });
  const blob = new Blob(["\ufeff" + csv], {type:'text/csv;charset=utf-8;'});
  const base = (document.getElementById('rawOrdersFile').files[0]?.name || 'orders').replace(/\.[^.]+$/, '');
  downloadBlob(blob, `${base}_extracted.csv`);
});
}

/* Step 2 */
const SIZE_MAP = {
  'AM':'M','AL':'L','AXL':'XL','A2XL':'2XL','A3XL':'3XL','A4XL':'4XL','AXS':'XS',
  'WXS':'XS','WS':'S','WM':'M','WL':'L','WXL':'XL',
  'YXS':'6-7','YS':'6-8','YM':'10-12','YL':'14-16','YXL':'18-20',
  'O':'NOSZ','OS':'NOSZ','O/S':'NOSZ'
};
const COLOR_MAP = {
  'RBLW':'ROYALBLUEWHITE',
  'RDWHTRYLBL':'REDWHITEROYALBLUE',
  'RYLBLWHTNVY':'ROYALBLUEWHITENAVY',
  'DRKHTHGRYBLK':'DRKHTHRGYBK'
};

function stripTeamcodeSku(s){
  const t = normText(s);
  let parts = t.split('_');
  if (parts.length >= 4 && /^[A-Z0-9]{5,}$/.test(parts[parts.length-1])) parts = parts.slice(0,-1);
  return parts.join('_');
}
function materialSignaturePack(s){
  const t = normText(s);
  if (!t) return ['','',''];
  const parts = t.split('_');
  const code = parts[0] || '';
  const size = (parts.length > 1 ? parts[parts.length-1] : '').replace(/[^A-Z0-9/+.-]/g,'');
  let color = parts.length > 2 ? parts.slice(1,-1).join('') : '';
  color = color.replace(/[^A-Z0-9]/g,'');
  return [code, color, SIZE_MAP[size] || size];
}
function materialSignatureOrder(s){
  const t = stripTeamcodeSku(s);
  if (!t) return ['','',''];
  const parts = t.split('_');
  const code = parts[0] || '';
  const size = (parts.length > 1 ? parts[parts.length-1] : '').replace(/[^A-Z0-9/+.-]/g,'');
  let color = parts.length > 2 ? parts.slice(1,-1).join('') : '';
  color = color.replace(/[^A-Z0-9]/g,'');
  color = COLOR_MAP[color] || color;
  return [code, color, SIZE_MAP[size] || size];
}
function similarity(a,b){
  a = String(a||''); b = String(b||'');
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  let same = 0;
  const len = Math.max(a.length, b.length);
  const min = Math.min(a.length, b.length);
  for(let i=0;i<min;i++) if (a[i] === b[i]) same++;
  return same / len;
}
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
async function readOrderRows(file){
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || name.endsWith('.xltx') || name.endsWith('.xltm')){
    const wb = await loadWorkbook(file);
    const ws = wb.worksheets[0];
    const headerRow = ws.getRow(1);
    const headers = [];
    headerRow.eachCell((cell, colNum)=>{
      headers[colNum] = String(cell.value ?? '').trim();
    });
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
async function loadWorkbook(input){
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}
function mapHeaders(ws){
  const out = {};
  ws.getRow(1).eachCell((cell, colNum)=>{
    out[String(cell.value || '').trim()] = colNum;
  });
  return out;
}
function getRowValue(row, idx){
  return idx ? String(row.getCell(idx).value ?? '').trim() : '';
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

  const confidence = getCandidateConfidenceScore ? getCandidateConfidenceScore(cand) : 0;
  score += Math.min(12, confidence * 4);

  return {
    score,
    ordPlayerList,
    ordInitList,
    ordNameList
  };
}

function getCandidateConfidenceScore(cand) {
   let conf = 0;
   if(cand._num_conf) conf = Math.max(conf, Number(cand._num_conf));
   if(cand._init_conf) conf = Math.max(conf, Number(cand._init_conf));
   if(cand._name_conf) conf = Math.max(conf, Number(cand._name_conf));
   return conf;
}

const btnM = document.getElementById('matchBtn');
if(btnM){
btnM.addEventListener('click', async ()=>{
  const orderFile = document.getElementById('cleanOrdersFile').files[0];
  const packingFile = document.getElementById('packingFile').files[0];

  if (!orderFile || !packingFile){
    alert('Please upload the cleaned order file and the packing list workbook.');
    return;
  }
  if (!cachedCleanOrdersRows || !cachedPackingArrayBuffer){
    alert('Please wait until both files are fully loaded, then click Match again.');
    return;
  }

  try{
    setStatus('matchStatus', 'Loading files and matching rows...', 'warn');

    const orders = cachedCleanOrdersRows;
    const wb = await loadWorkbook(cachedPackingArrayBuffer.slice(0));
    const ws = wb.worksheets[0];
    const hdr = mapHeaders(ws);

    const required = ['BC Order #','Material','Last Name / Initials','Player #','Order Quantity (Item)'];
    const missing = required.filter(h => !hdr[h]);
    if (missing.length) throw new Error('Packing list is missing required columns: ' + missing.join(', '));

    const desiredCols = ['Player Number to check','Player Initial from Order','Player Name from Order','Match Score','Mismatch Status','Mismatch Notes'];
    let lastCol = ws.columnCount;

    for (const col of desiredCols){
      if (!hdr[col]){
        lastCol += 1;
        ws.getRow(1).getCell(lastCol).value = col;
        hdr[col] = lastCol;
        const src = ws.getRow(1).getCell(lastCol - 1);
        ws.getRow(1).getCell(lastCol).style = JSON.parse(JSON.stringify(src.style || {}));
      }
    }

    const orderPool = {};
    const orderPoolCounts = {};
    let totalOrderQty = 0;
    for (const r of orders){
      const oid = orderIdFromAny(rowValueByHeader(r, ['Order ID']));
      const orderMaterial = rowValueByHeader(r, ['Material','Material ']);
      const materialKey = normMaterialKey(orderMaterial || rowValueByHeader(r, ['Product SKU']) || '');
      if (!oid || !materialKey) continue;
      const comboKey = oid + '||' + materialKey;
      const item = {...r};
      item.__order_id = oid;
      item.__material_key = materialKey;
      item.__qty = qtyNumber(rowValueByHeader(r, ['Product Qty','Qty','Quantity']) || 0);
      totalOrderQty += item.__qty;
      if (!orderPool[comboKey]) orderPool[comboKey] = [];
      orderPool[comboKey].push(item);
      orderPoolCounts[comboKey] = (orderPoolCounts[comboKey] || 0) + 1;
    }

    let rowsProcessed = 0;
    let ok = 0;
    let mismatch = 0;
    let playerPulled = 0;
    let totalPackingQty = 0;
    let duplicateMaterialRows = 0;
    const preview = [];

    for (let rowNum = 2; rowNum <= ws.rowCount; rowNum++){
      const row = ws.getRow(rowNum);

      const bc = getRowValue(row, hdr['BC Order #']);
      const material = getRowValue(row, hdr['Material']);
      const oid = orderIdFromAny(bc);

      if (!oid || !material || normText(bc).includes('TOTAL')) continue;

      rowsProcessed += 1;
      const packQty = qtyNumber(getRowValue(row, hdr['Order Quantity (Item)']));
      totalPackingQty += packQty;

      const materialKey = normMaterialKey(material);
      const comboKey = oid + '||' + materialKey;
      const candidates = orderPool[comboKey] || [];
      const notes = [];
      const reviewNotes = [];
      const isDuplicateMaterialCombo = (orderPoolCounts[comboKey] || 0) >= 2;
      if (isDuplicateMaterialCombo) duplicateMaterialRows += 1;
      let status = 'Mismatch';

      if (!candidates.length){
        notes.push('Order ID + Material not found in cleaned order file');
      } else {
        const packPlayer = getRowValue(row, hdr['Player #']);
        const packName = getRowValue(row, hdr['Last Name / Initials']);

        let bestI = -1;
        let bestScore = -1;
        let bestMeta = null;

        candidates.forEach((cand, i)=>{
          const meta = scoreStage2Candidate(cand, packPlayer, packName, packQty);
          if (meta.score > bestScore){
            bestScore = meta.score;
            bestI = i;
            bestMeta = meta;
          }
        });

        if (bestI < 0){
          notes.push('Order ID + Material matched, but player line could not be resolved');
        } else {
          const chosen = candidates.splice(bestI, 1)[0];

          const ordNumList = (bestMeta && bestMeta.ordPlayerList) ? bestMeta.ordPlayerList : getAllValuesByPrefixes(chosen, ['Player Number']);
          const ordInitList = (bestMeta && bestMeta.ordInitList) ? bestMeta.ordInitList : getAllValuesByPrefixes(chosen, ['Player Initial']);
          const ordNameList = (bestMeta && bestMeta.ordNameList) ? bestMeta.ordNameList : getAllValuesByPrefixes(chosen, ['Player Name', 'Player Name Raw', 'Player Last Name', 'Last Name']);
          const ordNum = firstUsefulValue(ordNumList);
          const ordInit = firstUsefulValue(ordInitList);
          const ordName = firstUsefulValue(ordNameList);

          row.getCell(hdr['Player Number to check']).value = ordNumList.join(' | ');
          row.getCell(hdr['Player Initial from Order']).value = ordInitList.join(' | ');
          row.getCell(hdr['Player Name from Order']).value = ordNameList.join(' | ');
          row.getCell(hdr['Match Score']).value = bestScore;

          if (ordNum) playerPulled++;

          const ordQty = qtyNumber(chosen.__qty);
          if (packQty !== ordQty){
            notes.push('Quantity mismatch');
          }

          if (ordNum){
            const numberMatched = ordNumList.some(v => samePlayerNumber(packPlayer, v));
            if (ordNumList.some(v => !numericOnly(v))) notes.push('Order player number contains non-numeric characters');
            if (!numericOnly(packPlayer)) notes.push('Packing Player # is not numeric while order has player number');
            else if (!numberMatched) notes.push('Player number mismatch');
          } else {
            if (numericOnly(packPlayer)) notes.push('Packing has player number but order file is blank');
          }

          if (isDuplicateMaterialCombo){
            reviewNotes.push('Duplicate material under same order - matched from remaining player candidates');
          }

          if (ordInitList.length || ordNameList.length){
            let exactNameMatch = false;
            for (const initVal of (ordInitList.length ? ordInitList : [''])){
              for (const nameVal of (ordNameList.length ? ordNameList : [''])){
                if (packingNameMatches(packName, initVal, nameVal)){
                  exactNameMatch = true;
                  break;
                }
              }
              if (exactNameMatch) break;
            }
            if (!exactNameMatch){
              notes.push('Last Name / Initials does not match order initial or last name');
            }
          } else {
            if (!['','X','XX'].includes(normText(packName))){
              notes.push('Packing has Last Name / Initials but order file is blank');
            }
          }

          status = notes.length ? 'Mismatch' : 'OK';
        }
      }

      row.getCell(hdr['Mismatch Status']).value = status;
      const allNotes = notes.concat(reviewNotes);
      row.getCell(hdr['Mismatch Notes']).value = allNotes.join('; ');

      const styleSrc = row.getCell(Math.max(1, hdr['Player Number to check'] - 1)).style || {};
      desiredCols.forEach(col=>{
        row.getCell(hdr[col]).style = JSON.parse(JSON.stringify(styleSrc));
      });

      if (status === 'Mismatch'){
        const redFill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFFEE2E2'}};
        const darkRedFont = {color:{argb:'FF991B1B'}, bold:true};
        desiredCols.forEach(col=>{
          row.getCell(hdr[col]).fill = redFill;
        });
        row.getCell(hdr['Mismatch Status']).font = darkRedFont;
        mismatch += 1;
      } else {
        ok += 1;
      }

      preview.push({
        'BC Order #': bc,
        'Material': material,
        'Packing Qty': packQty,
        'Last Name / Initials': getRowValue(row, hdr['Last Name / Initials']),
        'Player #': getRowValue(row, hdr['Player #']),
        'Player Number to check': getRowValue(row, hdr['Player Number to check']),
        'Player Initial from Order': getRowValue(row, hdr['Player Initial from Order']),
        'Player Name from Order': getRowValue(row, hdr['Player Name from Order']),
        'Match Score': getRowValue(row, hdr['Match Score']),
        'Mismatch Status': status,
        'Mismatch Notes': allNotes.join('; ')
      });
    }

    ws.getColumn(hdr['Player Number to check']).width = 20;
    ws.getColumn(hdr['Player Initial from Order']).width = 22;
    ws.getColumn(hdr['Player Name from Order']).width = 24;
    ws.getColumn(hdr['Match Score']).width = 14;
    ws.getColumn(hdr['Mismatch Status']).width = 16;
    ws.getColumn(hdr['Mismatch Notes']).width = 60;

    const buffer = await wb.xlsx.writeBuffer();
    matchedWorkbookBlob = new Blob([buffer], {
      type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    document.getElementById('downloadMatchBtn').disabled = false;
    setText('mt_rows', rowsProcessed);
    setText('mt_ok', ok);
    setText('mt_mm', mismatch);
    setText('mt_pull', playerPulled);
    setText('mt_packqty', totalPackingQty);
    setText('mt_orderqty', totalOrderQty);
    const qtyOk = totalPackingQty === totalOrderQty;
    setText('mt_qtyok', qtyOk ? 'GREEN' : 'RED');
    setText('mt_dup', duplicateMaterialRows);
    const qtyMsg = qtyOk ? ' Total quantities match.' : ' Total quantities do not match.';
    renderTable('matchPreview', preview, 'Mismatch Status');
    setStatus('matchStatus', 'Matching completed. Final packing list workbook is ready to download.' + qtyMsg, qtyOk ? 'ok' : 'warn');
  } catch(err){
    console.error(err);
    setStatus('matchStatus', err.message, 'bad');
  }
});
}

const btnDM = document.getElementById('downloadMatchBtn');
if(btnDM){
btnDM.addEventListener('click', ()=>{
  if (!matchedWorkbookBlob) return;
  downloadBlob(matchedWorkbookBlob, 'packing list.xlsx');
});
}
