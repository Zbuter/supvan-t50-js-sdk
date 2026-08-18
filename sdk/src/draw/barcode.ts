import { ValidationError } from "../errors";

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
] as const;

const EAN13_L = [
  "0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011",
] as const;
const EAN13_G = [
  "0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111",
] as const;
const EAN13_R = [
  "1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100",
] as const;
const EAN13_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"] as const;

export function code128Modules(value: string): number[] {
  if (!value) throw new ValidationError("CODE_128 内容不能为空");
  const values = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    if (code < 32 || code > 127) throw new ValidationError("CODE_128 仅支持 ASCII 字符");
    return code - 32;
  });
  let checksum = 104;
  values.forEach((item, index) => { checksum += item * (index + 1); });
  const symbols = [104, ...values, checksum % 103, 106];
  return symbols.flatMap((symbol) => patternModules(CODE128_PATTERNS[symbol] ?? ""));
}

export function ean13Modules(value: string): number[] {
  if (!/^\d{12,13}$/.test(value)) throw new ValidationError("EAN_13 内容必须是 12 或 13 位数字");
  const digits = value.slice(0, 12).split("").map(Number);
  const checksum = (10 - digits.reduce((sum, digit, index) => sum + digit * (index % 2 ? 3 : 1), 0) % 10) % 10;
  if (value.length === 13 && Number(value[12]) !== checksum) throw new ValidationError("EAN_13 校验位不正确");
  const all = [...digits, checksum];
  const parity = EAN13_PARITY[all[0] ?? 0] ?? EAN13_PARITY[0];
  const modules: number[] = [1, 0, 1];
  for (let index = 1; index <= 6; index += 1) {
    const pattern = parity[index - 1] === "G" ? EAN13_G : EAN13_L;
    appendPattern(modules, pattern[all[index] ?? 0] ?? pattern[0]);
  }
  modules.push(0, 1, 0, 1, 0);
  for (let index = 7; index < 13; index += 1) appendPattern(modules, EAN13_R[all[index] ?? 0] ?? EAN13_R[0]);
  modules.push(1, 0, 1);
  return modules;
}

function appendPattern(output: number[], pattern: string): void {
  for (const bit of pattern) output.push(bit === "1" ? 1 : 0);
}

function patternModules(pattern: string): number[] {
  const output: number[] = [];
  let black = true;
  for (const width of pattern) {
    for (let index = 0; index < Number(width); index += 1) output.push(black ? 1 : 0);
    black = !black;
  }
  return output;
}
