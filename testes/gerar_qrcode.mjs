// Gera docs/qrcode.png com o link do jogo (npm run qrcode). Troque o LINK se o repositório tiver outro nome.
import QRCode from 'qrcode';
const LINK = 'https://gaburadigital.github.io/lutcha/';
await QRCode.toFile('docs/qrcode.png', LINK, { width: 480, margin: 2, color: { dark: '#0c1a24', light: '#ffffff' } });
console.log('docs/qrcode.png gerado para', LINK);
