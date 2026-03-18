import { newNonce, shell } from './viewerShell';

/**
 * VCF / BCF variant viewer — 3 modes: Table, Chromosome, Impact.
 * Ported from bio-viewers (React → vanilla JS + SVG).
 * File data pre-fetched by extension host (no CORS in WebView).
 */
export function variantHtml(fileName: string, fileData: string, isDark = true): string {
  const nonce = newNonce();
  const dataJson = JSON.stringify(fileData);

  const extraHead = `<style>
    html, body { display: flex; flex-direction: column; overflow: hidden;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-foreground, #cccccc); }

    /* ── Toolbar ── */
    #toolbar {
      flex-shrink: 0; padding: 6px 12px; gap: 10px;
      display: flex; align-items: center; flex-wrap: wrap;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      background: var(--vscode-sideBar-background, #252526);
      font-family: var(--vscode-font-family, system-ui); font-size: 12px;
    }
    #stats-text { color: var(--vscode-descriptionForeground, #888); margin-right: 4px; }
    .tb-sep { width: 1px; height: 16px; background: var(--vscode-panel-border, #444); }
    .tab-group, .color-group { display: flex; gap: 2px; }
    .tab, .color-btn {
      padding: 3px 10px; border-radius: 3px; font-size: 11px; font-weight: 500;
      border: 1px solid var(--vscode-button-border, #555); cursor: pointer;
      background: var(--vscode-button-secondaryBackground, #3c3c3c);
      color: var(--vscode-button-secondaryForeground, #cccccc);
    }
    .tab.active, .color-btn.active {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border-color: var(--vscode-button-background, #0e639c);
    }
    .tb-select {
      padding: 2px 6px; border-radius: 3px; font-size: 11px; max-width: 160px;
      border: 1px solid var(--vscode-input-border, #555);
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #cccccc);
    }

    /* ── View panels ── */
    #view-table, #view-chromosome, #view-impact {
      flex: 1; display: flex; flex-direction: column; overflow: hidden;
    }

    /* ── Table view ── */
    #table-content { display: flex; flex-direction: column; flex: 1; overflow: hidden; padding: 8px; }
    .table-wrap { flex: 1; overflow: auto; border: 1px solid var(--vscode-panel-border, #3c3c3c); border-radius: 4px; }
    table { border-collapse: collapse; min-width: 100%; font-size: 12px; }
    thead th {
      position: sticky; top: 0; z-index: 2;
      padding: 6px 10px; text-align: left; font-weight: 600; white-space: nowrap;
      background: var(--vscode-list-activeSelectionBackground, #094771);
      color: var(--vscode-list-activeSelectionForeground, #fff);
      border-right: 1px solid rgba(255,255,255,0.1);
    }
    tbody tr { cursor: pointer; border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c); }
    tbody tr:hover td { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)) !important; }
    tbody tr.selected td { background: rgba(230,81,0,0.15) !important; border-left: 3px solid #e65100; }
    tbody td { padding: 4px 10px; white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
    .mono { font-family: var(--vscode-editor-font-family, monospace); }
    .badge {
      display: inline-block; padding: 1px 7px; border-radius: 3px;
      font-size: 10px; font-weight: 700; color: #fff;
    }
    .badge-pass { background: #16a34a; } .badge-fail { background: #dc2626; }
    .text-muted { color: var(--vscode-descriptionForeground, #888); }

    /* ── Pagination ── */
    .pagination {
      flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
      padding: 6px 8px; margin-top: 6px; font-size: 12px;
      border: 1px solid var(--vscode-panel-border, #3c3c3c); border-radius: 4px;
      background: var(--vscode-sideBar-background, #252526);
    }
    .page-btns { display: flex; align-items: center; gap: 8px; }
    .page-btns button {
      padding: 2px 10px; border-radius: 3px; font-size: 11px; cursor: pointer;
      border: 1px solid var(--vscode-button-border, #555);
      background: var(--vscode-button-secondaryBackground, #3c3c3c);
      color: var(--vscode-button-secondaryForeground, #ccc);
    }
    .page-btns button:disabled { opacity: 0.4; cursor: default; }

    /* ── Detail panel ── */
    .detail-panel {
      margin-top: 6px; padding: 12px;
      border: 1px solid var(--vscode-panel-border, #3c3c3c); border-radius: 4px;
      background: var(--vscode-editorWidget-background, #252526);
      font-size: 12px;
    }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 10px; }
    .detail-section h4 { font-size: 11px; font-weight: 700; margin-bottom: 6px;
      color: var(--vscode-descriptionForeground, #888); text-transform: uppercase; letter-spacing: 0.5px; }
    .detail-section > div { margin-bottom: 3px; }
    .detail-label { color: var(--vscode-descriptionForeground, #888); }
    .info-box {
      padding: 6px 8px; border-radius: 3px; font-size: 11px; max-height: 100px;
      overflow-y: auto; background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
    }

    /* ── Chromosome view ── */
    #chrom-content { flex: 1; overflow: auto; padding: 12px; }
    .chrom-svg-wrap { overflow: auto; }

    /* ── Impact view ── */
    #impact-content { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
    .impact-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    .impact-card {
      padding: 10px; border-radius: 4px; border: 2px solid transparent;
      background: var(--vscode-editorWidget-background, #252526);
    }
    .impact-dot { width: 12px; height: 12px; border-radius: 2px; display: inline-block; margin-bottom: 4px; }
    .impact-name { font-size: 11px; font-weight: 700; margin-bottom: 2px; color: var(--vscode-descriptionForeground, #888); }
    .impact-count { font-size: 20px; font-weight: 700; }
    .impact-pct { font-size: 10px; color: var(--vscode-descriptionForeground, #888); }
    .impact-genes { font-size: 10px; margin-top: 4px; color: var(--vscode-descriptionForeground, #888); }
    .impact-bars {
      padding: 12px; border-radius: 4px;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
    }
    .impact-bars h3 { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
    .bar-row { margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .bar-label { width: 80px; font-size: 11px; font-weight: 600; flex-shrink: 0; }
    .bar-track { flex: 1; height: 20px; background: var(--vscode-panel-border, #3c3c3c); border-radius: 10px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 10px; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; transition: width 0.4s; min-width: 0; }
    .bar-fill span { font-size: 10px; color: #fff; font-weight: 700; }
    .bar-pct { width: 40px; text-align: right; font-size: 11px; flex-shrink: 0; color: var(--vscode-descriptionForeground, #888); }
    .impact-panel {
      border-radius: 4px; overflow: hidden;
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
    }
    .impact-panel-header { padding: 8px 12px; font-size: 12px; font-weight: 700; color: #fff; }
    .impact-panel-body { padding: 10px 12px; background: var(--vscode-editorWidget-background, #252526); }
    .genes-section { margin-bottom: 10px; font-size: 12px; }
    .gene-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .gene-tag { padding: 1px 7px; background: var(--vscode-badge-background, #4d4d4d); color: var(--vscode-badge-foreground, #ccc); border-radius: 3px; font-size: 11px; }
    .gene-tag-more { color: var(--vscode-descriptionForeground, #888); font-size: 11px; padding: 1px 4px; }
    .impact-var-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
    .impact-var-table th { padding: 4px 8px; text-align: left; font-weight: 600;
      background: var(--vscode-list-activeSelectionBackground, #094771);
      color: var(--vscode-list-activeSelectionForeground, #fff); }
    .impact-var-table td { padding: 3px 8px; border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .impact-var-table tr[data-imp-idx] { cursor: pointer; }
    .impact-var-table tr[data-imp-idx]:hover td { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.05)); }
    .more-note { font-size: 11px; color: var(--vscode-descriptionForeground, #888); text-align: center; margin-top: 4px; }
    .impact-summary {
      padding: 10px 12px; border-radius: 4px; font-size: 12px;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
    }
    .no-variants { padding: 32px; text-align: center; color: var(--vscode-descriptionForeground, #888); font-size: 13px; }
    .trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>`;

  const body = /* html */`
  <div id="toolbar">
    <span id="stats-text">Parsing…</span>
    <div class="tb-sep"></div>
    <div class="tab-group" id="tabs">
      <button class="tab active" data-view="table">Table</button>
      <button class="tab" data-view="chromosome">Chromosome</button>
      <button class="tab" data-view="impact">Impact</button>
    </div>
    <div class="tb-sep"></div>
    <div class="color-group" id="color-group">
      <span style="font-size:11px;color:var(--vscode-descriptionForeground,#888)">Color:</span>
      <button class="color-btn active" data-color="type">Type</button>
      <button class="color-btn" data-color="impact">Impact</button>
    </div>
    <select id="chrom-filter" class="tb-select">
      <option value="all">All chromosomes</option>
    </select>
  </div>

  <div id="view-table"  style="flex:1;display:flex;flex-direction:column;overflow:hidden"><div id="table-content"></div></div>
  <div id="view-chromosome" style="flex:1;display:none;flex-direction:column;overflow:hidden"><div id="chrom-content" style="flex:1;overflow:auto;padding:12px"></div></div>
  <div id="view-impact"  style="flex:1;display:none;flex-direction:column;overflow:hidden"><div id="impact-content" style="flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:12px"></div></div>

  <script nonce="${nonce}">
  const RAW_DATA = ${dataJson};

  // ── Colour constants ─────────────────────────────────────────────────────────
  var TYPE_COLORS = {
    SNP:'#3b82f6', INDEL:'#10b981', INS:'#22c55e', DEL:'#ef4444',
    MNP:'#8b5cf6', CNV:'#f59e0b', SV:'#ec4899', OTHER:'#6b7280'
  };
  var IMPACT_COLORS = {
    HIGH:'#dc2626', MODERATE:'#f59e0b', LOW:'#3b82f6',
    MODIFIER:'#6b7280', UNKNOWN:'#9ca3af'
  };

  // ── State ────────────────────────────────────────────────────────────────────
  var S = {
    all: [], filtered: [],
    view: 'table', colorBy: 'type',
    page: 1, pageSize: 100,
    selected: null
  };

  // ── VCF Parser ───────────────────────────────────────────────────────────────
  function parseStructuredMeta(val) {
    var fields = {};
    var content = val.replace(/^<|>$/g, '');
    var parts = [], cur = '', inQ = false;
    for (var i = 0; i < content.length; i++) {
      var c = content[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur) parts.push(cur);
    parts.forEach(function(p) {
      var eq = p.indexOf('=');
      if (eq > 0) fields[p.slice(0, eq).trim()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    });
    return fields;
  }

  function parseInfoField(s) {
    var info = {};
    if (s === '.') return info;
    s.split(';').forEach(function(p) {
      var eq = p.indexOf('=');
      if (eq === -1) { info[p] = true; }
      else {
        var k = p.slice(0, eq), v = p.slice(eq + 1);
        var n = parseFloat(v);
        info[k] = isNaN(n) ? v : n;
      }
    });
    return info;
  }

  function determineType(ref, alt) {
    if (!alt || !alt.length || alt[0] === '.') return 'OTHER';
    var a = alt[0];
    if (ref.length === 1 && a.length === 1) return 'SNP';
    if (ref.length === a.length && ref.length > 1) return 'MNP';
    if (ref.length < a.length) return 'INS';
    if (ref.length > a.length) return 'DEL';
    return 'INDEL';
  }

  function determineImpact(info) {
    if (info.IMPACT) {
      var iv = info.IMPACT.toUpperCase();
      if (['HIGH','MODERATE','LOW','MODIFIER'].indexOf(iv) !== -1) return iv;
    }
    var ann = info.ANN || info.EFF;
    if (ann && typeof ann === 'string') {
      var levels = ['HIGH','MODERATE','LOW','MODIFIER'];
      for (var li = 0; li < levels.length; li++) {
        if (ann.indexOf(levels[li]) !== -1) return levels[li];
      }
    }
    if (info.CSQ && typeof info.CSQ === 'string') {
      var cl = ['HIGH','MODERATE','LOW'];
      for (var ci = 0; ci < cl.length; ci++) {
        if (info.CSQ.indexOf(cl[ci]) !== -1) return cl[ci];
      }
    }
    return 'UNKNOWN';
  }

  function extractGenes(info) {
    var genes = {};
    if (info.GENE) String(info.GENE).split(',').forEach(function(g) { genes[g.trim()] = 1; });
    if (info.ANN) String(info.ANN).split(',').forEach(function(a) {
      var f = a.split('|');
      if (f.length > 3 && f[3]) genes[f[3]] = 1;
    });
    if (info.CSQ) {
      var m = String(info.CSQ).match(/SYMBOL=([^;,|]+)/);
      if (m) genes[m[1]] = 1;
    }
    return Object.keys(genes);
  }

  function parseVCF(text) {
    var lines = text.split('\\n');
    var variants = [], samples = [], colHeaders = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.startsWith('##')) continue;
      if (line.startsWith('#CHROM')) {
        colHeaders = line.slice(1).split('\\t');
        var fi = colHeaders.indexOf('FORMAT');
        if (fi !== -1) samples = colHeaders.slice(fi + 1);
        continue;
      }
      var f = line.split('\\t');
      if (f.length < 8) continue;
      var chrom = f[0], pos = +f[1];
      var id = f[2] === '.' ? chrom + ':' + pos : f[2];
      var ref = f[3], alt = f[4].split(',');
      var qual = f[5] === '.' ? null : +f[5];
      var filter = (f[6] === '.' || f[6] === 'PASS') ? ['PASS'] : f[6].split(';');
      var info = parseInfoField(f[7]);
      var format, sampleData;
      if (f.length > 8) {
        format = f[8].split(':');
        sampleData = [];
        for (var si = 9; si < f.length && si - 9 < samples.length; si++) {
          var sf = f[si].split(':');
          var sr = {};
          format.forEach(function(k, ki) { if (sf[ki] !== undefined) sr[k] = sf[ki]; });
          sampleData.push(sr);
        }
      }
      var variantType = determineType(ref, alt);
      var variantImpact = determineImpact(info);
      var genes = extractGenes(info);
      var rsid = id.indexOf('rs') === 0 ? id : (info.RS ? 'rs' + info.RS : null);
      variants.push({
        id: id, chrom: chrom, pos: pos, ref: ref, alt: alt,
        qual: qual, filter: filter, info: info,
        format: format, samples: sampleData,
        variantType: variantType, variantImpact: variantImpact,
        genes: genes, rsid: rsid,
        af: info.AF !== undefined ? +info.AF : undefined,
        ac: info.AC !== undefined ? +info.AC : undefined,
        an: info.AN !== undefined ? +info.AN : undefined,
        dp: info.DP !== undefined ? +info.DP : undefined,
      });
    }
    var typeCounts = { SNP:0,INDEL:0,INS:0,DEL:0,MNP:0,CNV:0,SV:0,OTHER:0 };
    var impactCounts = { HIGH:0,MODERATE:0,LOW:0,MODIFIER:0,UNKNOWN:0 };
    var chromSet = {};
    variants.forEach(function(v) {
      typeCounts[v.variantType]++;
      impactCounts[v.variantImpact]++;
      chromSet[v.chrom] = 1;
    });
    return {
      variants: variants, samples: samples,
      stats: { total: variants.length, typeCounts: typeCounts, impactCounts: impactCounts,
               chromosomes: Object.keys(chromSet) }
    };
  }

  // ── Utilities ────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtAF(af) {
    if (af === undefined) return 'N/A';
    if (af < 0.001) return af.toExponential(2);
    if (af < 0.01) return af.toFixed(4);
    return af.toFixed(3);
  }

  function sortChrom(a, b) {
    var na = parseInt(a.replace(/\\D/g,''), 10), nb = parseInt(b.replace(/\\D/g,''), 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  }

  // ── View switching ───────────────────────────────────────────────────────────
  function setView(view) {
    S.view = view;
    ['table','chromosome','impact'].forEach(function(v) {
      document.getElementById('view-' + v).style.display = v === view ? 'flex' : 'none';
      var tab = document.querySelector('[data-view="' + v + '"]');
      if (tab) tab.classList.toggle('active', v === view);
    });
    if (view === 'chromosome') renderChromosome();
    else if (view === 'impact') renderImpact();
    else renderTable();
  }

  function setColorBy(color) {
    S.colorBy = color;
    document.querySelectorAll('.color-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.color === color);
    });
    if (S.view === 'chromosome') renderChromosome();
    else if (S.view === 'impact') renderImpact();
    else renderTable();
  }

  function filterByChrom(chrom) {
    S.filtered = chrom === 'all' ? S.all : S.all.filter(function(v) { return v.chrom === chrom; });
    S.page = 1; S.selected = null;
    if (S.view === 'table') renderTable();
    else if (S.view === 'chromosome') renderChromosome();
    else renderImpact();
  }

  // ── Table view ───────────────────────────────────────────────────────────────
  function renderTable() {
    document.getElementById('table-content').innerHTML = buildTableHtml();
  }

  function buildTableHtml() {
    var vars = S.filtered;
    var total = vars.length;
    var totalPages = Math.max(1, Math.ceil(total / S.pageSize));
    S.page = Math.min(S.page, totalPages);
    var start = (S.page - 1) * S.pageSize;
    var end = Math.min(start + S.pageSize, total);
    var pageVars = vars.slice(start, end);

    if (total === 0) return '<div class="no-variants">No variants to display</div>';

    var html = '<div class="table-wrap"><table>';
    html += '<thead><tr>';
    ['Chr','Position','ID','Type','REF','ALT','Quality','Filter','AF','Impact','Genes'].forEach(function(h) {
      html += '<th>' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    pageVars.forEach(function(v, i) {
      var ai = start + i;
      var isSel = S.selected === ai;
      var rowCls = isSel ? ' class="selected"' : '';
      var altStr = v.alt.map(function(a) { return a.length > 10 ? a.slice(0,10)+'…' : a; }).join(', ');
      var filterBadges = v.filter.map(function(f) {
        return '<span class="badge badge-' + (f === 'PASS' ? 'pass' : 'fail') + '">' + esc(f) + '</span>';
      }).join(' ');
      var typeColor = TYPE_COLORS[v.variantType] || '#6b7280';
      var impColor = IMPACT_COLORS[v.variantImpact] || '#9ca3af';

      html += '<tr data-idx="' + ai + '"' + rowCls + '>';
      html += '<td>' + esc(v.chrom) + '</td>';
      html += '<td class="mono">' + v.pos.toLocaleString() + '</td>';
      html += '<td class="trunc" title="' + esc(v.id) + '">' + esc(v.rsid || v.id) + '</td>';
      html += '<td><span class="badge" style="background:' + typeColor + '">' + v.variantType + '</span></td>';
      html += '<td class="mono">' + esc(v.ref.length > 10 ? v.ref.slice(0,10)+'…' : v.ref) + '</td>';
      html += '<td class="mono trunc">' + esc(altStr) + '</td>';
      html += '<td>' + (v.qual !== null ? v.qual.toFixed(1) : '<span class="text-muted">N/A</span>') + '</td>';
      html += '<td>' + filterBadges + '</td>';
      html += '<td>' + fmtAF(v.af) + '</td>';
      if (v.variantImpact && v.variantImpact !== 'UNKNOWN') {
        html += '<td><span class="badge" style="background:' + impColor + '">' + v.variantImpact + '</span></td>';
      } else {
        html += '<td><span class="text-muted">—</span></td>';
      }
      html += '<td class="trunc">' + (v.genes && v.genes.length ? esc(v.genes.join(', ')) : '—') + '</td>';
      html += '</tr>';

      if (isSel) {
        html += '<tr><td colspan="11" style="padding:0">' + buildDetailHtml(v) + '</td></tr>';
      }
    });

    html += '</tbody></table></div>';

    // Pagination
    html += '<div class="pagination">';
    html += '<span>Showing ' + (start+1) + '–' + end + ' of ' + total.toLocaleString() + ' variants</span>';
    html += '<div class="page-btns">';
    html += '<button data-page="-1"' + (S.page <= 1 ? ' disabled' : '') + '>Previous</button>';
    html += '<span>Page ' + S.page + ' of ' + totalPages + '</span>';
    html += '<button data-page="1"' + (S.page >= totalPages ? ' disabled' : '') + '>Next</button>';
    html += '</div></div>';

    return html;
  }

  function buildDetailHtml(v) {
    var html = '<div class="detail-panel">';
    html += '<div class="detail-grid">';
    // Location
    html += '<div class="detail-section"><h4>Location</h4>';
    html += '<div><span class="detail-label">Chromosome: </span>' + esc(v.chrom) + '</div>';
    html += '<div><span class="detail-label">Position: </span>' + v.pos.toLocaleString() + '</div>';
    html += '<div><span class="detail-label">ID: </span>' + esc(v.id) + '</div>';
    if (v.rsid) html += '<div><span class="detail-label">dbSNP: </span>' + esc(v.rsid) + '</div>';
    html += '</div>';
    // Alleles
    html += '<div class="detail-section"><h4>Alleles</h4>';
    html += '<div><span class="detail-label">REF: </span><span class="mono">' + esc(v.ref) + '</span></div>';
    html += '<div><span class="detail-label">ALT: </span><span class="mono">' + esc(v.alt.join(', ')) + '</span></div>';
    html += '<div><span class="detail-label">Type: </span>' + v.variantType + '</div>';
    html += '</div>';
    // Quality
    html += '<div class="detail-section"><h4>Quality</h4>';
    html += '<div><span class="detail-label">Score: </span>' + (v.qual !== null ? v.qual.toFixed(2) : 'N/A') + '</div>';
    html += '<div><span class="detail-label">Filter: </span>' + esc(v.filter.join(', ')) + '</div>';
    html += '</div>';
    // Population
    html += '<div class="detail-section"><h4>Population</h4>';
    if (v.af !== undefined) html += '<div><span class="detail-label">AF: </span>' + fmtAF(v.af) + '</div>';
    if (v.ac !== undefined) html += '<div><span class="detail-label">AC: </span>' + v.ac + '</div>';
    if (v.an !== undefined) html += '<div><span class="detail-label">AN: </span>' + v.an + '</div>';
    if (v.dp !== undefined) html += '<div><span class="detail-label">DP: </span>' + v.dp + '</div>';
    html += '</div>';
    html += '</div>'; // detail-grid

    // Genes & impact
    if (v.genes && v.genes.length) {
      html += '<div style="margin-bottom:6px;font-size:12px">';
      html += '<span class="detail-label">Genes: </span>' + esc(v.genes.join(', '));
      if (v.variantImpact && v.variantImpact !== 'UNKNOWN') {
        html += ' &nbsp; <span class="badge" style="background:' + IMPACT_COLORS[v.variantImpact] + '">' + v.variantImpact + '</span>';
      }
      html += '</div>';
    }

    // INFO fields
    var infoKeys = Object.keys(v.info);
    if (infoKeys.length) {
      html += '<div><span class="detail-label" style="font-size:11px">INFO: </span>';
      html += '<div class="info-box mono">';
      infoKeys.forEach(function(k) {
        html += '<div><span style="color:var(--vscode-descriptionForeground,#888)">' + esc(k) + ': </span>' + esc(String(v.info[k])) + '</div>';
      });
      html += '</div></div>';
    }

    html += '</div>';
    return html;
  }

  function selectVariant(idx) {
    S.selected = S.selected === idx ? null : idx;
    // Ensure selected variant is visible on current page
    if (S.selected !== null) {
      S.page = Math.floor(S.selected / S.pageSize) + 1;
    }
    renderTable();
  }

  function changePage(delta) {
    var total = S.filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / S.pageSize));
    S.page = Math.max(1, Math.min(totalPages, S.page + delta));
    S.selected = null;
    renderTable();
  }

  // ── Chromosome view ──────────────────────────────────────────────────────────
  function renderChromosome() {
    document.getElementById('chrom-content').innerHTML = buildChromHtml();
  }

  function buildChromHtml() {
    var chromMap = {};
    S.filtered.forEach(function(v) {
      if (!chromMap[v.chrom]) chromMap[v.chrom] = [];
      chromMap[v.chrom].push(v);
    });

    var chromData = Object.keys(chromMap).sort(sortChrom).map(function(chrom) {
      var vars = chromMap[chrom].slice().sort(function(a,b) { return a.pos - b.pos; });
      var maxPos = vars.reduce(function(m,v) { return Math.max(m, v.pos); }, 0);
      return { chrom: chrom, variants: vars, count: vars.length, maxPos: maxPos };
    });

    if (!chromData.length) return '<div class="no-variants">No variants</div>';

    var plotW = 560, chrH = 26, chrSpacing = 54, leftM = 90, topM = 36;
    var svgH = chromData.length * chrSpacing + topM + 40;
    var svgW = leftM + plotW + 80;

    var svg = '<svg width="' + svgW + '" height="' + svgH + '" style="font-family:var(--vscode-font-family,system-ui)">';

    // Title
    svg += '<text x="' + (leftM + plotW/2) + '" y="20" text-anchor="middle" font-size="12" font-weight="600" fill="var(--vscode-foreground,#ccc)">Variant Distribution by Chromosome</text>';

    chromData.forEach(function(c, i) {
      var y = topM + i * chrSpacing;
      var scale = c.maxPos > 0 ? plotW / c.maxPos : 1;

      // Label
      svg += '<text x="' + (leftM - 8) + '" y="' + (y + chrH/2) + '" text-anchor="end" font-size="11" fill="var(--vscode-foreground,#ccc)" dominant-baseline="middle">' + esc(c.chrom) + '</text>';

      // Background bar
      svg += '<rect x="' + leftM + '" y="' + y + '" width="' + plotW + '" height="' + chrH + '" fill="var(--vscode-panel-border,#3c3c3c)" stroke="var(--vscode-panel-border,#555)" rx="3"/>';

      // Dots (max 1000)
      c.variants.slice(0, 1000).forEach(function(v) {
        var x = leftM + v.pos * scale;
        var color = S.colorBy === 'type' ? (TYPE_COLORS[v.variantType] || '#3b82f6')
                  : S.colorBy === 'impact' ? (IMPACT_COLORS[v.variantImpact] || '#9ca3af')
                  : '#3b82f6';
        svg += '<circle cx="' + x + '" cy="' + (y + chrH/2) + '" r="2.5" fill="' + color + '" opacity="0.75">';
        svg += '<title>' + esc(c.chrom) + ':' + v.pos.toLocaleString();
        if (v.variantType) svg += ' | ' + v.variantType;
        if (v.qual !== null) svg += ' | Q:' + v.qual.toFixed(0);
        if (v.genes && v.genes.length) svg += ' | ' + esc(v.genes[0]);
        svg += '</title></circle>';
      });

      // Count label
      svg += '<text x="' + (leftM + plotW + 8) + '" y="' + (y + chrH/2) + '" font-size="10" fill="var(--vscode-descriptionForeground,#888)" dominant-baseline="middle">' + c.count.toLocaleString() + '</text>';

      // Scale
      svg += '<text x="' + leftM + '" y="' + (y + chrH + 11) + '" font-size="8" fill="var(--vscode-descriptionForeground,#888)">1</text>';
      svg += '<text x="' + (leftM + plotW) + '" y="' + (y + chrH + 11) + '" text-anchor="end" font-size="8" fill="var(--vscode-descriptionForeground,#888)">' + c.maxPos.toLocaleString() + '</text>';
      if (c.count > 1000) {
        svg += '<text x="' + (leftM + plotW/2) + '" y="' + (y + chrH + 22) + '" text-anchor="middle" font-size="8" fill="#f59e0b">showing 1,000 of ' + c.count.toLocaleString() + '</text>';
      }
    });

    // Legend
    var lx = leftM, ly = svgH - 12;
    var scheme = S.colorBy === 'impact' ? IMPACT_COLORS : TYPE_COLORS;
    Object.keys(scheme).forEach(function(k) {
      svg += '<circle cx="' + (lx+4) + '" cy="' + ly + '" r="3.5" fill="' + scheme[k] + '"/>';
      svg += '<text x="' + (lx+10) + '" y="' + ly + '" font-size="8" fill="var(--vscode-descriptionForeground,#888)" dominant-baseline="middle">' + k + '</text>';
      lx += k.length * 5.5 + 18;
    });

    svg += '</svg>';
    return '<div style="overflow:auto">' + svg + '</div>';
  }

  // ── Impact view ──────────────────────────────────────────────────────────────
  function renderImpact() {
    document.getElementById('impact-content').innerHTML = buildImpactHtml();
  }

  function buildImpactHtml() {
    var impactOrder = ['HIGH','MODERATE','LOW','MODIFIER','UNKNOWN'];
    var data = {};
    impactOrder.forEach(function(imp) { data[imp] = { count: 0, variants: [], genes: {} }; });
    S.filtered.forEach(function(v) {
      var imp = v.variantImpact || 'UNKNOWN';
      if (!data[imp]) return;
      data[imp].count++;
      data[imp].variants.push(v);
      if (v.genes) v.genes.forEach(function(g) { data[imp].genes[g] = 1; });
    });

    var total = S.filtered.length;
    var sorted = impactOrder.map(function(imp) {
      var d = data[imp];
      return {
        impact: imp, color: IMPACT_COLORS[imp],
        count: d.count, variants: d.variants,
        genes: Object.keys(d.genes),
        pct: total > 0 ? (d.count / total * 100) : 0,
      };
    }).sort(function(a, b) { return b.count - a.count; });

    var html = '';

    // Overview cards
    html += '<div class="impact-cards">';
    sorted.forEach(function(d) {
      html += '<div class="impact-card" style="border-color:' + d.color + '">';
      html += '<span class="impact-dot" style="background:' + d.color + '"></span>';
      html += '<div class="impact-name">' + d.impact + '</div>';
      html += '<div class="impact-count">' + d.count.toLocaleString() + '</div>';
      html += '<div class="impact-pct">' + d.pct.toFixed(1) + '% of total</div>';
      html += '<div class="impact-genes">' + d.genes.length + ' genes</div>';
      html += '</div>';
    });
    html += '</div>';

    // Bar chart
    html += '<div class="impact-bars"><h3>Impact Distribution</h3>';
    sorted.forEach(function(d) {
      html += '<div class="bar-row">';
      html += '<div class="bar-label">' + d.impact + '</div>';
      html += '<div class="bar-track"><div class="bar-fill" style="width:' + d.pct.toFixed(1) + '%;background:' + d.color + '">';
      if (d.pct > 5) html += '<span>' + d.count + '</span>';
      html += '</div></div>';
      html += '<div class="bar-pct">' + d.pct.toFixed(1) + '%</div>';
      html += '</div>';
    });
    html += '</div>';

    // Detailed panels
    sorted.filter(function(d) { return d.count > 0; }).forEach(function(d) {
      html += '<div class="impact-panel">';
      html += '<div class="impact-panel-header" style="background:' + d.color + '">' + d.impact + ' Impact Variants (' + d.count.toLocaleString() + ')</div>';
      html += '<div class="impact-panel-body">';

      if (d.genes.length) {
        html += '<div class="genes-section"><strong>Affected Genes (' + d.genes.length + '):</strong><div class="gene-tags">';
        d.genes.slice(0, 20).forEach(function(g) { html += '<span class="gene-tag">' + esc(g) + '</span>'; });
        if (d.genes.length > 20) html += '<span class="gene-tag-more">+' + (d.genes.length - 20) + ' more</span>';
        html += '</div></div>';
      }

      html += '<div><strong style="font-size:12px">Top Variants:</strong>';
      html += '<table class="impact-var-table"><thead><tr>';
      ['Position','ID','Type','Alleles','Quality','Genes'].forEach(function(h) { html += '<th>' + h + '</th>'; });
      html += '</tr></thead><tbody>';
      d.variants.slice(0, 10).forEach(function(v) {
        var allIdx = S.all.indexOf(v);
        html += '<tr data-imp-idx="' + allIdx + '">';
        html += '<td class="mono">' + esc(v.chrom) + ':' + v.pos.toLocaleString() + '</td>';
        html += '<td class="trunc">' + esc(v.rsid || v.id) + '</td>';
        html += '<td><span class="badge" style="background:' + (TYPE_COLORS[v.variantType]||'#6b7280') + '">' + v.variantType + '</span></td>';
        html += '<td class="mono trunc">' + esc(v.ref) + ' → ' + esc(v.alt.join(',')) + '</td>';
        html += '<td>' + (v.qual !== null ? v.qual.toFixed(1) : 'N/A') + '</td>';
        html += '<td class="trunc">' + (v.genes && v.genes.length ? esc(v.genes.join(', ')) : '—') + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      if (d.variants.length > 10) html += '<div class="more-note">Showing 10 of ' + d.variants.length.toLocaleString() + ' variants</div>';
      html += '</div></div></div>';
    });

    // Summary
    var totalGenes = {};
    S.filtered.forEach(function(v) { if (v.genes) v.genes.forEach(function(g) { totalGenes[g] = 1; }); });
    html += '<div class="impact-summary">';
    html += '<strong>Summary</strong> — Total: ' + total.toLocaleString();
    html += ' | High: ' + (data['HIGH'] ? data['HIGH'].count : 0);
    html += ' | Moderate: ' + (data['MODERATE'] ? data['MODERATE'].count : 0);
    html += ' | Genes affected: ' + Object.keys(totalGenes).length.toLocaleString();
    html += '</div>';

    return html;
  }

  function setViewFromImpact(idx) {
    S.selected = idx;
    S.page = Math.floor(idx / S.pageSize) + 1;
    setView('table');
  }

  // ── Event delegation ─────────────────────────────────────────────────────────
  document.getElementById('tabs').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-view]');
    if (btn) setView(btn.dataset.view);
  });

  document.getElementById('color-group').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-color]');
    if (btn) setColorBy(btn.dataset.color);
  });

  document.getElementById('chrom-filter').addEventListener('change', function(e) {
    filterByChrom(e.target.value);
  });

  // Table: row select + pagination
  document.getElementById('view-table').addEventListener('click', function(e) {
    var row = e.target.closest('tr[data-idx]');
    if (row) { selectVariant(+row.dataset.idx); return; }
    var pg = e.target.closest('[data-page]');
    if (pg && !pg.disabled) { changePage(+pg.dataset.page); return; }
  });

  // Impact: click variant row → jump to table
  document.getElementById('view-impact').addEventListener('click', function(e) {
    var row = e.target.closest('[data-imp-idx]');
    if (row) setViewFromImpact(+row.dataset.impIdx);
  });

  // ── Init ─────────────────────────────────────────────────────────────────────
  (function() {
    var loadingEl = document.getElementById('loading');
    try {
      var parsed = parseVCF(RAW_DATA);
      S.all = parsed.variants;
      S.filtered = parsed.variants;

      // Chromosome filter options
      var chromSel = document.getElementById('chrom-filter');
      parsed.stats.chromosomes.slice().sort(sortChrom).forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        chromSel.appendChild(opt);
      });

      document.getElementById('stats-text').textContent =
        parsed.stats.total.toLocaleString() + ' variants · ' +
        parsed.stats.chromosomes.length + ' chromosomes';

      loadingEl.style.display = 'none';
      renderTable();
    } catch(e) {
      loadingEl.innerHTML = '<div class="error-msg">Failed to parse VCF: ' + ((e && e.message) || e) + '</div>';
    }
  })();
  </script>`;

  return shell(nonce, fileName, extraHead, body,
    'background:var(--vscode-editor-background);', isDark);
}
