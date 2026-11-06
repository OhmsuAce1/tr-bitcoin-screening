/**
 * ==============================================================================
 * Google Apps Script Backend: ระบบบันทึกผลและตรวจเช็คหน้างาน (กบล.น1)
 * โครงการ: โปรแกรมชี้เป้าหม้อแปลงเสี่ยงเหมืองบิตคอยน์ (TR Bitcoin Screening)
 * ==============================================================================
 * 
 * 📌 ฝัง Spreadsheet ID ถาวร: 1MAl3n2rzX4U1foeEZeRyklbutylYb0X3CJO2pH0bzNE
 * 
 * 📌 วิธีการติดตั้ง (ใช้เวลา 2-3 นาที):
 * 1. เปิด Google Sheet (ID: 1MAl3n2rzX4U1foeEZeRyklbutylYb0X3CJO2pH0bzNE)
 * 2. ไปที่เมนู "ส่วนขยาย" (Extensions) > "Apps Script"
 * 3. ลบโค้ดเดิมทั้งหมดในไฟล์ Code.gs แล้วคัดลอกโค้ดทั้งหมดนี้ไปวาง
 * 4. กดปุ่ม "บันทึก" (รูปแผ่นดิสก์)
 * 5. กดปุ่ม "การทำให้ใช้งานได้" (Deploy) > "การทำให้ใช้งานได้ใหม่" (New deployment)
 *    - เลือกประเภท: "เว็บแอป" (Web app)
 *    - คำอธิบาย: TR Screening & Field Inspection API
 *    - ทำงานในฐานะ: "ฉัน" (Me - บัญชีของคุณ)
 *    - ผู้มีสิทธิ์เข้าถึง: "ทุกคน" (Anyone)
 * 6. กด "ทำให้ใช้งานได้" (Deploy) แล้วคัดลอก "URL ของเว็บแอป" (Web app URL)
 * 7. นำ Web app URL นั้นมาใส่ในช่องตั้งค่า "เชื่อมต่อออนไลน์" ในหน้าเว็บแอป index.html
 */

const SPREADSHEET_ID = '1MAl3n2rzX4U1foeEZeRyklbutylYb0X3CJO2pH0bzNE';
const MAIN_SHEET_NAME = 'คะแนน';
const TRACE_SHEET_NAME = 'บันทึกไล่สาย';
const FEEDER_SHEET_NAME = 'บันทึกฟีดเดอร์';
const FOLDER_NAME = 'ภาพตรวจหม้อแปลง_เหมืองบิตคอยน์';

function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

