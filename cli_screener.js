#!/usr/bin/env node
/**
 * โปรแกรมชี้เป้าหม้อแปลงเสี่ยงเหมืองบิตคอยน์ (TR Bitcoin Screening CLI)
 * แผนกวิเคราะห์และพัฒนาความสูญเสีย กบล.(น1)
 * 
 * ใช้งาน:
 *   node cli_screener.js --kva 100 --ia 53.5 --ib 49.2 --ic 40.5 --in 143.1 [--opsa 17.5] [--id 58-009979]
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).toLowerCase();
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      params[key] = val;
    }
  }
  return params;
}

function calculateEngine(kva, ia, ib, ic, inVal, opsaVal, hasOpsa) {
  if (!kva || kva <= 0) return null;
  if (isNaN(ia) || isNaN(ib) || isNaN(ic) || isNaN(inVal)) return null;

  const iAvg = (ia + ib + ic) / 3;
  const kw = (ia + ib + ic) * 0.23 * 0.9;

  // Inc = sqrt(Ia^2 + Ib^2 + Ic^2 - Ia*Ib - Ib*Ic - Ic*Ia)
  const inc = Math.sqrt(Math.max(0, ia * ia + ib * ib + ic * ic - ia * ib - ib * ic - ic * ia));

  // E = (In - Inc) / I_avg
  const E = iAvg > 0 ? (inVal - inc) / iAvg : 0;

  // %Iub = max deviation / I_avg * 100
  const maxDev = Math.max(Math.abs(ia - iAvg), Math.abs(ib - iAvg), Math.abs(ic - iAvg));
  const iubPct = iAvg > 0 ? (maxDev / iAvg) * 100 : 0;

  // %Load = kw / kva * 100
  const loadPct = (kw / kva) * 100;

  // Criteria A (35)
  let scoreA = 0;
  if (E >= 1.2) scoreA = 35;
  else if (E >= 0.9) scoreA = 30;
  else if (E >= 0.6) scoreA = 20;
  else if (E >= 0.3) scoreA = 10;
  else scoreA = 0;

  // Criteria B (25)
  let scoreB = null;
  let loadDiff = null;
  if (hasOpsa && opsaVal !== null && !isNaN(opsaVal)) {
    loadDiff = loadPct - opsaVal;
    if (loadDiff >= 10) scoreB = 25;
    else if (loadDiff >= 3) scoreB = 18;
    else if (loadDiff >= -3) scoreB = 10;
    else scoreB = 0;
  }

  // Criteria C (20)
  let scoreC = 0;
  if (kw >= 60) scoreC = 20;
  else if (kw >= 40) scoreC = 14;
  else if (kw >= 30) scoreC = 8;
  else if (kw >= 25) scoreC = 4;
  else scoreC = 0;

  // Criteria D (10)
  let scoreD = 0;
  if (iubPct <= 6) scoreD = 10;
  else if (iubPct < 16) scoreD = 5;
  else scoreD = 0;

  let rawTotal = 0;
  let fullPoints = 90;
  let finalScore = 0;

  if (hasOpsa && scoreB !== null) {
    rawTotal = scoreA + scoreB + scoreC + scoreD;
    fullPoints = 90;
    finalScore = rawTotal;
  } else {
    rawTotal = scoreA + scoreC + scoreD;
    fullPoints = 65;
    finalScore = Math.round((rawTotal / 65) * 90);
  }

  let baseLevel = 'ต่ำ';
  if (finalScore >= 60) baseLevel = 'สูง';
  else if (finalScore >= 50) baseLevel = 'กลาง';

  // Boost Flag ↑
  let flagUp = false;
  if (hasOpsa && scoreB === 25 && iubPct <= 6 && scoreA <= 20) {
    flagUp = true;
  }

  let finalLevel = baseLevel;
  if (flagUp) {
    if (baseLevel === 'ต่ำ') finalLevel = 'กลาง';
    else if (baseLevel === 'กลาง') finalLevel = 'สูง';
  }

  return {
    iAvg, kw, inc, E, iubPct, loadPct, loadDiff,
    scoreA, scoreB, scoreC, scoreD, rawTotal, fullPoints, finalScore,
    baseLevel, flagUp, finalLevel
  };
}

const params = parseArgs();
const kva = parseFloat(params.kva);
const ia = parseFloat(params.ia);
const ib = parseFloat(params.ib);
const ic = parseFloat(params.ic);
const inVal = parseFloat(params.in);
const opsa = params.opsa !== undefined ? parseFloat(params.opsa) : null;
const id = params.id || 'N/A';

if (isNaN(kva) || isNaN(ia) || isNaN(ib) || isNaN(ic) || isNaN(inVal)) {
  console.log(`
===========================================================
  โปรแกรมชี้เป้าหม้อแปลงเสี่ยงเหมืองบิตคอยน์ (CLI)
===========================================================
วิธีใช้:
  node cli_screener.js --kva <ค่า kVA> --ia <Ia> --ib <Ib> --ic <Ic> --in <In> [--opsa <%OPSA>] [--id <เลขหม้อแปลง>]

ตัวอย่าง (หม้อแปลง 58-009979):
  node cli_screener.js --kva 100 --ia 53.5 --ib 49.2 --ic 40.5 --in 143.1 --opsa 17.5 --id 58-009979
  `);
  process.exit(1);
}

const result = calculateEngine(kva, ia, ib, ic, inVal, opsa, opsa !== null);

console.log(`
===========================================================
 🎯 ผลการประเมินความเสี่ยงหม้อแปลง: ${id}
===========================================================
[ข้อมูลนำเข้า]
- ขนาดหม้อแปลง: ${kva} kVA
- กระแสเฟส: Ia = ${ia} A, Ib = ${ib} A, Ic = ${ic} A
- กระแสสายนิวทรัล (In): ${inVal} A
- ภาระโหลดจากมิเตอร์ (%OPSA): ${opsa !== null ? opsa + '%' : 'ไม่มีข้อมูล'}

[ค่าทางไฟฟ้าที่คำนวณได้]
- กระแสเฉลี่ย (I_avg): ${result.iAvg.toFixed(2)} A
- กำลังไฟฟ้าโดยประมาณ (kW): ${result.kw.toFixed(2)} kW
- กระแสสายนิวทรัลปกติ (Inc): ${result.inc.toFixed(2)} A
- สัดส่วน N เกินจากฮาร์มอนิก (E): ${result.E.toFixed(2)} (${(result.E * 100).toFixed(1)}%)
- ความไม่สมดุลกระแสเฟส (%Iub): ${result.iubPct.toFixed(2)}%
- ภาระโหลดหม้อแปลง (%Load): ${result.loadPct.toFixed(2)}%
${result.loadDiff !== null ? `- ส่วนต่าง (%Load - %OPSA): ${result.loadDiff >= 0 ? '+' : ''}${result.loadDiff.toFixed(2)}%` : ''}

[คะแนนแยกตาม 4 เกณฑ์ (เต็ม 90 คะแนน)]
- เกณฑ์ A (N เกินจากฮาร์มอนิก, เต็ม 35): ${result.scoreA} คะแนน
- เกณฑ์ B (โหลดสูงกว่ามิเตอร์ OPSA, เต็ม 25): ${result.scoreB !== null ? result.scoreB + ' คะแนน' : 'ตัดออก (ไม่มี OPSA)'}
- เกณฑ์ C (กำลังไฟฟ้า kW, เต็ม 20): ${result.scoreC} คะแนน
- เกณฑ์ D (เฟสสมดุล ยืนยัน N จากฮาร์มอนิก, เต็ม 10): ${result.scoreD} คะแนน
-----------------------------------------------------------
⭐ คะแนนรวมสุทธิ: ${result.finalScore} / 90 คะแนน
🏷️ ระดับความเสี่ยง: [ ${result.finalLevel.toUpperCase()} ] ${result.flagUp ? '(↑ มีธงยกระดับความเสี่ยง)' : ''}
-----------------------------------------------------------
`);

if (result.kw < 25) {
  console.log('⚡ ข้อสังเกต: กำลังไฟฟ้าต่ำกว่า 25 kW (อยู่นอกเกณฑ์คัดกรองเบื้องต้น)');
}
if (inVal > 2 * result.iAvg) {
  console.log('⚠ ข้อควรระวัง: กระแส In วัดได้สูงกว่า 2 เท่าของ I_avg (อาจมีฮาร์มอนิกลำดับ 3 รุนแรงมาก หรือค่าวัดรวมสาย)');
}
if (result.loadPct > 120) {
  console.log('⚠ ข้อควรระวัง: %Load เกิน 120% โปรดตรวจสอบขนาด kVA ที่ป้ายหม้อแปลง');
}
