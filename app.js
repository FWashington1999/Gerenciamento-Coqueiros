//CONFIGURAÇÃO DO SUPABASE
  
var SUPABASE_URL      = 'https://gxgwjlbyjsyeutplfdvi.supabase.co';   
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4Z3dqbGJ5anN5ZXV0cGxmZHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTY2OTYsImV4cCI6MjA5OTI3MjY5Nn0.ZMFrKrki78fW6IUcoh2TDSMOezbRo87hn_8wOWY8Ydw';              
var FAMILY_EMAIL      = 'familia@coqueiros.com';            

(function () {
  "use strict";

  var MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var CACHE_KEY = 'coqueiros_cache_v1';
  var C = { entrada: '#2f8f5b', saida: '#c0553b', imprevisto: '#cf9436' };

  var configured = SUPABASE_URL.indexOf('SEU-PROJETO') === -1 && SUPABASE_ANON_KEY.indexOf('SUA-CHAVE') === -1;
  var db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  var state = {
    transactions: loadCache(),
    year: new Date().getFullYear(),
    error: '',
    form: emptyForm('entrada'),
  };

  // ---------- cache local (mostra algo instantâneo / fallback offline) ----------
  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveCache(tx) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(tx)); } catch (e) {}
  }

  // ---------- mapeamento banco <-> app ----------
  function fromDb(row) {
    return {
      id: row.id,
      type: row.type,
      value: Number(row.value),
      date: row.date,
      qty: row.qty || '',
      desc: row.description || '',
      category: row.category || '',
      payment: row.payment || '',
      receiptPath: row.receipt_path || '',
    };
  }
  function toDb(tx) {
    return {
      id: tx.id, type: tx.type, value: tx.value, date: tx.date,
      qty: tx.qty, description: tx.desc, category: tx.category, payment: tx.payment,
      receipt_path: tx.receiptPath || null,
    };
  }

  var RECEIPT_BUCKET = 'comprovantes';
  var pendingReceipt = null; // arquivo PDF selecionado, aguardando envio

  function emptyForm(type) {
    return {
      type: type || 'entrada',
      value: '',
      date: new Date().toISOString().slice(0, 10),
      qty: '',
      desc: '',
      category: '',
      payment: 'Pix',
    };
  }
  function parseValue(s) {
    s = String(s).trim();
    if (!s) return 0;
    if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function fmt(n) {
    return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---------- status ----------
  function showStatus(msg, kind) {
    var el = document.getElementById('statusBar');
    if (!msg) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.textContent = msg;
    if (kind === 'error') { el.style.background = '#fbeae5'; el.style.color = '#a8442b'; }
    else { el.style.background = '#f0eee7'; el.style.color = '#6b6862'; }
  }

  // ---------- carregar dados do banco ----------
  function loadData() {
    if (!db) return;
    showStatus('Carregando…');
    db.from('transactions').select('*').then(function (res) {
      if (res.error) { showStatus('Erro ao carregar: ' + res.error.message, 'error'); render(); return; }
      state.transactions = (res.data || []).map(fromDb);
      saveCache(state.transactions);
      showStatus('');
      render();
    });
  }

  // ---------- ações ----------
  function addTx() {
    var f = state.form;
    var value = parseValue(f.value);
    if (!value || value <= 0) { setError('Informe um valor maior que zero.'); return; }
    if (!f.date) { setError('Informe a data.'); return; }

    var file = pendingReceipt;
    if (file) {
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { setError('O comprovante precisa ser um arquivo PDF.'); return; }
      if (file.size > 10 * 1024 * 1024) { setError('O PDF é muito grande (máximo 10 MB).'); return; }
      if (!db) { setError('Para anexar comprovantes é preciso configurar o Supabase (veja o GUIA.md).'); return; }
    }

    var tx = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: f.type,
      value: value,
      date: f.date,
      qty: f.qty ? String(f.qty).replace(/[^0-9]/g, '') : '',
      desc: f.desc.trim() || '(sem descrição)',
      category: f.category.trim(),
      payment: f.payment,
      receiptPath: '',
    };

    var finish = function () {
      state.transactions = [tx].concat(state.transactions);
      saveCache(state.transactions);
      state.year = new Date(f.date + 'T00:00:00').getFullYear();
      state.form = Object.assign(emptyForm(f.type), { date: f.date });
      state.error = '';
      clearReceipt();
      render();
      showStatus('');
    };

    // Sem banco (modo local/preview): só mostra na tela.
    if (!db) { finish(); return; }

    var btn = document.getElementById('addBtn');
    btn.disabled = true;
    btn.textContent = file ? 'Enviando comprovante…' : 'Salvando…';
    var done = function (ok, msg) {
      btn.disabled = false;
      btn.textContent = 'Adicionar lançamento';
      if (!ok) setError(msg || 'Não foi possível salvar.');
    };
    var doInsert = function () {
      db.from('transactions').insert(toDb(tx)).then(function (res) {
        if (res.error) { done(false, 'Não foi possível salvar na nuvem: ' + res.error.message); }
        else { done(true); finish(); }
      });
    };

    if (file) {
      var path = tx.id + '.pdf';
      db.storage.from(RECEIPT_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: true }).then(function (res) {
        if (res.error) { done(false, 'Não foi possível enviar o PDF: ' + res.error.message); return; }
        tx.receiptPath = (res.data && res.data.path) || path;
        doInsert();
      });
    } else {
      doInsert();
    }
  }

  // abre o comprovante num link temporário e seguro (válido por 2 min)
  function openReceipt(path) {
    if (!db || !path) return;
    db.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 120).then(function (res) {
      if (res.error || !res.data) { showStatus('Não foi possível abrir o comprovante.', 'error'); return; }
      window.open(res.data.signedUrl, '_blank');
    });
  }

  function clearReceipt() {
    pendingReceipt = null;
    var input = document.getElementById('fReceipt');
    if (input) input.value = '';
    var label = document.getElementById('fReceiptLabel');
    var name = document.getElementById('fReceiptName');
    var clr = document.getElementById('fReceiptClear');
    if (label) label.classList.remove('has-file');
    if (name) name.textContent = 'Escolher arquivo PDF…';
    if (clr) clr.style.display = 'none';
  }

  function deleteTx(id) {
    var backup = state.transactions.slice();
    var removed = state.transactions.filter(function (t) { return t.id === id; })[0];
    state.transactions = state.transactions.filter(function (t) { return t.id !== id; });
    saveCache(state.transactions);
    render();

    if (!db) return;
    db.from('transactions').delete().eq('id', id).then(function (res) {
      if (res.error) {
        state.transactions = backup;
        saveCache(state.transactions);
        showStatus('Não foi possível remover na nuvem: ' + res.error.message, 'error');
        render();
      } else if (removed && removed.receiptPath) {
        db.storage.from(RECEIPT_BUCKET).remove([removed.receiptPath]);
      }
    });
  }

  function setError(msg) { state.error = msg; render(); }

  function exportPDF() {
    var labels = { entrada: 'Entrada', saida: 'Saída', imprevisto: 'Imprevisto' };
    var colors = { entrada: '#2f8f5b', saida: '#c0553b', imprevisto: '#cf9436' };
    var year = state.year;
    var rows = state.transactions
      .filter(function (t) { return new Date(t.date + 'T00:00:00').getFullYear() === year; })
      .slice()
      .sort(function (a, b) { return a.date.localeCompare(b.date) || a.id - b.id; });

    var te = 0, ts = 0, ti = 0;
    rows.forEach(function (t) {
      if (t.type === 'entrada') te += t.value;
      else if (t.type === 'saida') ts += t.value;
      else ti += t.value;
    });
    var resultado = te - ts - ti;

    var body = rows.map(function (t) {
      var d = t.date.split('-');
      var c = colors[t.type] || colors.entrada;
      var sign = t.type === 'entrada' ? '+ ' : '– ';
      return '<tr>' +
        '<td>' + d[2] + '/' + d[1] + '/' + d[0] + '</td>' +
        '<td><b style="color:' + c + '">' + (labels[t.type] || t.type) + '</b></td>' +
        '<td>' + esc(t.desc) + (t.receiptPath ? ' <span class="clip">PDF</span>' : '') + '</td>' +
        '<td>' + esc(t.category || '—') + '</td>' +
        '<td class="r">' + (t.qty ? esc(t.qty) : '—') + '</td>' +
        '<td>' + esc(t.payment) + '</td>' +
        '<td class="r" style="color:' + c + ';font-weight:600;white-space:nowrap;">' + sign + fmt(t.value) + '</td>' +
        '</tr>';
    }).join('');

    var card = function (label, value, color) {
      return '<div class="card"><div class="clabel">' + label + '</div><div class="cvalue" style="color:' + color + '">' + value + '</div></div>';
    };
    var resStr = (resultado < 0 ? '– ' : '') + fmt(Math.abs(resultado));
    var cards =
      card('Entradas', fmt(te), colors.entrada) +
      card('Saídas', fmt(ts), colors.saida) +
      card('Imprevistos', fmt(ti), colors.imprevisto) +
      card('Resultado do ano', resStr, resultado >= 0 ? '#2f8f5b' : '#c0553b');

    var table = rows.length
      ? '<table><thead><tr>' +
        '<th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th class="r">Qtd</th><th>Pagamento</th><th class="r">Valor</th>' +
        '</tr></thead><tbody>' + body + '</tbody>' +
        '<tfoot><tr><td colspan="6" class="r">Resultado do ano</td><td class="r" style="color:' + (resultado >= 0 ? '#2f8f5b' : '#c0553b') + '">' + resStr + '</td></tr></tfoot>' +
        '</table>'
      : '<p class="empty">Nenhum lançamento em ' + year + '.</p>';

    var logoUrl = location.origin + location.pathname.replace(/[^/]*$/, '') + 'logo.png';
    var gerado = new Date().toLocaleDateString('pt-BR');

    var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<title>Plantacao Coqueiros - ' + year + '</title><style>' +
      '*{box-sizing:border-box;} body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#26251f;background:#fff;margin:0;padding:26px;-webkit-print-color-adjust:exact;print-color-adjust:exact;} ' +
      '.report{max-width:920px;margin:0 auto;} ' +
      'header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #26251f;padding-bottom:16px;margin-bottom:20px;} ' +
      '.logo{width:56px;height:56px;object-fit:contain;} h1{margin:0;font-size:22px;} header p{margin:4px 0 0;color:#6b6862;font-size:14px;} ' +
      '.cards{display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap;} ' +
      '.card{flex:1;min-width:150px;border:1px solid #e6e3dc;border-radius:10px;padding:12px 14px;} ' +
      '.clabel{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b6862;font-weight:600;} ' +
      '.cvalue{font-size:18px;font-weight:700;margin-top:6px;} ' +
      'table{width:100%;border-collapse:collapse;font-size:12.5px;} ' +
      'th{text-align:left;border-bottom:1.5px solid #26251f;padding:8px 6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#6b6862;} ' +
      'td{padding:8px 6px;border-bottom:1px solid #efece5;} .r{text-align:right;} ' +
      'tfoot td{font-weight:700;border-top:2px solid #26251f;border-bottom:none;padding-top:10px;} ' +
      '.clip{font-size:9px;color:#2f6f8f;border:1px solid #cfe0e8;border-radius:4px;padding:1px 4px;} ' +
      '.empty{text-align:center;color:#8a867c;padding:40px 0;} ' +
      'footer{margin-top:22px;color:#a8a49a;font-size:11px;text-align:center;} ' +
      '@page{margin:14mm;} @media print{body{padding:0;}}' +
      '</style></head><body><div class="report">' +
      '<header><img class="logo" src="' + logoUrl + '"><div><h1>Gestão da Plantação</h1><p>Relatório de ' + year + '</p></div></header>' +
      '<section class="cards">' + cards + '</section>' +
      table +
      '<footer>Gerado em ' + gerado + ' · Gestão da Plantação — Coqueiros</footer>' +
      '</div>' +
      '<script>window.onload=function(){var i=document.querySelector("img");function p(){setTimeout(function(){window.focus();window.print();},200);}if(i&&!i.complete){i.onload=p;i.onerror=p;}else{p();}};<\/script>' +
      '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { showStatus('Libere os pop-ups do navegador para exportar o PDF.', 'error'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ---------- helpers ----------
  function styleStr(obj) {
    return Object.keys(obj).map(function (k) {
      var prop = k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); });
      return prop + ':' + obj[k];
    }).join(';');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- render ----------
  function render() {
    var year = state.year;
    var all = state.transactions;
    var tx = all.filter(function (t) { return new Date(t.date + 'T00:00:00').getFullYear() === year; });

    var months = MONTHS.map(function (name, i) { return { name: name, i: i, entrada: 0, saida: 0, imprevisto: 0 }; });
    tx.forEach(function (t) {
      var m = new Date(t.date + 'T00:00:00').getMonth();
      if (t.type === 'entrada') months[m].entrada += t.value;
      else if (t.type === 'saida') months[m].saida += t.value;
      else months[m].imprevisto += t.value;
    });

    var totalEntrada = months.reduce(function (a, m) { return a + m.entrada; }, 0);
    var totalSaida = months.reduce(function (a, m) { return a + m.saida; }, 0);
    var totalImprevisto = months.reduce(function (a, m) { return a + m.imprevisto; }, 0);
    var resultado = totalEntrada - totalSaida - totalImprevisto;

    document.getElementById('kpiEntrada').textContent = fmt(totalEntrada);
    document.getElementById('kpiSaida').textContent = fmt(totalSaida);
    document.getElementById('kpiImprevisto').textContent = fmt(totalImprevisto);
    var kr = document.getElementById('kpiResultado');
    kr.textContent = (resultado >= 0 ? '' : '– ') + fmt(Math.abs(resultado));
    kr.style.color = resultado >= 0 ? '#7fce9e' : '#e79c86';

    var ySet = {};
    all.forEach(function (t) { ySet[new Date(t.date + 'T00:00:00').getFullYear()] = true; });
    ySet[new Date().getFullYear()] = true;
    ySet[year] = true;
    var years = Object.keys(ySet).map(Number).sort(function (a, b) { return b - a; });
    var sel = document.getElementById('yearSelect');
    sel.innerHTML = years.map(function (y) {
      return '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>';
    }).join('');

    var maxVal = Math.max.apply(null, [1].concat(months.map(function (m) {
      return Math.max(m.entrada, m.saida, m.imprevisto);
    })));
    // formato curto para os eixos (ex.: 12500 -> "12,5k", 2000000 -> "2M")
    var fmtShort = function (n) {
      var a = Math.abs(n);
      if (a >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '').replace('.', ',') + 'M';
      if (a >= 1000) return (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + 'k';
      return String(Math.round(n));
    };
    var bar = function (v, color) {
      return styleStr({
        flex: '1 1 0',
        maxWidth: '12px',
        minWidth: '0',
        height: (v / maxVal * 100).toFixed(2) + '%',
        minHeight: v > 0 ? '3px' : '0px',
        background: color,
        borderRadius: '3px 3px 0 0',
        transition: 'height 0.35s ease',
      });
    };
    var barTicks = [1, 0.75, 0.5, 0.25, 0].map(function (r) { return fmtShort(maxVal * r); });
    var gridlines = [0, 25, 50, 75, 100].map(function (p) {
      return '<div style="position: absolute; left: 0; right: 0; bottom: ' + p + '%; border-top: 1px solid #f0eee7;"></div>';
    }).join('');
    var monthsHtml = months.map(function (m) {
      return '<div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;">' +
        '<div style="height: 200px; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px;">' +
        '<div style="' + bar(m.entrada, C.entrada) + '"></div>' +
        '<div style="' + bar(m.saida, C.saida) + '"></div>' +
        '<div style="' + bar(m.imprevisto, C.imprevisto) + '"></div>' +
        '</div>' +
        '<div style="font-size: 11px; color: #8a867c; font-weight: 500;">' + m.name + '</div>' +
        '</div>';
    }).join('');
    document.getElementById('barChart').innerHTML =
      '<div style="flex: 1; display: flex; gap: 8px; align-items: flex-start;">' +
        '<div style="height: 200px; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; font-family: inherit; font-size: 10px; color: #a8a49a;">' +
          barTicks.map(function (t) { return '<span>' + t + '</span>'; }).join('') +
        '</div>' +
        '<div style="flex: 1; position: relative;">' +
          '<div style="position: absolute; left: 0; right: 0; top: 0; height: 200px; pointer-events: none;">' + gridlines + '</div>' +
          '<div style="position: relative; display: flex; align-items: stretch; gap: 2px;">' + monthsHtml + '</div>' +
        '</div>' +
      '</div>';

    var cum = 0;
    var cumArr = months.map(function (m) { cum += m.entrada - m.saida - m.imprevisto; return cum; });
    var L = { left: 40, right: 16, top: 24, bottom: 196, W: 720 };
    var usable = L.W - L.left - L.right;
    var xOf = function (i) { return L.left + i * (usable / 11); };
    var vmin = Math.min.apply(null, [0].concat(cumArr));
    var vmax = Math.max.apply(null, [0].concat(cumArr));
    if (vmax === vmin) vmax = vmin + 1;
    var yOf = function (v) { return L.bottom - (v - vmin) / (vmax - vmin) * (L.bottom - L.top); };
    var linePts = cumArr.map(function (v, i) { return { x: +xOf(i).toFixed(1), y: +yOf(v).toFixed(1) }; });
    var linePoints = linePts.map(function (p) { return p.x + ',' + p.y; }).join(' ');
    var zeroY = +yOf(0).toFixed(1);
    var areaPath = 'M' + linePts[0].x + ',' + zeroY + ' ' +
      linePts.map(function (p) { return 'L' + p.x + ',' + p.y; }).join(' ') +
      ' L' + linePts[linePts.length - 1].x + ',' + zeroY + ' Z';

    // eixo Y com valores + linhas de grade
    var yTicks = [];
    for (var yi = 0; yi <= 4; yi++) { yTicks.push(vmin + (vmax - vmin) * yi / 4); }
    var yAxis = yTicks.map(function (v) {
      var y = +yOf(v).toFixed(1);
      return '<line x1="40" y1="' + y + '" x2="704" y2="' + y + '" stroke="#f0eee7" stroke-width="1"></line>' +
        '<text x="34" y="' + (y + 3) + '" text-anchor="end" font-size="10" fill="#a8a49a">' + fmtShort(v) + '</text>';
    }).join('');
    // rótulo do valor acumulado atual (último ponto)
    var lastP = linePts[linePts.length - 1];
    var lastVal = cumArr[cumArr.length - 1];
    var lastLabel = tx.length
      ? '<text x="' + lastP.x + '" y="' + (lastP.y - 10) + '" text-anchor="end" font-size="12" font-weight="600" fill="#26251f">' + (lastVal < 0 ? '-' : '') + 'R$ ' + fmtShort(Math.abs(lastVal)) + '</text>'
      : '';

    document.getElementById('lineChart').innerHTML =
      yAxis +
      '<line x1="40" y1="' + zeroY + '" x2="704" y2="' + zeroY + '" stroke="#c7c2b6" stroke-width="1" stroke-dasharray="4 4"></line>' +
      '<path d="' + areaPath + '" fill="#26251f" fill-opacity="0.05"></path>' +
      '<polyline points="' + linePoints + '" fill="none" stroke="#26251f" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
      linePts.map(function (p) {
        return '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="#fff" stroke="#26251f" stroke-width="2"></circle>';
      }).join('') +
      lastLabel;

    document.getElementById('lineLabels').innerHTML = months.map(function (m) {
      return '<div style="flex: 1; text-align: center; font-size: 11px; color: #8a867c;">' + m.name + '</div>';
    }).join('');

    var typeInfo = {
      entrada: { label: 'Entrada', color: C.entrada, bg: '#e7f3ec' },
      saida: { label: 'Saída', color: C.saida, bg: '#f9e9e4' },
      imprevisto: { label: 'Imprevisto', color: C.imprevisto, bg: '#f8efdd' },
    };
    var rows = tx.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });

    document.getElementById('tableTitle').textContent = 'Lançamentos de ' + year;
    document.getElementById('countStr').textContent = rows.length === 1 ? '1 lançamento' : rows.length + ' lançamentos';

    var area = document.getElementById('tableArea');
    if (rows.length === 0) {
      area.innerHTML = '<div style="text-align: center; padding: 48px 20px; color: #a8a49a;">' +
        '<div style="font-size: 15px; font-weight: 500; color: #8a867c;">Nenhum lançamento em ' + year + '</div>' +
        '<div style="font-size: 13px; margin-top: 6px;">Adicione o primeiro no formulário ao lado.</div>' +
        '</div>';
    } else {
      var body = rows.map(function (t) {
        var info = typeInfo[t.type] || typeInfo.entrada;
        var d = t.date.split('-');
        var sign = t.type === 'entrada' ? '+ ' : '– ';
        var badge = styleStr({ display: 'inline-block', fontSize: '12px', fontWeight: 600, color: info.color, background: info.bg, padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap' });
        return '<tr style="border-bottom: 1px solid #f0eee7;">' +
          '<td style="padding: 12px 8px; font-size: 13px; font-family: inherit; color: #6b6862; white-space: nowrap;">' + d[2] + '/' + d[1] + '/' + d[0] + '</td>' +
          '<td style="padding: 12px 8px;"><span style="' + badge + '">' + info.label + '</span></td>' +
          '<td style="padding: 12px 8px; font-size: 14px;">' + esc(t.desc) + '</td>' +
          '<td style="padding: 12px 8px; font-size: 13px; color: #6b6862;">' + esc(t.category || '—') + '</td>' +
          '<td style="padding: 12px 8px; font-size: 13px; font-family: inherit; color: #6b6862; text-align: right;">' + (t.qty ? esc(t.qty) : '—') + '</td>' +
          '<td style="padding: 12px 8px; font-size: 13px; color: #6b6862;">' + esc(t.payment) + '</td>' +
          '<td style="padding: 12px 8px; font-size: 14px; font-family: inherit; font-weight: 600; text-align: right; white-space: nowrap; color: ' + info.color + ';">' + sign + fmt(t.value) + '</td>' +
          '<td style="padding: 12px 8px; text-align: right; white-space: nowrap;">' +
          (t.receiptPath ? '<button class="receipt-link" data-receipt="' + esc(t.receiptPath) + '" title="Ver comprovante (PDF)">📎</button>' : '') +
          '<button data-del="' + t.id + '" title="Remover" style="border: none; background: none; color: #b6b2a7; cursor: pointer; font-size: 16px; padding: 4px 8px; border-radius: 6px; line-height: 1;">✕</button></td>' +
          '</tr>';
      }).join('');
      area.innerHTML = '<div style="overflow-x: auto;"><table style="width: 100%; border-collapse: collapse; min-width: 720px;">' +
        '<thead><tr style="text-align: left; border-bottom: 1px solid #e6e3dc;">' +
        '<th class="th">Data</th><th class="th">Tipo</th><th class="th">Descrição</th><th class="th">Categoria</th>' +
        '<th class="th" style="text-align: right;">Qtd</th><th class="th">Pagamento</th><th class="th" style="text-align: right;">Valor</th><th style="padding: 10px 8px;"></th>' +
        '</tr></thead><tbody>' + body + '</tbody></table></div>';
    }

    var exp = document.getElementById('exportBtn');
    var disabled = rows.length === 0;
    exp.disabled = disabled;
    exp.setAttribute('style', styleStr({
      display: 'flex', alignItems: 'center', gap: '7px',
      padding: '9px 14px', border: '1px solid #d9d5cc', borderRadius: '8px',
      background: disabled ? '#f4f2ec' : '#fff',
      color: disabled ? '#b6b2a7' : '#26251f',
      fontSize: '14px', fontWeight: '600',
      cursor: disabled ? 'not-allowed' : 'pointer',
    }));

    ['entrada', 'saida', 'imprevisto'].forEach(function (type) {
      var btn = document.querySelector('.tab[data-type="' + type + '"]');
      var active = state.form.type === type;
      btn.classList.toggle('active', active);
      btn.style.color = active ? C[type] : '#6b6862';
    });
    document.getElementById('fValue').value = state.form.value;
    document.getElementById('fDate').value = state.form.date;
    document.getElementById('fQty').value = state.form.qty;
    document.getElementById('fDesc').value = state.form.desc;
    document.getElementById('fCategory').value = state.form.category;
    document.getElementById('fPayment').value = state.form.payment;

    var err = document.getElementById('formError');
    if (state.error) { err.style.display = 'block'; err.textContent = state.error; }
    else { err.style.display = 'none'; }
  }

  // ---------- eventos do app ----------
  function setField(name, val) { state.form[name] = val; state.error = ''; }

  document.getElementById('yearSelect').addEventListener('change', function (e) {
    state.year = parseInt(e.target.value, 10);
    render();
  });
  document.getElementById('exportBtn').addEventListener('click', function () {
    if (!this.disabled) exportPDF();
  });
  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () { setField('type', btn.getAttribute('data-type')); render(); });
  });
  var bind = [['fValue', 'value'], ['fDate', 'date'], ['fQty', 'qty'], ['fDesc', 'desc'], ['fCategory', 'category']];
  bind.forEach(function (pair) {
    document.getElementById(pair[0]).addEventListener('input', function (e) { setField(pair[1], e.target.value); });
  });
  document.getElementById('fPayment').addEventListener('change', function (e) { setField('payment', e.target.value); });
  document.getElementById('addBtn').addEventListener('click', addTx);
  document.getElementById('tableArea').addEventListener('click', function (e) {
    var r = e.target.closest('button[data-receipt]');
    if (r) { openReceipt(r.getAttribute('data-receipt')); return; }
    var b = e.target.closest('button[data-del]');
    if (b) deleteTx(Number(b.getAttribute('data-del')));
  });

  // campo de comprovante (PDF)
  document.getElementById('fReceipt').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) { clearReceipt(); return; }
    pendingReceipt = file;
    document.getElementById('fReceiptName').textContent = file.name;
    document.getElementById('fReceiptLabel').classList.add('has-file');
    document.getElementById('fReceiptClear').style.display = 'inline-block';
    state.error = '';
    document.getElementById('formError').style.display = 'none';
  });
  document.getElementById('fReceiptClear').addEventListener('click', clearReceipt);
  document.getElementById('addBtn').addEventListener('mouseenter', function () { this.style.background = '#3a3830'; });
  document.getElementById('addBtn').addEventListener('mouseleave', function () { this.style.background = '#26251f'; });
  document.getElementById('exportBtn').addEventListener('mouseenter', function () { if (!this.disabled) this.style.borderColor = '#26251f'; });
  document.getElementById('exportBtn').addEventListener('mouseleave', function () { if (!this.disabled) this.style.borderColor = '#d9d5cc'; });

  // ---------- login ----------
  function showApp() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    render();
    loadData();
  }
  function showLogin(msg) {
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginOverlay').style.display = 'grid';
    var e = document.getElementById('loginError');
    if (msg) { e.style.display = 'block'; e.textContent = msg; } else { e.style.display = 'none'; }
    if (!configured) document.getElementById('loginConfigNote').style.display = 'block';
  }

  function doLogin() {
    if (!db) { showLogin('Configure o Supabase primeiro (veja o GUIA.md).'); return; }
    var pass = document.getElementById('loginPassword').value;
    if (!pass) { showLogin('Digite a senha.'); return; }
    document.getElementById('loginBtn').textContent = 'Entrando…';
    db.auth.signInWithPassword({ email: FAMILY_EMAIL, password: pass }).then(function (res) {
      document.getElementById('loginBtn').textContent = 'Entrar';
      if (res.error) { showLogin('Senha incorreta.'); return; }
      showApp();
    });
  }

  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('loginPassword').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLogin();
  });
  var EYE_ON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  var EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
  document.getElementById('loginToggle').addEventListener('click', function () {
    var inp = document.getElementById('loginPassword');
    var show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    this.innerHTML = show ? EYE_OFF : EYE_ON;
    this.title = show ? 'Ocultar senha' : 'Mostrar senha';
    inp.focus();
  });
  document.getElementById('logoutBtn').addEventListener('click', function () {
    if (db) db.auth.signOut().then(function () { showLogin(); });
    else showLogin();
  });

  // ---------- início ----------
  if (!configured) {
    showLogin();
  } else {
    db.auth.getSession().then(function (res) {
      if (res.data && res.data.session) showApp();
      else showLogin();
    });
  }
})();
