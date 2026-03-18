import { CDN, newNonce, shell } from './viewerShell';

/**
 * PapaParse-based CSV/TSV viewer.
 * fileData is pre-fetched in the extension host (no CORS restrictions).
 * Features: sortable columns, column stats, search/filter, export (CSV/TSV/JSON), pagination.
 */
export function csvHtml(fileName: string, ext: string, fileData: string, isDark = true): string {
  const nonce = newNonce();
  const delimiter = ext === '.tsv' ? '\\t' : ',';
  // Safely embed arbitrary file text as a JSON string literal
  const fileDataJson = JSON.stringify(fileData);

  const extraHead = `
  <style>
    html, body { display: flex; flex-direction: column; font-family: var(--vscode-font-family, system-ui), sans-serif; }

    /* ── Toolbar ── */
    #toolbar {
      flex-shrink: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #e0e0e0);
      background: var(--vscode-sideBar-background, #f3f3f3);
      font-size: 12px; color: var(--vscode-descriptionForeground, #555);
    }
    #stats { margin-right: 4px; }
    #toolbar button {
      padding: 2px 10px; font-size: 11px; cursor: pointer; border-radius: 3px;
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border, #ccc));
      background: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground, #111));
    }
    #toolbar button:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.15)); }
    #toolbar button.active {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border-color: var(--vscode-button-background, #0e639c);
    }
    #search-input {
      margin-left: auto; padding: 2px 8px; border-radius: 3px; font-size: 12px; width: 180px;
      border: 1px solid var(--vscode-input-border, #ccc);
      background: var(--vscode-input-background, #fff);
      color: var(--vscode-input-foreground, #111);
      outline: none;
    }
    #search-input:focus { border-color: var(--vscode-focusBorder, #4da3ff); }

    /* ── Pagination ── */
    #pagination {
      flex-shrink: 0; display: flex; align-items: center; gap: 8px;
      padding: 4px 12px; font-size: 12px;
      border-top: 1px solid var(--vscode-panel-border, #e0e0e0);
      background: var(--vscode-sideBar-background, #f3f3f3);
      color: var(--vscode-descriptionForeground, #555);
    }
    #pagination button {
      padding: 2px 8px; font-size: 11px; cursor: pointer; border-radius: 3px;
      border: 1px solid var(--vscode-panel-border, #ccc);
      background: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground, #111));
    }
    #pagination button:disabled { opacity: 0.4; cursor: default; }
    #pagination button:not(:disabled):hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.15)); }

    /* ── Table ── */
    #table-wrap { flex: 1; overflow: auto; }
    table { border-collapse: collapse; min-width: 100%; font-size: 12px; }
    thead th {
      position: sticky; top: 0; z-index: 2;
      background: var(--vscode-list-activeSelectionBackground, #094771);
      color: var(--vscode-list-activeSelectionForeground, #fff);
      padding: 0; white-space: nowrap;
    }
    .th-inner {
      display: flex; align-items: center; gap: 4px;
      padding: 5px 10px; cursor: pointer;
      border-right: 1px solid rgba(128,128,128,0.2);
    }
    .th-inner:hover { background: rgba(128,128,128,0.2); }
    .sort-indicator { font-size: 10px; opacity: 0.7; }
    .th-stats-btn {
      margin-left: auto; padding: 0 4px; font-size: 10px; cursor: pointer; opacity: 0.7;
      background: none; border: none; color: inherit;
    }
    .th-stats-btn:hover { opacity: 1; }
    tbody td {
      padding: 3px 10px;
      border-bottom: 1px solid var(--vscode-panel-border, #e8e8e8);
      border-right: 1px solid var(--vscode-panel-border, #f0f0f0);
      white-space: nowrap; max-width: 260px;
      overflow: hidden; text-overflow: ellipsis;
      font-family: var(--vscode-editor-font-family, monospace); font-size: 12px;
    }
    tbody tr:nth-child(even) td { background: var(--vscode-list-hoverBackground, rgba(0,0,0,0.03)); }
    tbody tr:hover td {
      background: var(--vscode-list-hoverBackground, rgba(0,0,0,0.06)) !important;
    }
    .numeric-cell { text-align: right; }

    /* ── Stats Modal ── */
    #stats-modal {
      display: none; position: fixed; inset: 0; z-index: 100;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.45);
    }
    #stats-modal.open { display: flex; }
    #stats-box {
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #444);
      border-radius: 6px; padding: 20px; min-width: 280px; max-width: 400px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      font-size: 13px;
    }
    #stats-box h3 {
      margin: 0 0 12px; font-size: 14px; font-weight: 600;
      color: var(--vscode-foreground, #ccc);
      display: flex; justify-content: space-between; align-items: center;
    }
    #stats-box h3 button {
      background: none; border: none; cursor: pointer; font-size: 16px;
      color: var(--vscode-foreground, #ccc); line-height: 1;
    }
    .stats-row {
      display: flex; justify-content: space-between;
      padding: 4px 0; border-bottom: 1px solid var(--vscode-panel-border, #333);
      color: var(--vscode-foreground, #ccc); font-size: 12px;
    }
    .stats-row:last-child { border-bottom: none; }
    .stats-label { color: var(--vscode-descriptionForeground, #888); }
    .stats-value { font-family: var(--vscode-editor-font-family, monospace); }
  </style>`;

  const body = /* html */`
  <div id="toolbar">
    <span id="stats">Loading…</span>
    <button id="export-csv">Export CSV</button>
    <button id="export-tsv">Export TSV</button>
    <button id="export-json">Export JSON</button>
    <input id="search-input" type="text" placeholder="Search rows…" style="display:none">
  </div>
  <div id="table-wrap"></div>
  <div id="pagination" style="display:none">
    <button id="pg-first">«</button>
    <button id="pg-prev">‹</button>
    <span id="pg-label"></span>
    <button id="pg-next">›</button>
    <button id="pg-last">»</button>
  </div>
  <div id="stats-modal">
    <div id="stats-box">
      <h3><span id="sm-title">Column Stats</span><button id="sm-close">×</button></h3>
      <div id="sm-rows"></div>
    </div>
  </div>

  <script src="${CDN.PAPAPARSE_JS}" nonce="${nonce}"></script>
  <script nonce="${nonce}">
  (function () {
    var PAGE_SIZE = 1000;

    // ── Parse ──────────────────────────────────────────────────────────────
    var raw = ${fileDataJson};
    var results = Papa.parse(raw, {
      delimiter: '${delimiter}',
      skipEmptyLines: true,
    });

    var allParsed = results.data;
    if (!allParsed.length) {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('table-wrap').innerHTML =
        '<div style="padding:20px;color:var(--vscode-descriptionForeground)">No data found.</div>';
      return;
    }

    document.getElementById('loading').style.display = 'none';

    var headers = allParsed[0] || [];
    var allRows  = allParsed.slice(1);

    // ── Column type detection ──────────────────────────────────────────────
    function detectColTypes() {
      return headers.map(function (_, ci) {
        var vals = allRows.map(function (r) { return r[ci] || ''; });
        var nonEmpty = vals.filter(function (v) { return v !== ''; });
        if (nonEmpty.length === 0) return 'string';
        var numCount = nonEmpty.filter(function (v) { return !isNaN(Number(v)); }).length;
        return numCount >= nonEmpty.length * 0.8 ? 'numeric' : 'string';
      });
    }
    var colTypes = detectColTypes();

    // ── Column stats ───────────────────────────────────────────────────────
    function calcColStats(ci) {
      var vals = allRows.map(function (r) { return (r[ci] !== undefined && r[ci] !== null) ? String(r[ci]) : ''; });
      var nonEmpty = vals.filter(function (v) { return v !== ''; });
      var nullCount = vals.length - nonEmpty.length;
      var unique = new Set(nonEmpty).size;
      var stats = {
        total: vals.length, nonEmpty: nonEmpty.length,
        nullCount: nullCount, unique: unique,
        type: colTypes[ci]
      };
      if (colTypes[ci] === 'numeric' && nonEmpty.length > 0) {
        var nums = nonEmpty.map(Number);
        stats.min = Math.min.apply(null, nums);
        stats.max = Math.max.apply(null, nums);
        stats.avg = nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
      }
      return stats;
    }

    // ── State ──────────────────────────────────────────────────────────────
    var sortCol = -1, sortAsc = true;
    var filterText = '';
    var currentPage = 0;

    function getFilteredSorted() {
      var rows = allRows.slice();
      if (filterText) {
        var q = filterText.toLowerCase();
        rows = rows.filter(function (r) {
          return r.some(function (c) { return c && String(c).toLowerCase().indexOf(q) >= 0; });
        });
      }
      if (sortCol >= 0) {
        var ci = sortCol, asc = sortAsc, isNum = colTypes[ci] === 'numeric';
        rows.sort(function (a, b) {
          var av = a[ci] !== undefined ? String(a[ci]) : '';
          var bv = b[ci] !== undefined ? String(b[ci]) : '';
          var cmp;
          if (isNum) {
            var an = parseFloat(av), bn = parseFloat(bv);
            if (isNaN(an) && isNaN(bn)) cmp = 0;
            else if (isNaN(an)) cmp = 1;
            else if (isNaN(bn)) cmp = -1;
            else cmp = an - bn;
          } else {
            cmp = av.localeCompare(bv);
          }
          return asc ? cmp : -cmp;
        });
      }
      return rows;
    }

    // ── Table rendering ────────────────────────────────────────────────────
    var theadRow = null, tbodyEl = null, tableEl = null;

    function buildTable() {
      var wrap = document.getElementById('table-wrap');
      tableEl = document.createElement('table');
      var thead = tableEl.createTHead();
      theadRow = thead.insertRow();
      headers.forEach(function (h, ci) {
        var th = document.createElement('th');
        th.innerHTML =
          '<div class="th-inner">' +
            '<span class="th-label">' + escHtml(h || ('Col ' + (ci + 1))) + '</span>' +
            '<span class="sort-indicator" id="sort-' + ci + '"></span>' +
            '<button class="th-stats-btn" data-ci="' + ci + '" title="Column stats">&#x2139;</button>' +
          '</div>';
        // click on label/indicator = sort
        th.querySelector('.th-inner').addEventListener('click', function (e) {
          if (e.target.classList.contains('th-stats-btn')) return;
          if (sortCol === ci) { sortAsc = !sortAsc; }
          else { sortCol = ci; sortAsc = true; }
          renderPage();
        });
        // stats button
        th.querySelector('.th-stats-btn').addEventListener('click', function (e) {
          e.stopPropagation();
          showStats(ci, h || ('Col ' + (ci + 1)));
        });
        theadRow.appendChild(th);
      });

      tbodyEl = tableEl.createTBody();
      wrap.innerHTML = '';
      wrap.appendChild(tableEl);
    }

    function renderPage() {
      var rows = getFilteredSorted();
      var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      if (currentPage >= totalPages) currentPage = totalPages - 1;

      var start = currentPage * PAGE_SIZE;
      var pageRows = rows.slice(start, start + PAGE_SIZE);

      // update sort indicators
      headers.forEach(function (_, ci) {
        var el = document.getElementById('sort-' + ci);
        if (el) el.textContent = (sortCol === ci) ? (sortAsc ? ' ▲' : ' ▼') : '';
      });

      // rebuild tbody
      tbodyEl.innerHTML = '';
      pageRows.forEach(function (row) {
        var tr = tbodyEl.insertRow();
        headers.forEach(function (_, ci) {
          var td = tr.insertCell();
          var val = row[ci] !== undefined ? row[ci] : '';
          td.textContent = val;
          td.title = String(val);
          if (colTypes[ci] === 'numeric' && val !== '') td.classList.add('numeric-cell');
        });
      });

      // update stats bar
      var note = (filterText ? rows.length + ' matching / ' : '') + allRows.length.toLocaleString() + ' rows · ' + headers.length + ' columns';
      document.getElementById('stats').textContent = note;

      // pagination
      var pgBar = document.getElementById('pagination');
      if (totalPages > 1) {
        pgBar.style.display = 'flex';
        document.getElementById('pg-label').textContent =
          'Page ' + (currentPage + 1) + ' of ' + totalPages;
        document.getElementById('pg-first').disabled = currentPage === 0;
        document.getElementById('pg-prev').disabled  = currentPage === 0;
        document.getElementById('pg-next').disabled  = currentPage >= totalPages - 1;
        document.getElementById('pg-last').disabled  = currentPage >= totalPages - 1;
      } else {
        pgBar.style.display = 'none';
      }
    }

    // ── Stats modal ────────────────────────────────────────────────────────
    function showStats(ci, colName) {
      var s = calcColStats(ci);
      document.getElementById('sm-title').textContent = colName;
      var rows = [
        ['Type', s.type],
        ['Total rows', s.total.toLocaleString()],
        ['Non-empty', s.nonEmpty.toLocaleString()],
        ['Null / empty', s.nullCount.toLocaleString()],
        ['Unique values', s.unique.toLocaleString()],
      ];
      if (s.type === 'numeric') {
        rows.push(['Min', fmtNum(s.min)], ['Max', fmtNum(s.max)], ['Mean', fmtNum(s.avg)]);
      }
      document.getElementById('sm-rows').innerHTML = rows.map(function (r) {
        return '<div class="stats-row"><span class="stats-label">' + r[0] + '</span>' +
               '<span class="stats-value">' + r[1] + '</span></div>';
      }).join('');
      document.getElementById('stats-modal').classList.add('open');
    }

    document.getElementById('sm-close').addEventListener('click', function () {
      document.getElementById('stats-modal').classList.remove('open');
    });
    document.getElementById('stats-modal').addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('open');
    });

    // ── Export ─────────────────────────────────────────────────────────────
    function exportData(fmt) {
      var rows = getFilteredSorted();
      var content, mime, suffix;
      if (fmt === 'json') {
        var arr = rows.map(function (r) {
          var obj = {};
          headers.forEach(function (h, i) { obj[h] = r[i] !== undefined ? r[i] : ''; });
          return obj;
        });
        content = JSON.stringify(arr, null, 2);
        mime = 'application/json'; suffix = '.json';
      } else {
        var delim = fmt === 'tsv' ? '\\t' : ',';
        var lines = [headers.join(delim)].concat(rows.map(function (r) {
          return r.map(function (c) {
            var s = c !== undefined && c !== null ? String(c) : '';
            if (fmt === 'csv' && (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\\n') >= 0)) {
              s = '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
          }).join(delim);
        }));
        content = lines.join('\\n');
        mime = fmt === 'tsv' ? 'text/tab-separated-values' : 'text/csv';
        suffix = '.' + fmt;
      }
      var blob = new Blob([content], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = '${fileName.replace(/'/g, "\\'")}' + suffix;
      a.click(); URL.revokeObjectURL(url);
    }

    document.getElementById('export-csv').addEventListener('click', function () { exportData('csv'); });
    document.getElementById('export-tsv').addEventListener('click', function () { exportData('tsv'); });
    document.getElementById('export-json').addEventListener('click', function () { exportData('json'); });

    // ── Search ─────────────────────────────────────────────────────────────
    var searchInput = document.getElementById('search-input');
    searchInput.style.display = 'block';
    searchInput.addEventListener('input', function () {
      filterText = searchInput.value;
      currentPage = 0;
      renderPage();
    });

    // ── Pagination buttons ─────────────────────────────────────────────────
    document.getElementById('pg-first').addEventListener('click', function () { currentPage = 0; renderPage(); });
    document.getElementById('pg-prev').addEventListener('click', function () { if (currentPage > 0) { currentPage--; renderPage(); } });
    document.getElementById('pg-next').addEventListener('click', function () { currentPage++; renderPage(); });
    document.getElementById('pg-last').addEventListener('click', function () {
      currentPage = Math.max(0, Math.ceil(getFilteredSorted().length / PAGE_SIZE) - 1);
      renderPage();
    });

    // ── Utilities ──────────────────────────────────────────────────────────
    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function fmtNum(n) {
      if (n === undefined || n === null) return '—';
      return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }

    // ── Init ───────────────────────────────────────────────────────────────
    buildTable();
    renderPage();
  })();
  </script>`;

  return shell(nonce, fileName, extraHead, body,
    'background:var(--vscode-editor-background);color:var(--vscode-foreground);', isDark);
}