function getOrCreateTraceSheet(ss) {
  let sheet = ss.getSheetByName(TRACE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TRACE_SHEET_NAME);
    // สร้างหัวตาราง
    const headers = [
      'วันเวลาบันทึก',
      'เลขหม้อแปลง',
      'ฟีดเดอร์ที่เดินไล่',
      'ลำดับจุดวัด/เสาที่',
      'จุดสังเกต/พิกัด',
      'Ia (A)',
      'Ib (A)',
      'Ic (A)',
      'In (A)',
      'หมายเหตุการเปลี่ยนแปลงกระแส',
      'ผู้ตรวจ'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e0e7ff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateFeederSheet(ss) {
  let sheet = ss.getSheetByName(FEEDER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(FEEDER_SHEET_NAME);
    // สร้างหัวตารางบันทึกฟีดเดอร์
    const headers = [
      'วันเวลาบันทึก',
      'เลขหม้อแปลง',
      'ชื่อฟีดเดอร์',
      'Ia (A)',
      'Ib (A)',
      'Ic (A)',
      'In (A)',
      'Inc คำนวณ (A)',
      'Harmonic Ratio (E)',
      '%Unbalance (%Iub)',
      'สถานะความเสี่ยง',
      'ผู้ตรวจ'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#dbeafe');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * รองรับการดึงข้อมูลสถานะและสรุปผลเปรียบเทียบ (GET)
 */
function doGet(e) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(MAIN_SHEET_NAME);
    if (!sheet) {
      return responseJSON({ success: false, error: 'ไม่พบชีท: ' + MAIN_SHEET_NAME });
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return responseJSON({ success: true, transformers: [] });
    }

    // อ่านข้อมูลจากชีต "บันทึกฟีดเดอร์" (ถ้ามี) เพื่อส่งกลับไปให้หน้าเว็บแสดงผลแยกฟีดเดอร์
    const feederMap = {};
    const feederSheet = ss.getSheetByName(FEEDER_SHEET_NAME);
    if (feederSheet) {
      const fData = feederSheet.getDataRange().getValues();
      for (let j = 1; j < fData.length; j++) {
        const fRow = fData[j];
        const fTrId = String(fRow[1] || '').trim();
        if (!fTrId) continue;
        if (!feederMap[fTrId]) feederMap[fTrId] = [];
        feederMap[fTrId].push({
          timestamp: fRow[0],
          label: fRow[2] || 'Feeder',
          ia: fRow[3] !== undefined ? fRow[3] : '',
          ib: fRow[4] !== undefined ? fRow[4] : '',
          ic: fRow[5] !== undefined ? fRow[5] : '',
          inVal: fRow[6] !== undefined ? fRow[6] : '',
          inc: fRow[7] !== undefined ? fRow[7] : '',
          e: fRow[8] !== undefined ? fRow[8] : '',
          iub: fRow[9] !== undefined ? fRow[9] : '',
          riskLevel: fRow[10] || '',
          inspector: fRow[11] || ''
        });
      }
    }

    const results = [];
    // Data starts at row 2 (index 1)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const trId = String(row[1] || '').trim();
      if (!trId) continue;

      results.push({
        order: row[0],
        trId: trId,
        place: row[2] || '',
        office: row[3] || '',
        lat: parseFloat(row[4]) || null,
        lng: parseFloat(row[5]) || null,
        initialRisk: row[6] || 'สูง',
        inspected: row[7] === true || String(row[7]).toUpperCase() === 'TRUE',
        actualKva: row[8] || '',
        actualIa: row[9] || '',
        actualIb: row[10] || '',
        actualIc: row[11] || '',
        actualIn: row[12] || '',
        calcIn: row[13] || '', // Col N (idx 13): I N คำนวณ (Inc)
        calculatedKw: row[14] || '', // Col O (idx 14): kW (คำนวณจากวัดจริง)
        initialKw: row[15] || '', // Col P (idx 15): kW (จากค่าตั้งต้น)
        opsa: row[20] || '', // Col U (idx 20): %Load OPSA
        finalScore: row[28] || '', // Col AC (idx 28): คะแนน (ฐาน 90)
        finalLevel: row[31] || row[6] || 'สูง', // Col AF (idx 31): ระดับสุดท้าย
        remarks: row[32] || '', // Col AG (idx 32): หมายเหตุ
        feeders: feederMap[trId] || []
      });
    }

    return responseJSON({
      success: true,
      spreadsheetId: SPREADSHEET_ID,
      count: results.length,
      timestamp: new Date().toISOString(),
      transformers: results
    });
  } catch (err) {
    return responseJSON({ success: false, error: err.toString() });
  }
}

/**
 * รองรับการบันทึกผลตรวจหน้างาน และประวัติการเดินไล่สาย (POST)
 */
function doPost(e) {
  try {
    const contents = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : null;
    if (!contents) {
      return responseJSON({ success: false, error: 'ไม่มีข้อมูล Payload ส่งมา' });
    }

    const trId = String(contents.trId || '').trim();
    if (!trId) {
      return responseJSON({ success: false, error: 'ไม่พบเลขหม้อแปลง (trId)' });
    }

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(MAIN_SHEET_NAME);
    if (!sheet) {
      return responseJSON({ success: false, error: 'ไม่พบชีท: ' + MAIN_SHEET_NAME });
    }

    const data = sheet.getDataRange().getValues();
    let targetRowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() === trId) {
        targetRowIndex = i + 1; // 1-based row index in Google Sheets
        break;
      }
    }

    if (targetRowIndex === -1) {
      return responseJSON({ success: false, error: 'ไม่พบหม้อแปลงเลขที่ ' + trId + ' ในชีท ' + MAIN_SHEET_NAME });
    }

    // จัดการอัปโหลดรูปภาพลง Google Drive (ถ้ามี)
    const folder = getOrCreateFolder();
    const photoUrls = {};
    const timestampStr = Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd_HHmmss');

    function saveBase64Image(base64Data, label) {
      const match = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'png' ? 'png' : 'jpg';
        const rawBase64 = match[2];
        const blob = Utilities.newBlob(Utilities.base64Decode(rawBase64), 'image/' + ext, 'TR_' + trId + '_' + label + '_' + timestampStr + '.' + ext);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return file.getUrl();
      }
      return null;
    }

    if (contents.transformerPhotoBase64) {
      photoUrls.transformerPhoto = saveBase64Image(contents.transformerPhotoBase64, 'หม้อแปลง');
    }
    if (contents.locationPhotoBase64) {
      photoUrls.locationPhoto = saveBase64Image(contents.locationPhotoBase64, 'สถานที่');
    }
    if (contents.feederPhotoBase64) {
      photoUrls.feederPhoto = saveBase64Image(contents.feederPhotoBase64, 'ตู้ฟีดเดอร์');
    }
    if (contents.violationPhotoBase64) {
      photoUrls.violationPhoto = saveBase64Image(contents.violationPhotoBase64, 'อาคารละเมิด');
    }

    // 1. บันทึกข้อมูลค่าวัดจริงลงในชีท "คะแนน" (คอลัมน์ H ถึง M)
    // Col H (8): ตรวจแล้ว = TRUE
    sheet.getRange(targetRowIndex, 8).setValue(true);

    // Col I (9): kVA จริง
    if (contents.actualKva !== undefined && contents.actualKva !== '') {
      sheet.getRange(targetRowIndex, 9).setValue(contents.actualKva);
    }

    // Col J (10): Ia วัดจริง
    if (contents.actualIa !== undefined && contents.actualIa !== '') {
      sheet.getRange(targetRowIndex, 10).setValue(contents.actualIa);
    }

    // Col K (11): Ib วัดจริง
    if (contents.actualIb !== undefined && contents.actualIb !== '') {
      sheet.getRange(targetRowIndex, 11).setValue(contents.actualIb);
    }

    // Col L (12): Ic วัดจริง
    if (contents.actualIc !== undefined && contents.actualIc !== '') {
      sheet.getRange(targetRowIndex, 12).setValue(contents.actualIc);
    }

    // Col M (13): In วัดจริง
    if (contents.actualIn !== undefined && contents.actualIn !== '') {
      sheet.getRange(targetRowIndex, 13).setValue(contents.actualIn);
    }

    // หมายเหตุ: เว้น Col N (14) ไว้สำหรับสูตร I N คำนวณ (Inc)
    // และเว้น Col O (15) ไว้สำหรับสูตรคำนวณ kW วัดจริง
    // และเว้น Col P ถึง AF (16 ถึง 32) ไว้สำหรับสูตรคำนวณและประเมินระดับความเสี่ยงสุดท้าย (Col AF)

    // Col AG (33): หมายเหตุและผลตรวจ
    let noteText = '';
    if (contents.violationStatus) {
      noteText += '[' + contents.violationStatus + '] ';
    }
    if (contents.violationBuilding) {
      noteText += 'อาคาร: ' + contents.violationBuilding + ' ';
    }
    if (contents.feederNote) {
      noteText += 'ฟีดเดอร์: ' + contents.feederNote + ' ';
    }
    if (contents.remarks) {
      noteText += contents.remarks + ' ';
    } else if (contents.notes) {
      noteText += contents.notes + ' ';
    }
    if (contents.inspector) {
      noteText += '[ผู้ตรวจ: ' + contents.inspector + '] ';
    }
    noteText += '[เวลา: ' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm') + '] ';
    if (photoUrls.transformerPhoto) noteText += '[รูปหม้อแปลง: ' + photoUrls.transformerPhoto + '] ';
    if (photoUrls.violationPhoto) noteText += '[รูปละเมิด: ' + photoUrls.violationPhoto + '] ';

    if (noteText) {
      sheet.getRange(targetRowIndex, 33).setValue(noteText.trim());
    }

    // 2. บันทึกข้อมูลค่าวัดแยกรายฟีดเดอร์ลงชีต "บันทึกฟีดเดอร์" (ถ้ามี)
    if (contents.feeders && Array.isArray(contents.feeders) && contents.feeders.length > 0) {
      const feederSheet = getOrCreateFeederSheet(ss);
      const inspectorName = contents.inspector || '-';
      const nowFormatted = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm:ss');

      contents.feeders.forEach((f) => {
        feederSheet.appendRow([
          nowFormatted,
          trId,
          f.label || 'Feeder',
          f.ia || '',
          f.ib || '',
          f.ic || '',
          f.inVal !== undefined && f.inVal !== '' ? f.inVal : (f.in || ''),
          f.inc || '',
          f.e || '',
          f.iub || '',
          f.riskLevel || '',
          inspectorName
        ]);
      });
    }

    // 3. บันทึกข้อมูลการเดินไล่สายลงชีต "บันทึกไล่สาย" (ถ้ามี)
    if (contents.lineTracing && Array.isArray(contents.lineTracing) && contents.lineTracing.length > 0) {
      const traceSheet = getOrCreateTraceSheet(ss);
      const inspectorName = contents.inspector || '-';
      const nowFormatted = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm:ss');

      contents.lineTracing.forEach((point, idx) => {
        traceSheet.appendRow([
          nowFormatted,
          trId,
          point.feeder || contents.targetFeeder || 'Feeder 3',
          point.poleName || ('จุดที่ ' + (idx + 1)),
          point.locationDetail || '',
          point.ia || '',
          point.ib || '',
          point.ic || '',
          point.inVal !== undefined && point.inVal !== '' ? point.inVal : (point.in || ''),
          point.note || '',
          inspectorName
        ]);
      });
    }

    return responseJSON({
      success: true,
      message: 'บันทึกค่าวัดและประวัติการเดินไล่สายสำเร็จ',
      trId: trId,
      photoUrls: photoUrls
    });
  } catch (err) {
    return responseJSON({ success: false, error: err.toString() });
  }
}

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
