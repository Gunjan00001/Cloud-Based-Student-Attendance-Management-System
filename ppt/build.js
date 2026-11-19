const pptxgen = require('pptxgenjs');
const html2pptx = require('C:/Users/Gunjan/.config/opencode/skills/pptx/scripts/html2pptx.js');

(async () => {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = 'Cloud-Based Student Attendance Management System';
  for (let i = 1; i <= 8; i++) await html2pptx(`slide${i}.html`, pptx);
  await pptx.writeFile({ fileName: 'attendance-system.pptx' });
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
