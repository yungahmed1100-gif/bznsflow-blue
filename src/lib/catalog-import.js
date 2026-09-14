const MAX_FILE = 15 * 1024 * 1024;
const MAX_TEXT = 100000;

const normalize = text => String(text || '').replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

export function extractCatalogRows(text, source = 'catalog') {
  const parts = normalize(text).split(/(?<=[.!؟])\s+|\s*[|•·\t]\s*/).filter(value => value.length > 3 && value.length < 500);
  const pricePattern = /(?:OMR|RO|ر\.?\s?ع\.?|AED|SAR|USD|\$)\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:OMR|RO|ريال|AED|SAR|USD)/i;
  return parts.flatMap(part => {
    const match = part.match(pricePattern);
    if (!match) return [];
    const name = part.slice(0, match.index).replace(/^(price|prices|السعر|الأسعار)\s*[:—-]?/i, '').split(/[:—-]/)[0].trim().slice(0, 160);
    if (name.length < 2) return [];
    const isArabic = /[\u0600-\u06ff]/.test(name);
    const currency = /OMR|RO|ر\.?\s?ع|ريال/i.test(match[0]) ? 'OMR' : /AED/i.test(match[0]) ? 'AED' : /SAR/i.test(match[0]) ? 'SAR' : 'USD';
    return [{
      kind: 'service', nameEn: isArabic ? '' : name, nameAr: isArabic ? name : '', benefitEn: '', benefitAr: '',
      descriptionEn: isArabic ? '' : part, descriptionAr: isArabic ? part : '', category: '', availability: '',
      prices: [{ type: /from|starting|ابتداء/i.test(part) ? 'from' : 'fixed', currency, label: match[0], unit: '' }], source, confidence: 0.7,
      laylaUseEn: 'Answer customer questions about this service and its approved price.', laylaUseAr: 'الإجابة عن أسئلة العملاء حول هذه الخدمة وسعرها المعتمد.',
    }];
  }).slice(0, 1000);
}

async function ocr(source) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['eng', 'ara']);
  try { return (await worker.recognize(source)).data.text; } finally { await worker.terminate(); }
}

async function pdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  const output = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 200); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    output.push(content.items.map(item => item.str || '').join(' '));
  }
  return output.join('\n');
}

async function docxText(buffer) {
  const mammoth = await import('mammoth/mammoth.browser');
  return (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
}

async function sheetText(buffer) {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const output = [];
  workbook.eachSheet(sheet => {
    sheet.eachRow(row => {
      output.push(row.values.slice(1).map(value => {
        if (typeof value === 'object' && value?.text) return value.text;
        if (typeof value === 'object' && value?.result != null) return String(value.result);
        return String(value ?? '');
      }).join('\t'));
    });
  });
  return output.join('\n');
}

export async function readCatalogFile(file) {
  if (!file || file.size > MAX_FILE) throw new Error('catalog_file_too_large');
  const type = file.type || '';
  const name = String(file.name || '').toLowerCase();
  const buffer = await file.arrayBuffer();
  let text;
  if (type.startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name)) text = await ocr(file);
  else if (type === 'application/pdf' || name.endsWith('.pdf')) text = await pdfText(buffer);
  else if (name.endsWith('.docx')) text = await docxText(buffer);
  else if (name.endsWith('.xlsx')) text = await sheetText(buffer);
  else if (/\.(csv|txt)$/.test(name) || type.startsWith('text/')) text = new TextDecoder().decode(buffer);
  else throw new Error('catalog_file_type');
  text = normalize(text);
  if (!text) throw new Error('catalog_file_empty');
  return { text, entries: extractCatalogRows(text, file.name), partial: text.length >= MAX_TEXT };
}
