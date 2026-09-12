/**
 * Roman Urdu → Urdu (Nastaliq) transliterator for data-entry fields.
 * Users type Roman Urdu; stored/displayed value is Urdu script.
 */

const WORD_MAP: Record<string, string> = {
  aur: 'اور',
  or: 'اور',
  ka: 'کا',
  ki: 'کی',
  ke: 'کے',
  ko: 'کو',
  se: 'سے',
  mein: 'میں',
  men: 'میں',
  par: 'پر',
  pe: 'پے',
  hai: 'ہے',
  hain: 'ہیں',
  tha: 'تھا',
  thi: 'تھی',
  the: 'تھے',
  yeh: 'یہ',
  ye: 'یہ',
  woh: 'وہ',
  wo: 'وہ',
  main: 'میں',
  tum: 'تم',
  aap: 'آپ',
  hum: 'ہم',
  nahi: 'نہیں',
  nahin: 'نہیں',
  na: 'نہ',
  haan: 'ہاں',
  han: 'ہاں',
  bilkul: 'بالکل',
  shukriya: 'شکریہ',
  mehrbani: 'مہربانی',
  please: 'براہِ کرم',
  new: 'نیا',
  purana: 'پرانا',
  bara: 'بڑا',
  chota: 'چھوٹا',
  acha: 'اچھا',
  achha: 'اچھا',
  bura: 'برا',
  safed: 'سفید',
  kala: 'کالا',
  laal: 'لال',
  neela: 'نیلا',
  hara: 'ہرا',
  peela: 'پیلا',
  size: 'سائز',
  colour: 'رنگ',
  color: 'رنگ',
  rang: 'رنگ',
  maal: 'مال',
  saman: 'سامان',
  cheez: 'چیز',
  item: 'آئٹم',
  product: 'پروڈکٹ',
  customer: 'کسٹمر',
  gahak: 'گاہک',
  supplier: 'سپلائر',
  bill: 'بل',
  invoice: 'انوائس',
  cash: 'کیش',
  udhaar: 'ادھار',
  udhar: 'ادھار',
  payment: 'پیمنٹ',
  adaigi: 'ادائیگی',
  price: 'قیمت',
  qeemat: 'قیمت',
  rate: 'ریٹ',
  total: 'ٹوٹل',
  kul: 'کل',
  discount: 'ڈسکاؤنٹ',
  stock: 'اسٹاک',
  shop: 'شاپ',
  dukaan: 'دکان',
  auto: 'آٹو',
  parts: 'پارٹس',
  oil: 'آئل',
  filter: 'فلٹر',
  battery: 'بیٹری',
  tyre: 'ٹائر',
  tire: 'ٹائر',
  brake: 'بریک',
  clutch: 'کلچ',
  engine: 'انجن',
  gear: 'گیئر',
  light: 'لائٹ',
  mirror: 'مرر',
  horn: 'ہارن',
  wiper: 'وائپر',
  cable: 'کیبل',
  wire: 'وائر',
  bolt: 'بولٹ',
  nut: 'نٹ',
  washer: 'واشر',
  gasket: 'گاسکٹ',
  pump: 'پمپ',
  sensor: 'سینسر',
  switch: 'سوئچ',
  relay: 'ریلے',
  fuse: 'فیوز',
  original: 'اوریجنل',
  copy: 'کاپی',
  local: 'لوکل',
  china: 'چائنا',
  japan: 'جاپان',
  korea: 'کوریا',
  german: 'جرمن',
  pakistani: 'پاکستانی',
  number: 'نمبر',
  no: 'نمبر',
  piece: 'پیس',
  pcs: 'پیس',
  set: 'سیٹ',
  pair: 'پیئر',
  box: 'باکس',
  packet: 'پیکٹ',
  litre: 'لیٹر',
  liter: 'لیٹر',
  kg: 'کلو',
  kilo: 'کلو',
  meter: 'میٹر',
  metre: 'میٹر',
  mm: 'ایم ایم',
  inch: 'انچ',
  feet: 'فٹ',
  foot: 'فٹ',
};

/** Multi-letter digraphs / trigraphs longest-first. */
const DIGRAPHS: Array<[string, string]> = [
  ['kh', 'خ'],
  ['gh', 'غ'],
  ['ch', 'چ'],
  ['sh', 'ش'],
  ['zh', 'ژ'],
  ['th', 'تھ'],
  ['dh', 'دھ'],
  ['ph', 'پھ'],
  ['bh', 'بھ'],
  ['jh', 'جھ'],
  ['ng', 'نگ'],
  ['ny', 'نی'],
  ['q', 'ق'],
  ['w', 'و'],
  ['v', 'و'],
  ['y', 'ی'],
  ['x', 'کس'],
  ['z', 'ز'],
  ['j', 'ج'],
  ['f', 'ف'],
  ['b', 'ب'],
  ['p', 'پ'],
  ['t', 'ت'],
  ['d', 'د'],
  ['k', 'ک'],
  ['g', 'گ'],
  ['l', 'ل'],
  ['m', 'م'],
  ['n', 'ن'],
  ['r', 'ر'],
  ['s', 'س'],
  ['h', 'ہ'],
  ['c', 'ک'],
];

const VOWELS: Record<string, string> = {
  aa: 'ا',
  ee: 'ی',
  ii: 'ی',
  oo: 'و',
  uu: 'و',
  ai: 'ے',
  ay: 'ے',
  ei: 'ے',
  ey: 'ے',
  au: 'و',
  ou: 'و',
  a: 'ا',
  e: 'ے',
  i: 'ی',
  o: 'و',
  u: 'و',
};

function transliterateWord(raw: string): string {
  const lower = raw.toLowerCase();
  if (WORD_MAP[lower]) return WORD_MAP[lower];

  // Keep pure digits / codes
  if (/^[\d./%-]+$/.test(raw)) return raw;
  // Already mostly Arabic script
  if (/[\u0600-\u06FF]/.test(raw) && !/[A-Za-z]/.test(raw)) return raw;

  let i = 0;
  let out = '';
  const s = lower;

  while (i < s.length) {
    let matched = false;

    // Vowels (2-letter then 1)
    for (const len of [2, 1]) {
      const chunk = s.slice(i, i + len);
      if (VOWELS[chunk] !== undefined) {
        // Leading vowel → alef + vowel letter for a/i/u family
        if (i === 0 && (chunk === 'a' || chunk === 'aa' || chunk === 'i' || chunk === 'ii' || chunk === 'ee' || chunk === 'u' || chunk === 'uu' || chunk === 'oo' || chunk === 'o' || chunk === 'e' || chunk === 'ai' || chunk === 'ay')) {
          if (chunk === 'a' || chunk === 'aa') out += 'آ';
          else if (chunk === 'i' || chunk === 'ii' || chunk === 'ee') out += 'ای';
          else if (chunk === 'u' || chunk === 'uu' || chunk === 'oo' || chunk === 'o') out += 'او';
          else out += 'اے';
        } else {
          out += VOWELS[chunk];
        }
        i += len;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const [lat, ur] of DIGRAPHS) {
      if (s.startsWith(lat, i)) {
        out += ur;
        i += lat.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    out += s[i];
    i += 1;
  }

  return out || raw;
}

/** Convert a Roman Urdu phrase to Urdu script. Leaves existing Urdu/digits intact. */
export function romanUrduToUrdu(input: string): string {
  if (!input) return input;
  return input.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (word) => transliterateWord(word));
}

/** True when the string has Latin letters worth converting. */
export function hasRomanLetters(value: string): boolean {
  return /[A-Za-z]/.test(value);
}
