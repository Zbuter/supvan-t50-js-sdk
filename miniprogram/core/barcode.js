const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function widthsToBits(pattern) {
  const bits = [];
  let black = true;
  for (const character of pattern) {
    const width = Number(character);
    for (let index = 0; index < width; index += 1) bits.push(black);
    black = !black;
  }
  return bits;
}

function code128Bits(value) {
  const content = String(value || " ").slice(0, 80);
  const codes = Array.from(content, (character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code <= 126 ? code - 32 : 31;
  });
  const values = [104, ...codes];
  let checksum = 104;
  codes.forEach((code, index) => { checksum += code * (index + 1); });
  values.push(checksum % 103, 106);
  return values.flatMap((code) => widthsToBits(CODE128_PATTERNS[code]));
}

function eanCheckDigit(twelveDigits) {
  const sum = Array.from(twelveDigits, Number).reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function normalizeEan(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const firstTwelve = digits.slice(0, 12).padStart(12, "0");
  return firstTwelve + eanCheckDigit(firstTwelve);
}

function ean13Bits(value) {
  const digits = normalizeEan(value);
  const parity = EAN_PARITY[Number(digits[0])];
  let pattern = "101";
  for (let index = 1; index <= 6; index += 1) {
    const digit = Number(digits[index]);
    pattern += parity[index - 1] === "L" ? EAN_L[digit] : EAN_G[digit];
  }
  pattern += "01010";
  for (let index = 7; index <= 12; index += 1) pattern += EAN_R[Number(digits[index])];
  pattern += "101";
  return Array.from(pattern, (bit) => bit === "1");
}

function barcodeBits(format, value) {
  return format === "EAN_13" ? ean13Bits(value) : code128Bits(value);
}

module.exports = { barcodeBits, code128Bits, ean13Bits, normalizeEan };
