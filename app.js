/* ============================================================
   CONFIGURAÇÃO DO SUPABASE  —  preencha estes 3 valores
   (veja o passo a passo no arquivo GUIA.md)
   ============================================================ */
var SUPABASE_URL      = 'https://SEU-PROJETO.supabase.co';   // URL do projeto
var SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON-AQUI';               // chave "anon public"
var FAMILY_EMAIL      = 'familia@coqueiros.com';             // e-mail da conta da família
/* ============================================================ */

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
    };
  }
  function toDb(tx) {
    return {
      id: tx.id, type: tx.type, value: tx.value, date: tx.date,
      qty: tx.qty, description: tx.desc, category: tx.category, payment: tx.payment,
    };
  }

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
    var tx = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      type: f.type,
      value: value,
      date: f.date,
      qty: f.qty ? String(f.qty).replace(/[^0-9]/g, '') : '',
      desc: f.desc.trim() || '(sem descrição)',
      category: f.category.trim(),
      payment: f.payment,
    };
    // otimista: mostra na hora
    state.transactions = [tx].concat(state.transactions);
    saveCache(state.transactions);
    state.year = new Date(f.date + 'T00:00:00').getFullYear();
    state.form = Object.assign(emptyForm(f.type), { date: f.date });
    state.error = '';
    render();

    if (!db) return;
    db.from('transactions').insert(toDb(tx)).then(function (res) {
      if (res.error) {
        // desfaz se falhou
        state.transactions = state.transactions.filter(function (t) { return t.id !== tx.id; });
        saveCache(state.transactions);
        showStatus('Não foi possível salvar na nuvem: ' + res.error.message, 'error');
        render();
      } else {
        showStatus('');
      }
    });
  }

  function deleteTx(id) {
    var backup = state.transactions.slice();
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
      }
    });
  }

  function setError(msg) { state.error = msg; render(); }

  function exportCSV() {
    var labels = { entrada: 'Entrada', saida: 'Saída', imprevisto: 'Imprevisto' };
    var year = state.year;
    var rows = state.transactions
      .filter(function (t) { return new Date(t.date + 'T00:00:00').getFullYear() === year; })
      .slice()
      .sort(function (a, b) { return a.date.localeCompare(b.date) || a.id - b.id; });
    var esc = function (v) {
      var s = String(v == null ? '' : v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var money = function (n) { return Number(n).toFixed(2).replace('.', ','); };
    var header = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Quantidade', 'Pagamento', 'Entrada', 'Saída', 'Imprevisto'];
    var lines = [header.join(';')];
    var te = 0, ts = 0, ti = 0;
    rows.forEach(function (t) {
      var d = t.date.split('-');
      var ent = t.type === 'entrada' ? t.value : '';
      var sai = t.type === 'saida' ? t.value : '';
      var imp = t.type === 'imprevisto' ? t.value : '';
      if (t.type === 'entrada') te += t.value;
      else if (t.type === 'saida') ts += t.value;
      else ti += t.value;
      lines.push([
        d[2] + '/' + d[1] + '/' + d[0],
        labels[t.type] || t.type,
        esc(t.desc), esc(t.category), t.qty || '', esc(t.payment),
        ent === '' ? '' : money(ent),
        sai === '' ? '' : money(sai),
        imp === '' ? '' : money(imp),
      ].join(';'));
    });
    lines.push('');
    lines.push(['TOTAIS', '', '', '', '', '', money(te), money(ts), money(ti)].join(';'));
    lines.push(['RESULTADO', '', '', '', '', '', money(te - ts - ti), '', ''].join(';'));
    var csv = '﻿' + lines.join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'plantacao-coqueiros-' + year + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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
    var bar = function (v, color) {
      return styleStr({
        width: '9px',
        height: (v / maxVal * 100).toFixed(2) + '%',
        minHeight: v > 0 ? '3px' : '0px',
        background: color,
        borderRadius: '3px 3px 0 0',
        transition: 'height 0.35s ease',
      });
    };
    document.getElementById('barChart').innerHTML = months.map(function (m) {
      return '<div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;">' +
        '<div style="height: 200px; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px;">' +
        '<div style="' + bar(m.entrada, C.entrada) + '"></div>' +
        '<div style="' + bar(m.saida, C.saida) + '"></div>' +
        '<div style="' + bar(m.imprevisto, C.imprevisto) + '"></div>' +
        '</div>' +
        '<div style="font-size: 11px; color: #8a867c; font-weight: 500;">' + m.name + '</div>' +
        '</div>';
    }).join('');

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

    document.getElementById('lineChart').innerHTML =
      '<line x1="40" y1="' + zeroY + '" x2="704" y2="' + zeroY + '" stroke="#d9d5cc" stroke-width="1" stroke-dasharray="4 4"></line>' +
      '<path d="' + areaPath + '" fill="#26251f" fill-opacity="0.05"></path>' +
      '<polyline points="' + linePoints + '" fill="none" stroke="#26251f" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
      linePts.map(function (p) {
        return '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="#fff" stroke="#26251f" stroke-width="2"></circle>';
      }).join('');

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
          '<td style="padding: 12px 8px; font-size: 13px; font-family: \'IBM Plex Mono\', monospace; color: #6b6862; white-space: nowrap;">' + d[2] + '/' + d[1] + '/' + d[0] + '</td>' +
          '<td style="padding: 12px 8px;"><span style="' + badge + '">' + info.label + '</span></td>' +
          '<td style="padding: 12px 8px; font-size: 14px;">' + esc(t.desc) + '</td>' +
          '<td style="padding: 12px 8px; font-size: 13px; color: #6b6862;">' + esc(t.category || '—') + '</td>' +
          '<td style="padding: 12px 8px; font-size: 13px; font-family: \'IBM Plex Mono\', monospace; color: #6b6862; text-align: right;">' + (t.qty ? esc(t.qty) : '—') + '</td>' +
          '<td style="padding: 12px 8px; font-size: 13px; color: #6b6862;">' + esc(t.payment) + '</td>' +
          '<td style="padding: 12px 8px; font-size: 14px; font-family: \'IBM Plex Mono\', monospace; font-weight: 600; text-align: right; white-space: nowrap; color: ' + info.color + ';">' + sign + fmt(t.value) + '</td>' +
          '<td style="padding: 12px 8px; text-align: right;"><button data-del="' + t.id + '" title="Remover" style="border: none; background: none; color: #b6b2a7; cursor: pointer; font-size: 16px; padding: 4px 8px; border-radius: 6px; line-height: 1;">✕</button></td>' +
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
    if (!this.disabled) exportCSV();
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
    var b = e.target.closest('button[data-del]');
    if (b) deleteTx(Number(b.getAttribute('data-del')));
  });
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
    document.getElementById('loginOverlay').style.display = 'flex';
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
