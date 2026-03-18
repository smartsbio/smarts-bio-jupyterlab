import { newNonce, shell } from './viewerShell';

/**
 * Custom canvas-based FASTA / FASTQ viewer.
 * Ported from bio-viewers with VS Code dark/light theme support.
 * Features: Linear + Circular views, Annotations, Reverse Strand, Color Nucleotides,
 *           Translations (6 reading frames), Zoom, sequence selector for multi-seq files.
 */
export function sequenceHtml(fileName: string, fileData: string, isDark = true): string {
  const nonce = newNonce();
  const dataJson = JSON.stringify(fileData);

  const extraHead = /* html */`<style>
    body { display:flex; flex-direction:column;
           background:var(--vscode-editor-background,#1e1e1e);
           color:var(--vscode-editor-foreground,#d4d4d4); }

    /* ── Toolbar ── */
    #toolbar {
      flex-shrink:0; padding:6px 12px;
      border-bottom:1px solid var(--vscode-panel-border,#333);
      background:var(--vscode-sideBar-background,#252526);
      font-family:var(--vscode-font-family,system-ui),sans-serif;
      font-size:12px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    }
    #stats { color:var(--vscode-descriptionForeground,#888); }
    .tb-sep { width:1px; height:16px; background:var(--vscode-panel-border,#444); flex-shrink:0; }
    .tab-group { display:flex; border:1px solid var(--vscode-panel-border,#555); border-radius:4px; overflow:hidden; }
    .tab-btn {
      padding:3px 10px; font-size:11px; font-weight:500; cursor:pointer;
      background:transparent; border:none;
      color:var(--vscode-foreground,#ccc); font-family:inherit; white-space:nowrap;
    }
    .tab-btn.active {
      background:var(--vscode-button-background,#0e639c);
      color:var(--vscode-button-foreground,#fff);
    }
    .tab-btn+.tab-btn { border-left:1px solid var(--vscode-panel-border,#555); }
    .tb-check {
      display:flex; align-items:center; gap:4px; cursor:pointer;
      color:var(--vscode-foreground,#ccc); user-select:none; font-size:11px; white-space:nowrap;
    }
    .tb-check input { cursor:pointer; accent-color:var(--vscode-focusBorder,#4da3ff); margin:0; }
    .tb-select {
      padding:2px 6px; border-radius:3px; font-size:11px;
      border:1px solid var(--vscode-input-border,#555);
      background:var(--vscode-input-background,#3c3c3c);
      color:var(--vscode-input-foreground,#d4d4d4);
    }
    .tb-zoom { display:flex; align-items:center; gap:4px; margin-left:auto; }
    .tb-zoom button {
      width:22px; height:22px; border-radius:3px; border:none; cursor:pointer;
      font-size:14px; font-weight:bold; line-height:1;
      background:var(--vscode-button-secondaryBackground,#3a3a3a);
      color:var(--vscode-button-secondaryForeground,#ccc);
    }
    .tb-zoom button:hover { background:var(--vscode-button-secondaryHoverBackground,#505050); }
    #zoom-label { font-size:11px; min-width:34px; text-align:center;
                  color:var(--vscode-descriptionForeground,#888); }

    /* ── Canvas wrap ── */
    #viewer-wrap { flex:1; overflow:hidden; position:relative; }
    canvas { display:block; }
    #lin-canvas, #cir-canvas { position:absolute; top:0; left:0; }
    .canvas-hidden { display:none !important; }
    #pos-info {
      position:absolute; bottom:6px; right:10px; font-size:11px;
      font-family:var(--vscode-editor-font-family,monospace);
      color:var(--vscode-descriptionForeground,#888); pointer-events:none;
    }
  </style>`;

  const body = /* html */`
  <div id="toolbar">
    <span id="stats">Loading…</span>
    <select id="seq-select" class="tb-select" style="display:none;max-width:240px"></select>
    <div class="tb-sep"></div>
    <div class="tab-group" id="view-tabs">
      <button class="tab-btn active" data-view="linear">Linear</button>
      <button class="tab-btn"        data-view="circular">Circular</button>
    </div>
    <div class="tb-sep"></div>
    <label class="tb-check"><input type="checkbox" id="chk-color" checked> <span id="lbl-color">Color Nucleotides</span></label>
    <label class="tb-check"><input type="checkbox" id="chk-anno"> Show Annotations</label>
    <label class="tb-check" id="lbl-rev"><input type="checkbox" id="chk-rev"> Show Reverse Strand</label>
    <label class="tb-check" id="lbl-trans"><input type="checkbox" id="chk-trans"> Show Translations</label>
    <select id="frame-sel" class="tb-select" style="display:none">
      <option value="+1">+1 forward</option>
      <option value="+2">+2 forward</option>
      <option value="+3">+3 forward</option>
      <option value="-1">-1 reverse</option>
      <option value="-2">-2 reverse</option>
      <option value="-3">-3 reverse</option>
    </select>
    <div class="tb-zoom">
      <button id="btn-zm">−</button>
      <span id="zoom-label">100%</span>
      <button id="btn-zp">+</button>
    </div>
  </div>

  <div id="viewer-wrap">
    <canvas id="lin-canvas"></canvas>
    <canvas id="cir-canvas" class="canvas-hidden"></canvas>
    <div id="pos-info"></div>
  </div>

  <script nonce="${nonce}">
  (function () {
    // ── Nucleotide / amino-acid colors ────────────────────────────────────
    var NCOLORS = { A:'#5050FF', T:'#E6B800', G:'#00a000', C:'#FF5050', U:'#E6B800', N:'#888' };
    var AACOLORS = {
      A:'#888',G:'#aaa',V:'#4a8a4a',L:'#4a8a4a',I:'#4a8a4a',
      P:'#666',M:'#7a7a00',F:'#3a3a99',W:'#6a356a',
      S:'#904d1a',T:'#904d1a',C:'#7a7a00',Y:'#3a3a99',
      N:'#1a7070',Q:'#1a7070',
      D:'#993030',E:'#993030',K:'#1a4a99',R:'#1a4a99',H:'#4a4a99',
      '*':'#555',
    };
    var COMP = {A:'T',T:'A',G:'C',C:'G',U:'A',N:'N'};
    var GC = {
      TTT:'F',TTC:'F',TTA:'L',TTG:'L',TCT:'S',TCC:'S',TCA:'S',TCG:'S',
      TAT:'Y',TAC:'Y',TAA:'*',TAG:'*',TGT:'C',TGC:'C',TGA:'*',TGG:'W',
      CTT:'L',CTC:'L',CTA:'L',CTG:'L',CCT:'P',CCC:'P',CCA:'P',CCG:'P',
      CAT:'H',CAC:'H',CAA:'Q',CAG:'Q',CGT:'R',CGC:'R',CGA:'R',CGG:'R',
      ATT:'I',ATC:'I',ATA:'I',ATG:'M',ACT:'T',ACC:'T',ACA:'T',ACG:'T',
      AAT:'N',AAC:'N',AAA:'K',AAG:'K',AGT:'S',AGC:'S',AGA:'R',AGG:'R',
      GTT:'V',GTC:'V',GTA:'V',GTG:'V',GCT:'A',GCC:'A',GCA:'A',GCG:'A',
      GAT:'D',GAC:'D',GAA:'E',GAG:'E',GGT:'G',GGC:'G',GGA:'G',GGG:'G',
    };
    var ANN_PAL = ['#4a90d9','#e67e22','#2ecc71','#9b59b6','#e74c3c','#1abc9c'];

    // ── State ─────────────────────────────────────────────────────────────
    var S = {
      entries:[], idx:0,
      viewMode:'linear',
      colorNuc:true, showAnno:false, showRev:false, showTrans:false,
      readFrame:'+1',
      scrollY:0, zoom:1.0,
    };

    // ── Helpers ───────────────────────────────────────────────────────────
    function comp(seq) {
      var r='';
      for (var i=0;i<seq.length;i++) r+=COMP[seq[i]]||seq[i];
      return r;
    }
    function revComp(seq) { return comp(seq).split('').reverse().join(''); }
    function detectType(seq) {
      if (/[EFILPQZ]/.test(seq)) return 'protein';
      if (/U/.test(seq)) return 'rna';
      return 'dna';
    }
    function calcGC(seq) {
      var gc=0,tot=0;
      for (var i=0;i<seq.length;i++) {
        var b=seq[i];
        if (b==='G'||b==='C') gc++;
        if (b!=='N'&&b!=='-') tot++;
      }
      return tot>0?(gc/tot*100).toFixed(1)+'%':'N/A';
    }
    function isDark() {
      return document.body.classList.contains('vscode-dark')||
             document.body.classList.contains('vscode-high-contrast');
    }
    function theme() {
      var d=isDark();
      return {
        bg:    d?'#1e1e1e':'#ffffff',
        text:  d?'#d4d4d4':'#1a1a1a',
        muted: d?'#777':'#888',
        tick:  d?'#555':'#bbb',
        rowNum:d?'#666':'#888',
        annTxt:d?'#ccc':'#333',
      };
    }

    // ── Parsing ───────────────────────────────────────────────────────────
    function parseFile(text) {
      return text.trimStart().startsWith('@') ? parseFASTQ(text) : parseFASTA(text);
    }
    function parseFASTA(text) {
      var entries=[],cur=null,lines=text.trim().split('\\n');
      for (var i=0;i<lines.length;i++) {
        var line=lines[i].trim();
        if (!line||line[0]===';') continue;
        if (line[0]==='>') {
          if (cur&&cur.seq) entries.push(cur);
          var hdr=line.slice(1).trim();
          cur={name:hdr.split(' ')[0]||('seq'+entries.length),desc:hdr,seq:'',annotations:[],type:''};
        } else if (cur) {
          cur.seq+=line.toUpperCase().replace(/[^A-Z]/g,'');
        }
      }
      if (cur&&cur.seq) { cur.type=detectType(cur.seq); entries.push(cur); }
      entries.forEach(function(e){ if (!e.type) e.type=detectType(e.seq); });
      return entries;
    }
    function parseFASTQ(text) {
      var entries=[],lines=text.trim().split('\\n');
      for (var i=0;i+1<lines.length;i+=4) {
        var hdr=lines[i][0]==='@'?lines[i].slice(1).split(' ')[0].trim():('seq'+entries.length);
        var seq=(lines[i+1]||'').trim().toUpperCase().replace(/[^A-Z]/g,'');
        if (seq) entries.push({name:hdr,desc:lines[i].slice(1),seq:seq,annotations:[],type:detectType(seq)});
      }
      return entries;
    }

    // ── Layout ────────────────────────────────────────────────────────────
    function BW() { return Math.max(6, Math.round(12*S.zoom)); }
    function BH() { return Math.max(14,Math.round(20*S.zoom)); }
    var LM = 72; // left margin for row numbers

    function bpr(canvasW) {
      var n=Math.max(10,Math.floor((canvasW-LM-16)/BW()));
      return Math.floor(n/10)*10||10;
    }
    function isProtein() { var e=S.entries[S.idx]; return e&&e.type==='protein'; }
    function rowH() {
      var h=BH()+4;
      if (!isProtein()&&S.showRev)   h+=BH()+4;
      if (S.showAnno)                h+=20;
      if (!isProtein()&&S.showTrans) h+=Math.round(BH()*0.75)+4;
      return h+12;
    }

    // ── Linear draw ───────────────────────────────────────────────────────
    function drawLinear() {
      var wrap=document.getElementById('viewer-wrap');
      var canvas=document.getElementById('lin-canvas');
      var entry=S.entries[S.idx];
      if (!entry) return;

      var W=wrap.clientWidth, H=wrap.clientHeight;
      var dpr=window.devicePixelRatio||1;
      canvas.width=W*dpr; canvas.height=H*dpr;
      canvas.style.width=W+'px'; canvas.style.height=H+'px';

      var ctx=canvas.getContext('2d');
      ctx.scale(dpr,dpr);

      var C=theme(), bw=BW(), bh=BH(), rh=rowH();
      var BPR=bpr(W), seq=entry.seq, seqLen=seq.length;

      ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);

      var totalRows=Math.ceil(seqLen/BPR);
      var totalH=totalRows*rh+20;
      S.scrollY=Math.max(0,Math.min(S.scrollY,Math.max(0,totalH-H)));

      var startRow=Math.max(0,Math.floor(S.scrollY/rh)-1);
      var endRow=Math.min(totalRows,Math.ceil((S.scrollY+H)/rh)+1);

      for (var row=startRow;row<endRow;row++) {
        var rs=row*BPR, re=Math.min(rs+BPR,seqLen);
        var y0=row*rh-S.scrollY+10;

        // Row number
        ctx.fillStyle=C.rowNum;
        ctx.font=Math.max(9,Math.round(10*S.zoom))+'px monospace';
        ctx.textAlign='right';
        ctx.fillText((rs+1).toLocaleString(), LM-6, y0+bh-4);

        // Tick marks every 10 bp
        ctx.strokeStyle=C.tick; ctx.lineWidth=0.5;
        for (var p=rs;p<re;p++) {
          if ((p+1)%10===0) {
            var tx=LM+(p-rs+0.5)*bw;
            ctx.beginPath(); ctx.moveTo(tx,y0-8); ctx.lineTo(tx,y0-2); ctx.stroke();
          }
        }

        // Forward strand
        var prot=entry.type==='protein';
        drawBases(ctx, seq, rs, re, LM, y0, bw, bh, C, false, prot);
        var nextY=y0+bh+4;

        // Reverse/complement strand (DNA/RNA only)
        if (!prot && S.showRev) {
          drawBases(ctx, comp(seq), rs, re, LM, nextY, bw, bh, C, true, false);
          nextY+=bh+4;
        }

        // Annotations
        if (S.showAnno && entry.annotations && entry.annotations.length) {
          drawAnnotations(ctx, entry.annotations, rs, re, LM, nextY, bw, C);
          nextY+=20;
        }

        // Translation (DNA/RNA only)
        if (!prot && S.showTrans) drawTranslation(ctx, seq, rs, re, LM, nextY, bw, bh, C);
      }

      // Scrollbar hint
      if (totalH>H) {
        var sbH=Math.max(20,H*H/totalH), sbY=S.scrollY/totalH*H;
        ctx.fillStyle=isDark()?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.15)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(W-6,sbY,4,sbH,2);
        else ctx.rect(W-6,sbY,4,sbH);
        ctx.fill();
      }
    }

    function drawBases(ctx, fullSeq, start, end, lm, y, bw, bh, C, isRev, isProtein) {
      ctx.font='bold '+Math.max(9,Math.round(11*S.zoom))+'px monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      for (var i=start;i<end;i++) {
        var base=fullSeq[i], x=lm+(i-start)*bw;
        if (S.colorNuc) {
          var color=isProtein?(AACOLORS[base]||C.muted):(NCOLORS[base]||C.muted);
          ctx.fillStyle=color;
          ctx.fillRect(x,y,bw-1,bh);
          if (bw>=8) { ctx.fillStyle='#fff'; ctx.fillText(base,x+bw/2,y+bh/2); }
        } else {
          ctx.fillStyle=isRev?C.muted:C.text;
          if (bw>=8) ctx.fillText(base,x+bw/2,y+bh/2);
          else {
            ctx.strokeStyle=isRev?C.muted:C.text; ctx.lineWidth=bh;
            ctx.beginPath(); ctx.moveTo(lm,y+bh/2); ctx.lineTo(lm+(end-start)*bw,y+bh/2); ctx.stroke();
            break;
          }
        }
      }
    }

    function drawAnnotations(ctx, annotations, rowStart, rowEnd, lm, y, bw, C) {
      var rowAnns=annotations.filter(function(a){return a.start<rowEnd&&a.end>rowStart;});
      rowAnns.forEach(function(ann,idx) {
        var as=Math.max(ann.start,rowStart), ae=Math.min(ann.end,rowEnd);
        var x=lm+(as-rowStart)*bw, w=(ae-as)*bw;
        ctx.fillStyle=ann.color||ANN_PAL[idx%ANN_PAL.length];
        ctx.fillRect(x,y,w,7);
        if (w>30) {
          ctx.fillStyle=C.annTxt; ctx.font='9px sans-serif';
          ctx.textAlign='left'; ctx.textBaseline='top';
          ctx.fillText(ann.name,x+2,y+8);
        }
      });
    }

    function drawTranslation(ctx, seq, rowStart, rowEnd, lm, y, bw, bh, C) {
      var frame=S.readFrame, isForward=frame[0]==='+', frameNum=parseInt(frame[1])-1;
      var TH=Math.round(bh*0.75);
      var transSeq=isForward?seq:revComp(seq);

      // Frame label
      ctx.fillStyle=C.muted; ctx.font=Math.max(8,Math.round(9*S.zoom))+'px sans-serif';
      ctx.textAlign='right'; ctx.textBaseline='middle';
      ctx.fillText(frame,lm-4,y+TH/2);
      ctx.textBaseline='alphabetic';

      ctx.font='bold '+Math.max(8,Math.round(10*S.zoom))+'px monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';

      for (var i=rowStart;i<rowEnd;i++) {
        var globalPos=isForward?i:(seq.length-1-i);
        var posInFrame=(globalPos-frameNum+3000)%3;
        if (posInFrame!==0) continue;
        var codonStr=isForward
          ?seq.substring(globalPos,globalPos+3)
          :transSeq.substring(globalPos,globalPos+3);
        var aa=GC[codonStr]||null;
        if (!aa) continue;
        var vis=Math.min(3,rowEnd-i);
        var x=lm+(i-rowStart)*bw, w=vis*bw-1;
        ctx.fillStyle=AACOLORS[aa]||C.muted;
        ctx.fillRect(x,y,w,TH);
        if (w>=14) { ctx.fillStyle='#fff'; ctx.fillText(aa,x+w/2,y+TH/2); }
      }
    }

    // ── Circular draw ─────────────────────────────────────────────────────
    function drawCircular() {
      var wrap=document.getElementById('viewer-wrap');
      var canvas=document.getElementById('cir-canvas');
      var entry=S.entries[S.idx];
      if (!entry) return;

      var W=wrap.clientWidth, H=wrap.clientHeight;
      var dpr=window.devicePixelRatio||1;
      canvas.width=W*dpr; canvas.height=H*dpr;
      canvas.style.width=W+'px'; canvas.style.height=H+'px';

      var ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
      var C=theme();
      ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);

      var cx=W/2, cy=H/2, radius=Math.min(W,H)*0.32*S.zoom;
      var seq=entry.seq, seqLen=seq.length;
      if (!seqLen) return;

      var aStep=(2*Math.PI)/seqLen;

      // Base arcs (colored by dominant base/residue per segment)
      var prot2=entry.type==='protein';
      var colorMap=prot2?AACOLORS:NCOLORS;
      var segSz=Math.max(1,Math.floor(seqLen/720));
      for (var i=0;i<seqLen;i+=segSz) {
        var end=Math.min(i+segSz,seqLen);
        var sa=aStep*i-Math.PI/2, ea=aStep*end-Math.PI/2;
        var cnt={};
        for (var j=i;j<end;j++) cnt[seq[j]]=(cnt[seq[j]]||0)+1;
        var dom=Object.keys(cnt).reduce(function(a,b){return cnt[a]>cnt[b]?a:b;});
        ctx.strokeStyle=S.colorNuc?(colorMap[dom]||C.muted):(isDark()?'#4a90d9':'#2563eb');
        ctx.lineWidth=Math.max(6,Math.round(10*S.zoom));
        ctx.beginPath(); ctx.arc(cx,cy,radius,sa,ea); ctx.stroke();
      }

      // Individual bases/residues when zoomed + short sequence
      if (S.zoom>2 && seqLen<300) {
        for (var k=0;k<seqLen;k++) {
          var ang=aStep*k-Math.PI/2;
          var bx=cx+radius*Math.cos(ang), by=cy+radius*Math.sin(ang);
          ctx.fillStyle=S.colorNuc?(colorMap[seq[k]]||C.muted):C.text;
          ctx.font='bold '+Math.round(9*S.zoom)+'px monospace';
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.save(); ctx.translate(bx,by); ctx.rotate(ang+Math.PI/2);
          ctx.fillText(seq[k],0,0); ctx.restore();
        }
      }

      // Annotation outer arcs
      if (S.showAnno && entry.annotations && entry.annotations.length) {
        var annR=radius+Math.round(18*S.zoom);
        entry.annotations.forEach(function(ann,idx) {
          var sa2=aStep*ann.start-Math.PI/2, ea2=aStep*ann.end-Math.PI/2;
          ctx.strokeStyle=ann.color||ANN_PAL[idx%ANN_PAL.length];
          ctx.lineWidth=8;
          ctx.beginPath(); ctx.arc(cx,cy,annR,sa2,ea2); ctx.stroke();
          var mid=(sa2+ea2)/2;
          ctx.fillStyle=C.text; ctx.font='10px sans-serif';
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(ann.name, cx+(annR+18)*Math.cos(mid), cy+(annR+18)*Math.sin(mid));
        });
      }

      // Scale markers
      var interval=seqLen>10000?1000:seqLen>1000?500:seqLen>200?100:50;
      ctx.strokeStyle=C.tick; ctx.lineWidth=1;
      for (var m=0;m<seqLen;m+=interval) {
        var mAng=aStep*m-Math.PI/2;
        ctx.beginPath();
        ctx.moveTo(cx+(radius-10)*Math.cos(mAng),cy+(radius-10)*Math.sin(mAng));
        ctx.lineTo(cx+(radius-4)*Math.cos(mAng), cy+(radius-4)*Math.sin(mAng));
        ctx.stroke();
        ctx.fillStyle=C.muted; ctx.font='8px sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(m.toLocaleString(), cx+(radius-20)*Math.cos(mAng), cy+(radius-20)*Math.sin(mAng));
      }

      // Inner ring
      ctx.strokeStyle=isDark()?'#3a3a3a':'#ddd'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(cx,cy,radius*0.55,0,2*Math.PI); ctx.stroke();

      // Center label
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=C.text;
      ctx.font='bold 15px var(--vscode-font-family,system-ui)';
      var name=entry.name.length>22?entry.name.slice(0,20)+'…':entry.name;
      ctx.fillText(name,cx,cy-14);
      ctx.fillStyle=C.muted; ctx.font='12px var(--vscode-font-family,system-ui)';
      ctx.fillText(seqLen.toLocaleString()+(prot2?' aa':' bp'),cx,cy+4);
      ctx.font='11px var(--vscode-font-family,system-ui)';
      ctx.fillText(prot2?('protein'):'GC: '+calcGC(seq),cx,cy+20);
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function render() {
      if (S.viewMode==='linear') drawLinear(); else drawCircular();
    }

    function updateControls(entry) {
      var prot=entry.type==='protein';
      // Hide DNA-only controls for proteins
      document.getElementById('lbl-rev').style.display   = prot?'none':'flex';
      document.getElementById('lbl-trans').style.display = prot?'none':'flex';
      document.getElementById('frame-sel').style.display = (!prot&&S.showTrans)?'inline-block':'none';
      // Update color label
      document.getElementById('lbl-color').textContent = prot?'Color Residues':'Color Nucleotides';
      // Reset state flags that don't apply
      if (prot) { S.showRev=false; S.showTrans=false; }
    }

    function selectEntry(idx) {
      S.idx=idx; S.scrollY=0;
      updateControls(S.entries[idx]);
      render();
    }

    function setZoomLabel() {
      document.getElementById('zoom-label').textContent=Math.round(S.zoom*100)+'%';
    }

    // ── Bootstrap ──────────────────────────────────────────────────────────
    var entries=[];
    try { entries=parseFile(${dataJson}); } catch(e){}

    if (!entries.length) {
      document.getElementById('loading').style.display='none';
      document.getElementById('viewer-wrap').innerHTML=
        '<div style="padding:30px;color:var(--vscode-descriptionForeground)">No sequences found.</div>';
      return;
    }

    S.entries=entries;
    document.getElementById('loading').style.display='none';

    var first=entries[0];
    var isFirstProt=first.type==='protein';
    var totalLen=entries.reduce(function(s,e){return s+e.seq.length;},0);
    var unit=isFirstProt&&entries.length===1?'aa':'bp';
    document.getElementById('stats').textContent=
      entries.length+' sequence'+(entries.length!==1?'s':'')+
      ' · '+totalLen.toLocaleString()+' '+unit+
      (entries.length===1
        ?(isFirstProt?' · protein':' · GC: '+calcGC(first.seq)+' · '+first.type)
        :'');

    // Multi-sequence selector
    if (entries.length>1) {
      var sel=document.getElementById('seq-select');
      entries.forEach(function(e,i) {
        var opt=document.createElement('option');
        opt.value=i;
        var u=e.type==='protein'?'aa':'bp';
        opt.textContent=e.name+' ('+e.seq.length.toLocaleString()+' '+u+')';
        sel.appendChild(opt);
      });
      sel.style.display='inline-block';
      sel.addEventListener('change',function(){selectEntry(+sel.value);});
    }

    updateControls(first);
    render();

    // ── View mode tabs ─────────────────────────────────────────────────────
    document.getElementById('view-tabs').addEventListener('click',function(e) {
      var btn=e.target.closest('.tab-btn');
      if (!btn) return;
      var v=btn.dataset.view;
      S.viewMode=v; S.scrollY=0;
      document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.toggle('active',b.dataset.view===v);});
      document.getElementById('lin-canvas').classList.toggle('canvas-hidden',v!=='linear');
      document.getElementById('cir-canvas').classList.toggle('canvas-hidden',v!=='circular');
      render();
    });

    // ── Options ────────────────────────────────────────────────────────────
    document.getElementById('chk-color').addEventListener('change',function(e){S.colorNuc=e.target.checked;render();});
    document.getElementById('chk-anno').addEventListener('change',function(e){S.showAnno=e.target.checked;render();});
    document.getElementById('chk-rev').addEventListener('change',function(e){S.showRev=e.target.checked;render();});
    document.getElementById('chk-trans').addEventListener('change',function(e){
      S.showTrans=e.target.checked;
      document.getElementById('frame-sel').style.display=S.showTrans?'inline-block':'none';
      render();
    });
    document.getElementById('frame-sel').addEventListener('change',function(e){S.readFrame=e.target.value;render();});

    // ── Zoom ───────────────────────────────────────────────────────────────
    document.getElementById('btn-zp').addEventListener('click',function(){
      S.zoom=Math.min(3.0,parseFloat((S.zoom+0.25).toFixed(2)));setZoomLabel();render();
    });
    document.getElementById('btn-zm').addEventListener('click',function(){
      S.zoom=Math.max(0.25,parseFloat((S.zoom-0.25).toFixed(2)));setZoomLabel();render();
    });

    // ── Scroll (linear) / zoom-with-wheel (circular) ────────────────────
    document.getElementById('viewer-wrap').addEventListener('wheel',function(e){
      e.preventDefault();
      if (S.viewMode==='linear') { S.scrollY+=e.deltaY; render(); }
      else {
        S.zoom=e.deltaY<0
          ?Math.min(3.0,parseFloat((S.zoom+0.1).toFixed(2)))
          :Math.max(0.25,parseFloat((S.zoom-0.1).toFixed(2)));
        setZoomLabel(); render();
      }
    },{passive:false});

    // ── Hover tooltip ──────────────────────────────────────────────────────
    document.getElementById('viewer-wrap').addEventListener('mousemove',function(e){
      if (S.viewMode!=='linear') return;
      var entry=S.entries[S.idx];
      if (!entry) return;
      var rect=document.getElementById('viewer-wrap').getBoundingClientRect();
      var mx=e.clientX-rect.left, my=e.clientY-rect.top;
      var bw=BW(), rh=rowH(), BPR=bpr(rect.width);
      var row=Math.floor((my+S.scrollY-10)/rh);
      var col=Math.floor((mx-LM)/bw);
      var pos=row*BPR+col;
      var info=document.getElementById('pos-info');
      if (pos>=0&&pos<entry.seq.length) {
        var label=entry.type==='protein'?'Residue':'Base';
        info.textContent='Position: '+(pos+1).toLocaleString()+'  '+label+': '+entry.seq[pos];
      } else {
        info.textContent='';
      }
    });
    document.getElementById('viewer-wrap').addEventListener('mouseleave',function(){
      document.getElementById('pos-info').textContent='';
    });

    // ── Resize ─────────────────────────────────────────────────────────────
    var rTimer;
    window.addEventListener('resize',function(){clearTimeout(rTimer);rTimer=setTimeout(render,50);});

    setZoomLabel();
  })();
  </script>`;

  return shell(nonce, fileName, extraHead, body,
    'background:var(--vscode-editor-background);', isDark);
}
