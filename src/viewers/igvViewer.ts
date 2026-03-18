import { CDN, newNonce, shell } from './viewerShell';

const FMT_MAP: Record<string, string> = {
  bam: 'bam', sam: 'sam', cram: 'cram',
  vcf: 'vcf', bcf: 'vcf', bed: 'bed', bigwig: 'bigwig', bw: 'bigwig',
};

/**
 * IGV.js viewer for alignment (BAM/SAM/CRAM) and variant (VCF/BCF/BED/BigWig) files.
 * Uses the file URL directly — IGV.js handles its own fetching with CORS support.
 */
export function igvHtml(
  fileName: string,
  type: string,
  ext: string,
  fileUrl: string,
): string {
  const nonce = newNonce();
  const urlJson = JSON.stringify(fileUrl);
  const label = type === 'alignment' ? 'alignment' : 'variant';
  const igvFormat = FMT_MAP[ext.slice(1)] ?? ext.slice(1);

  const extraHead = `<style>
    body { display: flex; flex-direction: column; }
    #igv-wrap { flex: 1; overflow: auto; width: 100%; padding: 8px; background: #fff; }
  </style>`;

  const body = /* html */`
  <div id="igv-wrap" style="display:none"></div>
  <script src="${CDN.IGV_JS}" nonce="${nonce}"></script>
  <script nonce="${nonce}">
    document.getElementById('loading-text').textContent = 'Loading ${label} viewer…';
    (async () => {
      try {
        const wrap = document.getElementById('igv-wrap');
        await igv.createBrowser(wrap, {
          genome: 'hg38',
          tracks: [{
            url: ${urlJson},
            format: '${igvFormat}',
            name: '${fileName.replace(/'/g, "\\'")}',
          }],
        });
        document.getElementById('loading').style.display = 'none';
        wrap.style.display = 'block';
      } catch (e) {
        document.getElementById('loading').innerHTML =
          '<div class="error-msg">Failed to load ${label} viewer: ' + (e && e.message || e) + '</div>';
      }
    })();
  </script>`;

  return shell(nonce, fileName, extraHead, body, 'background:#fff;color:#111;');
}
