import { useEffect, useState } from 'react';

export function QrCode({ text, label }: { text: string; label: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    // Loaded on demand so the QR library isn't part of the initial download.
    import('qrcode')
      .then((QRCode) => QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }))
      .then((s) => live && setSvg(s), () => live && setSvg(''));
    return () => {
      live = false;
    };
  }, [text]);
  // The SVG comes from the QR library, not from user input.
  return svg ? <div className="qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}
