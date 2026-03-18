import { CDN, newNonce, shell } from './viewerShell';

const PAGE_SIZE = 200;
const MAX_READS = 10_000;

/**
 * Custom alignment viewer for SAM / BAM / CRAM files.
 * Three view modes: Reads (table + detail), Coverage (canvas histogram), Pileup (canvas alignment).
 *
 * @param fileData - For SAM: raw text. For BAM: base64-encoded binary. CRAM: unsupported (any string).
 */
export function alignmentHtml(fileName: string, ext: string, fileData: string, isDark = true): string {
  const nonce = newNonce();
  const format = ext === '.bam' ? 'bam' : ext === '.cram' ? 'cram' : 'sam';
  const dataJson = JSON.stringify(fileData);

  const extraHead = /* html */`<style>
    body { display:flex; flex-direction:column;
           background:var(--vscode-editor-background,#1e1e1e);
           color:var(--vscode-editor-foreground,#d4d4d4); }
    #toolbar {
      flex-shrink:0; padding:6px 12px;
      border-bottom:1px solid var(--vscode-panel-border,#333);
      background:var(--vscode-sideBar-background,#252526);
      font-family:var(--vscode-font-family,system-ui),sans-serif;
      font-size:12px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    }
    #stats { margin-right:auto; color:var(--vscode-descriptionForeground,#888); }
    .tab-group { display:flex; border:1px solid var(--vscode-panel-border,#555); border-radius:4px; overflow:hidden; }
    .tab-btn {
      padding:3px 10px; font-size:12px; cursor:pointer;
      background:transparent; border:none;
      color:var(--vscode-foreground,#ccc); font-family:inherit;
    }
    .tab-btn.active { background:var(--vscode-button-background,#0e639c); color:var(--vscode-button-foreground,#fff); }
    .tab-btn+.tab-btn { border-left:1px solid var(--vscode-panel-border,#555); }
    .tb-select {
      padding:2px 6px; border-radius:3px; font-size:12px;
      border:1px solid var(--vscode-input-border,#555);
      background:var(--vscode-input-background,#3c3c3c);
      color:var(--vscode-input-foreground,#d4d4d4);
    }
    .tb-check {
      display:flex; align-items:center; gap:4px; cursor:pointer;
      color:var(--vscode-foreground,#ccc); user-select:none; font-size:11px;
    }
    .tb-check input { cursor:pointer; accent-color:var(--vscode-focusBorder,#4da3ff); }
    #viewer-wrap { flex:1; overflow:auto; padding:8px; min-height:0; }
    /* reads table */
    .rdr-table { border-collapse:collapse; width:100%; font-size:12px; }
    .rdr-table th {
      position:sticky; top:0; z-index:2;
      background:var(--vscode-list-activeSelectionBackground,#094771);
      color:var(--vscode-list-activeSelectionForeground,#fff);
      padding:5px 10px; text-align:left; font-weight:600; white-space:nowrap;
      font-family:var(--vscode-font-family,system-ui),sans-serif; font-size:11px;
    }
    .rdr-table td {
      padding:3px 10px;
      border-bottom:1px solid var(--vscode-panel-border,#2a2a2a);
      font-family:var(--vscode-editor-font-family,monospace); font-size:11px;
      white-space:nowrap; max-width:220px; overflow:hidden; text-overflow:ellipsis;
    }
    .rdr-table tbody tr:nth-child(even) td { background:rgba(255,255,255,0.03); }
    .rdr-table tbody tr:hover td { background:var(--vscode-list-hoverBackground,rgba(14,99,156,0.3))!important; cursor:pointer; }
    .rdr-table tbody tr.selected td { background:var(--vscode-list-activeSelectionBackground,#094771)!important; color:var(--vscode-list-activeSelectionForeground,#fff); }
    .mapq-badge {
      display:inline-block; padding:0 5px; border-radius:3px; font-size:10px; font-weight:600; color:#fff;
    }
    .flag-badge {
      display:inline-block; padding:1px 4px; border-radius:3px; font-size:10px; font-weight:600; margin:0 1px;
    }
    .detail-panel {
      margin:6px 0 10px 0; padding:10px 14px;
      background:var(--vscode-editorWidget-background,#252526);
      border:1px solid var(--vscode-panel-border,#555); border-radius:4px;
    }
    .detail-panel h4 { font-size:11px; margin-bottom:6px; color:var(--vscode-foreground,#d4d4d4); }
    .detail-grid { display:grid; grid-template-columns:110px 1fr; gap:2px 8px; font-size:11px; }
    .detail-key { color:var(--vscode-descriptionForeground,#888); }
    .detail-val { font-family:monospace; color:var(--vscode-foreground,#d4d4d4); word-break:break-all; }
    .seq-row { display:flex; flex-wrap:wrap; gap:1px; margin-top:6px; }
    .seq-base { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; font-size:9px; font-weight:bold; color:#fff; border-radius:2px; }
    /* paging */
    .paging { display:flex; align-items:center; gap:8px; padding:6px 0; font-size:11px; color:var(--vscode-descriptionForeground,#888); }
    .paging-btn {
      padding:2px 8px; font-size:11px; cursor:pointer;
      background:var(--vscode-button-background,#0e639c); color:var(--vscode-button-foreground,#fff);
      border:none; border-radius:3px; font-family:inherit;
    }
    .paging-btn:disabled { background:var(--vscode-button-secondaryBackground,#3a3a3a); color:var(--vscode-disabledForeground,#555); cursor:default; }
    /* coverage / pileup shared */
    .view-ctrl {
      display:flex; align-items:center; gap:10px; padding:7px 10px;
      background:var(--vscode-editorWidget-background,#252526);
      border:1px solid var(--vscode-panel-border,#444); border-radius:4px; margin-bottom:8px; flex-wrap:wrap;
    }
    .view-ctrl label { font-size:11px; color:var(--vscode-foreground,#ccc); }
    .view-ctrl input[type=number], .view-ctrl input[type=text] {
      width:90px; padding:2px 6px; font-size:11px;
      background:var(--vscode-input-background,#3c3c3c);
      border:1px solid var(--vscode-input-border,#555);
      color:var(--vscode-input-foreground,#d4d4d4); border-radius:3px; font-family:monospace;
    }
    .view-ctrl input[type=text] { width:200px; }
    .view-btn {
      padding:2px 8px; font-size:11px; cursor:pointer;
      background:var(--vscode-button-background,#0e639c); color:var(--vscode-button-foreground,#fff);
      border:none; border-radius:3px; font-family:inherit;
    }
    .stat-cards { display:flex; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
    .stat-card {
      padding:5px 12px; background:var(--vscode-editorWidget-background,#252526);
      border:1px solid var(--vscode-panel-border,#444); border-radius:4px; font-size:11px;
    }
    .stat-card .sv { font-size:18px; font-weight:700; color:var(--vscode-foreground,#d4d4d4); }
    .stat-card .sk { color:var(--vscode-descriptionForeground,#888); }
    .legend { display:flex; gap:12px; margin-top:8px; font-size:11px; flex-wrap:wrap; }
    .legend-item { display:flex; align-items:center; gap:4px; color:var(--vscode-foreground,#ccc); }
    .legend-sw { width:12px; height:12px; border-radius:2px; display:inline-block; }
    .warn-bar {
      padding:5px 10px; background:rgba(255,200,0,0.1); border:1px solid rgba(255,200,0,0.35);
      border-radius:4px; font-size:11px; color:#d4a017; margin-bottom:8px;
    }
  </style>`;

  const body = /* html */`
  <div id="toolbar">
    <span id="stats">Loading…</span>
    <div class="tab-group">
      <button class="tab-btn active" data-action="tab" data-view="reads">Reads</button>
      <button class="tab-btn" data-action="tab" data-view="coverage">Coverage</button>
      <button class="tab-btn" data-action="tab" data-view="pileup">Pileup</button>
    </div>
    <select id="ref-select" class="tb-select" style="display:none" data-action="ref-change">
      <option value="">All refs</option>
    </select>
    <label class="tb-check"><input type="checkbox" id="chk-cigar"> CIGAR</label>
    <label class="tb-check"><input type="checkbox" id="chk-flags"> Flags</label>
    <label class="tb-check"><input type="checkbox" id="chk-mapped"> Mapped only</label>
  </div>
  <div id="viewer-wrap"><div id="view-content"></div></div>
  ${format === 'bam' ? `<script src="${CDN.PAKO_JS}" nonce="${nonce}"></script>` : ''}
  <script nonce="${nonce}">
  // ─── DATA ────────────────────────────────────────────────────────────────────
  const RAW_DATA = ${dataJson};
  const FORMAT   = ${JSON.stringify(format)};

  // ─── CONSTANTS ───────────────────────────────────────────────────────────────
  const FLAG_BITS = {
    PAIRED:0x1, PROPER_PAIR:0x2, UNMAPPED:0x4, MATE_UNMAPPED:0x8,
    REVERSE_STRAND:0x10, MATE_REVERSE_STRAND:0x20, FIRST_IN_PAIR:0x40,
    SECOND_IN_PAIR:0x80, SECONDARY:0x100, QC_FAILED:0x200,
    DUPLICATE:0x400, SUPPLEMENTARY:0x800,
  };
  const BASE_COLORS = { A:'#5050FF', T:'#E6B800', G:'#00C000', C:'#FF5050', N:'#808080', U:'#C586C0' };
  const CIGAR_OPS   = { M:'Match',I:'Insertion',D:'Deletion',N:'Skipped',S:'Soft-clip',H:'Hard-clip',P:'Padding','=':'Match','X':'Mismatch' };

  function qualColor(phred) {
    if (phred >= 30) return '#00C000';
    if (phred >= 20) return '#E6B800';
    if (phred >= 10) return '#FF8C00';
    return '#FF5050';
  }

  // ─── PARSERS ─────────────────────────────────────────────────────────────────
  function parseFlagField(flag) {
    return {
      isPaired:             !!(flag & FLAG_BITS.PAIRED),
      isProperPair:         !!(flag & FLAG_BITS.PROPER_PAIR),
      isUnmapped:           !!(flag & FLAG_BITS.UNMAPPED),
      isMateUnmapped:       !!(flag & FLAG_BITS.MATE_UNMAPPED),
      isReverseStrand:      !!(flag & FLAG_BITS.REVERSE_STRAND),
      isFirstInPair:        !!(flag & FLAG_BITS.FIRST_IN_PAIR),
      isSecondInPair:       !!(flag & FLAG_BITS.SECOND_IN_PAIR),
      isSecondaryAlignment: !!(flag & FLAG_BITS.SECONDARY),
      isQCFailed:           !!(flag & FLAG_BITS.QC_FAILED),
      isDuplicate:          !!(flag & FLAG_BITS.DUPLICATE),
      isSupplementary:      !!(flag & FLAG_BITS.SUPPLEMENTARY),
    };
  }

  function parseCigar(cigar) {
    if (!cigar || cigar === '*') return [];
    const ops = []; let m;
    const re = /(\\d+)([MIDNSHP=X])/g;
    while ((m = re.exec(cigar))) ops.push({ len: +m[1], op: m[2], desc: CIGAR_OPS[m[2]] || '?' });
    return ops;
  }

  function calcAlignedLen(cigar) {
    return parseCigar(cigar).filter(o => 'MDNX='.includes(o.op)).reduce((s,o) => s + o.len, 0);
  }

  function parseHeaderLine(line, header, refs) {
    const parts = line.split('\\t');
    const type  = parts[0];
    if (type === '@HD') {
      for (let i = 1; i < parts.length; i++) {
        const [k,v] = parts[i].split(':');
        if (k === 'VN') header.version = v;
        if (k === 'SO') header.sortOrder = v;
      }
    } else if (type === '@SQ') {
      const ref = { name:'', length:0 };
      for (let i = 1; i < parts.length; i++) {
        const [k,v] = parts[i].split(':');
        if (k === 'SN') ref.name = v;
        if (k === 'LN') ref.length = +v;
      }
      if (ref.name && ref.length > 0) refs.push(ref);
    } else if (type === '@RG') {
      const rg = { id:'' };
      for (let i = 1; i < parts.length; i++) {
        const [k,v] = parts[i].split(':');
        if (k === 'ID') rg.id = v;
        if (k === 'SM') rg.sample = v;
      }
      if (rg.id) header.readGroups.push(rg);
    }
  }

  function parseAlignmentLine(line, lineNo) {
    const f = line.split('\\t');
    if (f.length < 11) return null;
    try {
      const read = {
        qname:f[0], flag:+f[1], rname:f[2], pos:+f[3], mapq:+f[4],
        cigar:f[5], rnext:f[6], pnext:+f[7], tlen:+f[8], seq:f[9], qual:f[10],
      };
      read.parsedFlags  = parseFlagField(read.flag);
      read.parsedCigar  = parseCigar(read.cigar);
      read.alignedLength= calcAlignedLen(read.cigar);
      read.endPos       = read.pos + read.alignedLength - 1;
      return read;
    } catch { return null; }
  }

  function calcStats(reads) {
    let mapped=0, unmapped=0, paired=0, dups=0, secondary=0, sumMapQ=0, sumLen=0;
    for (const r of reads) {
      const f = r.parsedFlags;
      if (!f.isUnmapped) { mapped++; sumMapQ += r.mapq; } else { unmapped++; }
      if (f.isPaired) paired++;
      if (f.isDuplicate) dups++;
      if (f.isSecondaryAlignment) secondary++;
      sumLen += r.seq.length;
    }
    return {
      totalReads: reads.length, mappedReads: mapped, unmappedReads: unmapped,
      pairedReads: paired, duplicates: dups, secondaryAlignments: secondary,
      averageMappingQuality: mapped > 0 ? sumMapQ / mapped : 0,
      averageReadLength: reads.length > 0 ? sumLen / reads.length : 0,
    };
  }

  function calcCoverage(reads, ref, start, end) {
    const cov = new Array(end - start + 1).fill(0);
    for (const r of reads) {
      if (r.rname !== ref || !r.parsedFlags || r.parsedFlags.isUnmapped) continue;
      const rs = r.pos, re = r.endPos || rs;
      const os = Math.max(rs, start), oe = Math.min(re, end);
      for (let i = os; i <= oe; i++) { const idx = i - start; if (idx >= 0 && idx < cov.length) cov[idx]++; }
    }
    return cov;
  }

  // SAM parser
  function parseSAM(text, filename) {
    const lines = text.split('\\n').filter(l => l.trim());
    const header = { programs:[], readGroups:[], comments:[] };
    const refs   = [], reads = [], warnings = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l.startsWith('@')) { parseHeaderLine(l, header, refs); continue; }
      const r = parseAlignmentLine(l, i+1);
      if (r) reads.push(r); else warnings.push('Skipped invalid line ' + (i+1));
      if (reads.length >= ${MAX_READS}) {
        warnings.push('File truncated to first ${MAX_READS.toLocaleString()} reads for performance.');
        break;
      }
    }
    if (!reads.length) return { success:false, error:'No valid alignment records found.' };
    return { success:true, data:{ format:'sam', header, refs, reads, stats:calcStats(reads) }, warnings };
  }

  // BAM parser (base64 → BGZF decompress → parse binary records)
  function b64toUint8(b64) {
    const s = atob(b64), bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  function decompressBGZF(data) {
    const blocks = []; let offset = 0;
    while (offset < data.length) {
      if (offset + 18 > data.length) break;
      if (data[offset] !== 31 || data[offset+1] !== 139) break;
      const xlen   = data[offset+10] | (data[offset+11] << 8);
      const bsize  = data[offset+16] | (data[offset+17] << 8);
      const blockSize = bsize + 1;
      if (offset + blockSize > data.length) break;
      const cs = offset + 10 + 2 + xlen, ce = offset + blockSize - 8;
      try { blocks.push(pako.inflateRaw(data.slice(cs, ce))); } catch { break; }
      offset += blockSize;
    }
    const total = blocks.reduce((s,b) => s + b.length, 0);
    const result = new Uint8Array(total); let pos = 0;
    for (const b of blocks) { result.set(b, pos); pos += b.length; }
    return result;
  }

  function decodeBAMSeq(bytes, len) {
    const bases = '=ACMGRSVTWYHKDBN'; let seq = '';
    for (let i = 0; i < len; i++) {
      const b = i % 2 === 0 ? (bytes[Math.floor(i/2)] >> 4) : (bytes[Math.floor(i/2)] & 0x0f);
      seq += bases[b];
    }
    return seq;
  }

  function parseBAMRecord(data, refs) {
    try {
      let off = 0;
      const dv = new DataView(data.buffer, data.byteOffset);
      const ri32 = () => { const v = dv.getInt32(off,true);  off+=4; return v; };
      const ru32 = () => { const v = dv.getUint32(off,true); off+=4; return v; };
      const ru16 = () => { const v = dv.getUint16(off,true); off+=2; return v; };
      const refID = ri32(), pos = ri32();
      const binMqNl = ru32(), flagNc = ru32();
      const lSeq = ri32();
      const nextRefID = ri32(), nextPos = ri32(), tlen = ri32();
      const readNameLen = binMqNl & 0xff;
      const mapq = (binMqNl >> 8) & 0xff;
      const flag = flagNc >> 16, nCigarOp = flagNc & 0xffff;
      const qname = new TextDecoder().decode(data.slice(off, off + readNameLen - 1)); off += readNameLen;
      const cigarOps = [];
      for (let i = 0; i < nCigarOp; i++) {
        const ci = ru32(); cigarOps.push((ci>>4).toString() + 'MIDNSHP=X'[ci & 0xf]);
      }
      const cigar = cigarOps.length ? cigarOps.join('') : '*';
      const seqBytes = data.slice(off, off + Math.ceil(lSeq/2)); off += Math.ceil(lSeq/2);
      const seq  = decodeBAMSeq(seqBytes, lSeq);
      const qualBytes = data.slice(off, off + lSeq); off += lSeq;
      const qual = Array.from(qualBytes).map(q => String.fromCharCode(q+33)).join('');
      const rname = refID >= 0 && refID < refs.length ? refs[refID].name : '*';
      const read  = { qname, flag, rname, pos:pos+1, mapq, cigar, rnext:nextRefID>=0&&nextRefID<refs.length?refs[nextRefID].name:'*', pnext:nextPos+1, tlen, seq, qual };
      read.parsedFlags   = parseFlagField(flag);
      read.parsedCigar   = parseCigar(cigar);
      read.alignedLength = calcAlignedLen(cigar);
      read.endPos        = read.pos + read.alignedLength - 1;
      return read;
    } catch { return null; }
  }

  function parseBAM(b64, filename) {
    try {
      const raw = b64toUint8(b64);
      const isBAMDirect = raw[0]===0x42&&raw[1]===0x41&&raw[2]===0x4d&&raw[3]===0x01;
      const bamData = isBAMDirect ? raw : decompressBGZF(raw);
      let off = 0;
      const dv = new DataView(bamData.buffer, bamData.byteOffset);
      const magic = String.fromCharCode(bamData[0],bamData[1],bamData[2],bamData[3]);
      if (magic !== 'BAM\\x01') return { success:false, error:'Invalid BAM magic. Got: '+magic };
      off = 4;
      const ri32b = () => { const v = dv.getInt32(off,true); off+=4; return v; };
      const ru32b = () => { const v = dv.getUint32(off,true); off+=4; return v; };
      const hLen   = ri32b();
      const hText  = new TextDecoder().decode(bamData.slice(off, off+hLen)); off += hLen;
      const nRef   = ri32b();
      const refs   = [];
      for (let i = 0; i < nRef; i++) {
        const nLen = ri32b();
        const name = new TextDecoder().decode(bamData.slice(off, off+nLen-1)); off += nLen;
        const len  = ri32b();
        refs.push({ name, length:len });
      }
      const header = { programs:[], readGroups:[], comments:[] };
      if (hText) hText.split('\\n').filter(l=>l.trim()).forEach(l=>parseHeaderLine(l,header,refs));
      const reads = [], warnings = [];
      while (off < bamData.length && reads.length < ${MAX_READS}) {
        try {
          const bSize = dv.getInt32(off,true); off+=4;
          if (bSize <= 0 || off+bSize > bamData.length) break;
          const rec = parseBAMRecord(bamData.slice(off, off+bSize), refs); off += bSize;
          if (rec) reads.push(rec);
        } catch { break; }
      }
      if (reads.length >= ${MAX_READS}) warnings.push('File truncated to first ${MAX_READS.toLocaleString()} reads for performance.');
      if (!reads.length) return { success:false, error:'No valid alignment records found in BAM file.' };
      return { success:true, data:{ format:'bam', header, refs, reads, stats:calcStats(reads) }, warnings };
    } catch(e) { return { success:false, error:'Failed to parse BAM: '+e.message }; }
  }

  // ─── STATE ───────────────────────────────────────────────────────────────────
  const S = {
    all: [], data: null, view: 'reads', currentRef: null,
    showCigar: false, showFlags: false, onlyMapped: false,
    selectedIdx: null, page: 0,
    covStart: 1, covEnd: 10000,
    pilStart: 1, pilEnd: 100, pilRefSeq: '',
  };

  function filtered() {
    let r = S.all;
    if (S.onlyMapped) r = r.filter(x => !x.parsedFlags.isUnmapped);
    if (S.currentRef)  r = r.filter(x => x.rname === S.currentRef);
    return r;
  }

  // ─── RENDER HELPERS ──────────────────────────────────────────────────────────
  function mapqBadge(mapq) {
    const col = qualColor(mapq);
    return '<span class="mapq-badge" style="background:'+col+'">'+mapq+'</span>';
  }

  function flagBadges(flags) {
    const b = [];
    if (flags.isUnmapped)           b.push('<span class="flag-badge" style="background:#888">UNMAP</span>');
    if (flags.isReverseStrand)      b.push('<span class="flag-badge" style="background:#6B7280">REV</span>');
    if (flags.isPaired)             b.push('<span class="flag-badge" style="background:#3B82F6">PAIR</span>');
    if (flags.isDuplicate)          b.push('<span class="flag-badge" style="background:#EF4444">DUP</span>');
    if (flags.isSecondaryAlignment) b.push('<span class="flag-badge" style="background:#F59E0B">2°</span>');
    if (flags.isSupplementary)      b.push('<span class="flag-badge" style="background:#8B5CF6">SUPP</span>');
    return b.join('');
  }

  function seqViz(seq, qual) {
    const MAX = 80;
    const s = seq.slice(0, MAX);
    const q = qual || '';
    let html = '<div class="seq-row">';
    for (let i = 0; i < s.length; i++) {
      const base = s[i];
      const col  = BASE_COLORS[base] || '#808080';
      html += '<span class="seq-base" style="background:'+col+'" title="'+base+(q[i]?' Q='+(q.charCodeAt(i)-33):'')+'">'+base+'</span>';
    }
    if (seq.length > MAX) html += '<span style="color:var(--vscode-descriptionForeground,#888);font-size:10px;align-self:center"> …+'+(seq.length-MAX)+'</span>';
    return html + '</div>';
  }

  function readDetail(read) {
    const f = read.parsedFlags;
    const flagList = [
      f.isPaired&&'Paired', f.isProperPair&&'Proper pair', f.isUnmapped&&'Unmapped',
      f.isReverseStrand&&'Reverse strand', f.isDuplicate&&'Duplicate',
      f.isSecondaryAlignment&&'Secondary', f.isSupplementary&&'Supplementary',
      f.isQCFailed&&'QC-Failed',
    ].filter(Boolean).join(', ') || '—';
    return '<div class="detail-panel">'+
      '<div class="detail-grid">'+
      '<span class="detail-key">Name</span><span class="detail-val">'+esc(read.qname)+'</span>'+
      '<span class="detail-key">Reference</span><span class="detail-val">'+esc(read.rname)+':'+read.pos+'</span>'+
      '<span class="detail-key">MAPQ</span><span class="detail-val">'+read.mapq+'</span>'+
      '<span class="detail-key">CIGAR</span><span class="detail-val">'+esc(read.cigar)+'</span>'+
      '<span class="detail-key">FLAG</span><span class="detail-val">'+read.flag+' ('+flagList+')</span>'+
      '<span class="detail-key">Mate</span><span class="detail-val">'+esc(read.rnext)+':'+read.pnext+' tlen='+read.tlen+'</span>'+
      '</div>'+seqViz(read.seq, read.qual)+'</div>';
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ─── READS VIEW ──────────────────────────────────────────────────────────────
  function renderReads(reads) {
    if (!reads.length) return '<div style="padding:20px;color:var(--vscode-descriptionForeground,#888)">No reads to display.</div>';
    const start = S.page * ${PAGE_SIZE};
    const page  = reads.slice(start, start + ${PAGE_SIZE});
    const total = reads.length;
    const pages = Math.ceil(total / ${PAGE_SIZE});

    let html = '<table class="rdr-table"><thead><tr>';
    html += '<th>#</th><th>Read Name</th><th>Ref:Pos</th><th>MAPQ</th>';
    if (S.showCigar) html += '<th>CIGAR</th>';
    html += '<th>Sequence (80bp)</th>';
    if (S.showFlags) html += '<th>Flags</th>';
    html += '</tr></thead><tbody>';

    page.forEach((r, i) => {
      const gi = start + i;
      const sel = S.selectedIdx === gi ? ' selected' : '';
      html += '<tr class="read-row'+sel+'" data-action="select-read" data-idx="'+gi+'">';
      html += '<td>'+(gi+1)+'</td>';
      html += '<td style="max-width:160px" title="'+esc(r.qname)+'">'+esc(r.qname)+'</td>';
      html += '<td>'+esc(r.rname)+':'+r.pos+'</td>';
      html += '<td>'+mapqBadge(r.mapq)+'</td>';
      if (S.showCigar) html += '<td title="'+esc(r.cigar)+'">'+esc(r.cigar.length>20?r.cigar.slice(0,20)+'…':r.cigar)+'</td>';
      const seq80 = r.seq.slice(0,40);
      html += '<td><span style="font-family:monospace;font-size:10px;letter-spacing:1px">'+esc(seq80)+(r.seq.length>40?'…':'')+'</span></td>';
      if (S.showFlags) html += '<td>'+flagBadges(r.parsedFlags)+'</td>';
      html += '</tr>';
      if (S.selectedIdx === gi) html += '<tr><td colspan="10" style="padding:0">'+readDetail(r)+'</td></tr>';
    });

    html += '</tbody></table>';

    // Paging
    html += '<div class="paging">';
    html += '<button class="paging-btn" data-action="page-prev"'+(S.page===0?' disabled':'')+'>‹ Prev</button>';
    html += '<span>Page '+(S.page+1)+' of '+pages+' · '+total.toLocaleString()+' reads</span>';
    html += '<button class="paging-btn" data-action="page-next"'+(S.page>=pages-1?' disabled':'')+'>Next ›</button>';
    html += '</div>';
    return html;
  }

  // ─── COVERAGE VIEW ───────────────────────────────────────────────────────────
  function renderCoverageHTML() {
    return '<div class="view-ctrl">'+
      '<label>Region: <input type="number" id="cov-start" value="'+S.covStart+'" min="1"></label>'+
      '<span style="color:var(--vscode-descriptionForeground,#888)">–</span>'+
      '<label><input type="number" id="cov-end" value="'+S.covEnd+'" min="1"></label>'+
      '<button class="view-btn" data-action="cov-update">Update</button>'+
      '</div>'+
      '<div class="stat-cards">'+
      '<div class="stat-card"><div class="sv" id="cov-max">—</div><div class="sk">Max Coverage</div></div>'+
      '<div class="stat-card"><div class="sv" id="cov-mean">—</div><div class="sk">Mean Coverage</div></div>'+
      '<div class="stat-card"><div class="sv" id="cov-len">—</div><div class="sk">Region Length</div></div>'+
      '</div>'+
      '<canvas id="cov-canvas"></canvas>'+
      '<div class="legend">'+
      '<div class="legend-item"><span class="legend-sw" style="background:#3B82F6"></span> Normal</div>'+
      '<div class="legend-item"><span class="legend-sw" style="background:#F59E0B"></span> Low (&lt;0.5× mean)</div>'+
      '<div class="legend-item"><span class="legend-sw" style="background:#DC2626"></span> High (&gt;2× mean)</div>'+
      '</div>';
  }

  function drawCoverage(reads) {
    if (!S.currentRef) return;
    const canvas = document.getElementById('cov-canvas');
    if (!canvas) return;
    const W = canvas.parentElement.clientWidth - 16;
    const H = 300;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W+'px'; canvas.style.height = H+'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const isDark = document.body.classList.contains('vscode-dark') ||
                   document.body.classList.contains('vscode-high-contrast');
    const C = {
      bg:    isDark ? '#1e1e1e' : '#ffffff',
      axis:  isDark ? '#c8c8c8' : '#555555',
      grid:  isDark ? '#3a3a3a' : '#dddddd',
      text:  isDark ? '#c8c8c8' : '#555555',
    };

    const cov = calcCoverage(reads, S.currentRef, S.covStart, S.covEnd);
    if (!cov.length) return;
    const maxC  = Math.max(...cov, 1);
    const meanC = cov.reduce((a,b)=>a+b,0)/cov.length;

    document.getElementById('cov-max').textContent  = maxC.toFixed(0)+'×';
    document.getElementById('cov-mean').textContent = meanC.toFixed(1)+'×';
    document.getElementById('cov-len').textContent  = (S.covEnd-S.covStart+1).toLocaleString()+' bp';

    const m = { top:20, right:20, bottom:40, left:60 };
    const pw = W-m.left-m.right, ph = H-m.top-m.bottom;
    const bw = pw / cov.length;

    // Background
    ctx.fillStyle = C.bg; ctx.fillRect(0,0,W,H);

    // Bars
    for (let i = 0; i < cov.length; i++) {
      const bh = (cov[i] / maxC) * ph;
      const x  = m.left + i * bw;
      const y  = m.top + ph - bh;
      ctx.fillStyle = cov[i] > meanC*2 ? '#DC2626' : cov[i] < meanC*0.5 ? '#F59E0B' : '#3B82F6';
      ctx.fillRect(x, y, Math.max(bw-0.5, 0.5), bh);
    }

    // Axes
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
    ctx.fillStyle   = C.text; ctx.font = '11px sans-serif';

    ctx.beginPath(); ctx.moveTo(m.left,m.top); ctx.lineTo(m.left,H-m.bottom); ctx.stroke();
    for (let i=0; i<=5; i++) {
      const val = Math.round(maxC*i/5);
      const y   = H-m.bottom - (i/5)*ph;
      ctx.textAlign = 'right'; ctx.fillText(val.toString(), m.left-8, y+4);
      ctx.strokeStyle=C.grid; ctx.beginPath(); ctx.moveTo(m.left,y); ctx.lineTo(W-m.right,y); ctx.stroke();
      ctx.strokeStyle=C.axis;
    }
    ctx.beginPath(); ctx.moveTo(m.left,H-m.bottom); ctx.lineTo(W-m.right,H-m.bottom); ctx.stroke();
    for (let i=0; i<=5; i++) {
      const val = Math.round(S.covStart + (S.covEnd-S.covStart)*i/5);
      const x   = m.left + (i/5)*pw;
      ctx.textAlign='center'; ctx.fillText(val.toLocaleString(), x, H-m.bottom+18);
    }

    ctx.save(); ctx.translate(14, H/2); ctx.rotate(-Math.PI/2);
    ctx.textAlign='center'; ctx.fillText('Coverage depth', 0, 0); ctx.restore();
    ctx.textAlign='center'; ctx.fillText('Position on '+S.currentRef, W/2, H-4);
  }

  // ─── PILEUP VIEW ─────────────────────────────────────────────────────────────
  function renderPileupHTML() {
    return '<div class="view-ctrl">'+
      '<label>Region: <input type="number" id="pil-start" value="'+S.pilStart+'" min="1"></label>'+
      '<span style="color:var(--vscode-descriptionForeground,#888)">–</span>'+
      '<label><input type="number" id="pil-end" value="'+S.pilEnd+'" min="1"></label>'+
      '<button class="view-btn" data-action="pil-update">Update</button>'+
      '<span style="color:var(--vscode-descriptionForeground,#888);font-size:11px">max 1000 bp</span>'+
      '</div>'+
      '<div class="view-ctrl">'+
      '<label>Reference seq (optional): <input type="text" id="pil-refseq" value="'+esc(S.pilRefSeq)+'" placeholder="ACGT…"></label>'+
      '</div>'+
      '<canvas id="pil-canvas" style="border:1px solid var(--vscode-panel-border,#444);border-radius:4px"></canvas>'+
      '<div class="legend">'+
      '<div class="legend-item"><span class="legend-sw" style="background:#DBEAFE;border:1px solid #93C5FD"></span> Forward</div>'+
      '<div class="legend-item"><span class="legend-sw" style="background:#FEE2E2;border:1px solid #FCA5A5"></span> Reverse</div>'+
      '<div class="legend-item">Bases: '+
        Object.entries(BASE_COLORS).map(([b,c])=>'<span class="legend-sw" style="background:'+c+'"></span>'+b).join(' ')+
      '</div></div>';
  }

  function drawPileup(reads) {
    if (!S.currentRef) return;
    const canvas = document.getElementById('pil-canvas');
    if (!canvas) return;
    const W = canvas.parentElement.clientWidth - 16;

    const isDark = document.body.classList.contains('vscode-dark') ||
                   document.body.classList.contains('vscode-high-contrast');
    const C = {
      bg:       isDark ? '#1e1e1e' : '#ffffff',
      axis:     isDark ? '#808080' : '#555555',
      text:     isDark ? '#c8c8c8' : '#555555',
      muted:    isDark ? '#a0a0a0' : '#888888',
      refBg:    isDark ? '#3c3c3c' : '#E5E7EB',
      refText:  isDark ? '#e0e0e0' : '#111111',
      fwdBg:    isDark ? '#1e3a5f' : '#DBEAFE',
      revBg:    isDark ? '#5f1e1e' : '#FEE2E2',
      baseText: '#ffffff',
    };

    const readsInRegion = reads.filter(r =>
      r.rname === S.currentRef &&
      r.pos <= S.pilEnd &&
      (r.endPos || r.pos) >= S.pilStart
    ).slice(0, 50);

    const rowH  = 20, margin = { top:40, right:16, bottom:20, left:80 };
    const H     = margin.top + (rowH+2)*readsInRegion.length + margin.bottom + 30;
    const dpr   = window.devicePixelRatio || 1;
    canvas.width = W*dpr; canvas.height = H*dpr;
    canvas.style.width = W+'px'; canvas.style.height = H+'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = C.bg; ctx.fillRect(0,0,W,H);

    const regionLen = S.pilEnd - S.pilStart + 1;
    const pw  = W - margin.left - margin.right;
    const bw  = pw / regionLen;

    // Position labels
    ctx.fillStyle=C.text; ctx.font='10px monospace'; ctx.textAlign='center';
    const step = Math.max(1, Math.floor(regionLen/10));
    for (let pos=S.pilStart; pos<=S.pilEnd; pos+=step) {
      const x = margin.left + ((pos-S.pilStart)/regionLen)*pw;
      ctx.fillText(pos.toString(), x, margin.top-10);
    }

    // Reference sequence
    if (S.pilRefSeq) {
      let rx = margin.left;
      for (let i = 0; i < Math.min(S.pilRefSeq.length, regionLen); i++) {
        const base = S.pilRefSeq[i];
        ctx.fillStyle = C.refBg; ctx.fillRect(rx, margin.top-6, bw, 14);
        ctx.fillStyle = C.refText; ctx.font='bold 9px monospace'; ctx.textAlign='center';
        ctx.fillText(base, rx+bw/2, margin.top+4);
        rx += bw;
      }
    }

    // Axis line
    ctx.strokeStyle=C.axis; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(margin.left,margin.top+14); ctx.lineTo(W-margin.right,margin.top+14); ctx.stroke();

    // Reads
    let yOff = margin.top + 18;
    for (const read of readsInRegion) {
      const rs = read.pos, re = read.endPos || rs;
      const sx = margin.left + ((Math.max(rs,S.pilStart)-S.pilStart)/regionLen)*pw;
      const rw = ((Math.min(re,S.pilEnd)-Math.max(rs,S.pilStart)+1)/regionLen)*pw;

      // Background
      ctx.fillStyle = read.parsedFlags.isReverseStrand ? C.revBg : C.fwdBg;
      ctx.fillRect(sx, yOff, rw, rowH);

      // Bases
      const seqOff = Math.max(0, S.pilStart - rs);
      const seqEnd = Math.min(read.seq.length, S.pilEnd - rs + 1);
      let bx = sx;
      for (let i = seqOff; i < seqEnd; i++) {
        const base  = read.seq[i];
        const color = BASE_COLORS[base] || '#808080';
        if (bw >= 5) {
          ctx.fillStyle = color; ctx.fillRect(bx, yOff, Math.max(bw-0.5,0.5), rowH);
          if (bw >= 8) {
            ctx.fillStyle=C.baseText; ctx.font='bold 9px monospace'; ctx.textAlign='center';
            ctx.fillText(base, bx+bw/2, yOff+rowH-4);
          }
        } else {
          ctx.strokeStyle=color; ctx.lineWidth=rowH;
          ctx.beginPath(); ctx.moveTo(bx,yOff+rowH/2); ctx.lineTo(bx+bw,yOff+rowH/2); ctx.stroke();
        }
        bx += bw;
      }

      // Read name
      ctx.fillStyle=C.muted; ctx.font='9px monospace'; ctx.textAlign='right';
      ctx.fillText(read.qname.substring(0,12), margin.left-4, yOff+rowH-4);
      yOff += rowH + 2;
    }
    if (!readsInRegion.length) {
      ctx.fillStyle=C.muted; ctx.font='12px sans-serif'; ctx.textAlign='center';
      ctx.fillText('No reads in region '+S.pilStart+'–'+S.pilEnd, W/2, H/2);
    }
  }

  // ─── RENDER ALL ──────────────────────────────────────────────────────────────
  function renderAll() {
    const reads = filtered();
    // Update tabs
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.toggle('active', t.dataset.view === S.view));
    const content = document.getElementById('view-content');
    switch (S.view) {
      case 'reads':
        content.innerHTML = renderReads(reads);
        break;
      case 'coverage':
        content.innerHTML = renderCoverageHTML();
        document.getElementById('cov-start').value = String(S.covStart);
        document.getElementById('cov-end').value   = String(S.covEnd);
        drawCoverage(reads);
        break;
      case 'pileup':
        content.innerHTML = renderPileupHTML();
        drawPileup(reads);
        break;
    }
  }

  // ─── EVENTS ──────────────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    switch (t.dataset.action) {
      case 'tab':
        S.view = t.dataset.view; S.page = 0; renderAll();
        break;
      case 'select-read': {
        const idx = +t.dataset.idx;
        S.selectedIdx = S.selectedIdx === idx ? null : idx;
        renderAll();
        break;
      }
      case 'page-prev':
        if (S.page > 0) { S.page--; renderAll(); } break;
      case 'page-next':
        S.page++; renderAll(); break;
      case 'cov-update': {
        const s = +document.getElementById('cov-start').value;
        const e2 = +document.getElementById('cov-end').value;
        if (s >= 1 && e2 > s) { S.covStart=s; S.covEnd=e2; drawCoverage(filtered()); }
        break;
      }
      case 'pil-update': {
        let s = +document.getElementById('pil-start').value;
        let e2 = +document.getElementById('pil-end').value;
        if (e2 - s > 1000) e2 = s + 1000;
        if (s >= 1 && e2 > s) {
          S.pilStart=s; S.pilEnd=e2;
          S.pilRefSeq = document.getElementById('pil-refseq').value.toUpperCase();
          drawPileup(filtered());
        }
        break;
      }
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'ref-select') {
      S.currentRef = t.value || null; S.page = 0;
      // Recalculate region bounds for new ref
      if (S.currentRef) {
        const refR = S.all.filter(r => r.rname===S.currentRef && !r.parsedFlags.isUnmapped);
        if (refR.length) {
          const minP = Math.min(...refR.map(r=>r.pos));
          const maxP = Math.max(...refR.map(r=>r.endPos||r.pos));
          S.covStart=minP; S.covEnd=Math.min(maxP, minP+50000);
          S.pilStart=minP; S.pilEnd=Math.min(maxP, minP+100);
        }
      }
      renderAll();
    }
    if (t.id === 'chk-cigar')  { S.showCigar   = t.checked; renderAll(); }
    if (t.id === 'chk-flags')  { S.showFlags   = t.checked; renderAll(); }
    if (t.id === 'chk-mapped') { S.onlyMapped  = t.checked; S.page=0; renderAll(); }
  });

  // ─── INIT ────────────────────────────────────────────────────────────────────
  (function init() {
    try {
      if (FORMAT === 'cram') {
        document.getElementById('loading').innerHTML =
          '<div class="error-msg">CRAM format is not yet supported. Please convert to SAM or BAM first using samtools.</div>';
        return;
      }

      document.getElementById('loading-text').textContent = 'Parsing ' + FORMAT.toUpperCase() + ' file…';

      const result = FORMAT === 'bam'
        ? parseBAM(RAW_DATA, ${JSON.stringify(fileName)})
        : parseSAM(RAW_DATA, ${JSON.stringify(fileName)});

      if (!result.success) throw new Error(result.error);

      S.all  = result.data.reads;
      S.data = result.data;

      const st = result.data.stats;
      document.getElementById('stats').textContent =
        st.totalReads.toLocaleString() + ' reads · ' +
        st.mappedReads.toLocaleString() + ' mapped · ' +
        'Avg MAPQ: ' + st.averageMappingQuality.toFixed(1) + ' · ' +
        'Avg len: ' + st.averageReadLength.toFixed(0) + ' bp';

      // Build reference dropdown
      const refs = [...new Set(S.all.map(r=>r.rname).filter(r=>r!=='*'))].sort();
      const refSel = document.getElementById('ref-select');
      if (refs.length > 0) {
        refs.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r; opt.textContent = r; refSel.appendChild(opt);
        });
        refSel.style.display = 'inline-block';
        S.currentRef = refs[0]; refSel.value = refs[0];

        // Init region bounds from first reference
        const refR = S.all.filter(r => r.rname===S.currentRef && !r.parsedFlags.isUnmapped);
        if (refR.length) {
          const minP = Math.min(...refR.map(r=>r.pos));
          const maxP = Math.max(...refR.map(r=>r.endPos||r.pos));
          S.covStart=minP; S.covEnd=Math.min(maxP, minP+50000);
          S.pilStart=minP; S.pilEnd=Math.min(maxP, minP+100);
        }
      }

      document.getElementById('loading').style.display = 'none';

      // Show warnings
      if (result.warnings && result.warnings.length) {
        const w = document.createElement('div');
        w.className='warn-bar';
        w.textContent='⚠ ' + result.warnings.join(' | ');
        document.getElementById('view-content').before(w);
        // Actually insert before toolbar isn't possible, put inside viewer-wrap
        document.getElementById('viewer-wrap').prepend(w);
      }

      renderAll();
    } catch(e) {
      document.getElementById('loading').innerHTML =
        '<div class="error-msg">Failed to parse alignment file: ' + e.message + '</div>';
    }
  })();
  </script>`;

  return shell(nonce, fileName, extraHead, body,
    'background:var(--vscode-editor-background);', isDark);
}
