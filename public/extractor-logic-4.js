document.getElementById('extractBtn').addEventListener('click', async ()=>{
  const rawFile = document.getElementById('rawOrdersFile').files[0];
  if (!rawFile) { alert('Please choose the raw order CSV file first.'); return; }

  try{
    setStatus('extractStatus', 'Processing raw order CSV...', 'warn');
    const rawRows = await readCsvRows(rawFile);
    const {output, stats} = buildExtractorOutput(rawRows);
    extractedRows = output;
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

document.getElementById('downloadExtractBtn').addEventListener('click', ()=>{
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
  const csv = window.Papa.unparse(cleanedRows, { quotes: false, skipEmptyLines: true });
  const blob = new Blob(["\ufeff" + csv], {type:'text/csv;charset=utf-8;'});
  const base = (document.getElementById('rawOrdersFile').files[0]?.name || 'orders').replace(/\.[^.]+$/, '');
  downloadBlob(blob, `${base}_extracted.csv`);
});

document.getElementById('matchBtn').addEventListener('click', async ()=>{
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
      }
    }

    const orderPool = {};
    const orderPoolCounts = {};
    let totalOrderQty = 0;
    for (const r of orders){
      const oid = orderIdFromAny(rowValueByHeader(r, ['Order ID']));
      const orderMaterial = rowValueByHeader(r, ['Material','Material ','Material Number','MaterialNumber']);
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
      let bestScoreOut = '';
      let bestNumList = [];
      let bestInitList = [];
      let bestNameList = [];

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
          bestScoreOut = bestScore;

          const ordNumList = bestMeta?.ordPlayerList || getAllValuesByPrefixes(chosen, ['Player Number']);
          const ordInitList = bestMeta?.ordInitList || getAllValuesByPrefixes(chosen, ['Player Initial']);
          const ordNameList = bestMeta?.ordNameList || getAllValuesByPrefixes(chosen, ['Player Name', 'Player Name Raw', 'Player Last Name', 'Last Name']);
          bestNumList = ordNumList;
          bestInitList = ordInitList;
          bestNameList = ordNameList;

          const ordNum = firstUsefulValue(ordNumList);
          const ordQty = qtyNumber(chosen.__qty);

          if (ordNum) playerPulled++;
          if (packQty !== ordQty) notes.push('Quantity mismatch');

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

      row.getCell(hdr['Player Number to check']).value = bestNumList.join(' | ');
      row.getCell(hdr['Player Initial from Order']).value = bestInitList.join(' | ');
      row.getCell(hdr['Player Name from Order']).value = bestNameList.join(' | ');
      row.getCell(hdr['Match Score']).value = bestScoreOut;
      row.getCell(hdr['Mismatch Status']).value = status;
      const allNotes = notes.concat(reviewNotes);
      row.getCell(hdr['Mismatch Notes']).value = allNotes.join('; ');

      if (status === 'Mismatch'){
        const redFill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFFEE2E2'}};
        const darkRedFont = {color:{argb:'FF991B1B'}, bold:true};
        desiredCols.forEach(col=>{ row.getCell(hdr[col]).fill = redFill; });
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
        'Player Number to check': bestNumList.join(' | '),
        'Player Initial from Order': bestInitList.join(' | '),
        'Player Name from Order': bestNameList.join(' | '),
        'Match Score': bestScoreOut,
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

document.getElementById('downloadMatchBtn').addEventListener('click', ()=>{
  if (!matchedWorkbookBlob) return;
  downloadBlob(matchedWorkbookBlob, 'packing list.xlsx');
});
