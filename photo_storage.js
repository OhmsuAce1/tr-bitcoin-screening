/**
 * photo_storage.js
 * ระบบจัดเก็บและบีบอัดรูปภาพฝั่ง Client ผ่าน IndexedDB
 * รองรับการทำงานแบบ Offline 100% ไม่ติดข้อจำกัด 5MB ของ LocalStorage
 */

const DB_NAME = 'TRBitcoinScreeningDB';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

let dbInstance = null;

function getDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * บีบอัดภาพผ่าน HTML5 Canvas เพื่อให้ไฟล์มีขนาดเหมาะสม (~150-250KB)
 * @param {File|Blob} file 
 * @param {number} maxWidth 
 * @param {number} quality 
 * @returns {Promise<string>} Base64 DataURL
 */
function compressImage(file, maxWidth = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = readerEvent.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * บันทึกรูปภาพลง IndexedDB
 * @param {string} trId เลขหม้อแปลง
 * @param {'transformer'|'location'} type ประเภทรูป
 * @param {string} dataUrl รูปภาพแบบ Base64 DataURL
 */
async function savePhotoToDB(trId, type, dataUrl) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const id = `${trId}_${type}`;
    store.put({
      id: id,
      trId: trId,
      type: type,
      dataUrl: dataUrl,
      timestamp: new Date().toISOString()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * ดึงรูปภาพทั้งหมดของหม้อแปลงลูกนั้น
 * @param {string} trId 
 * @returns {Promise<{transformerPhoto: string|null, locationPhoto: string|null}>}
 */
async function getPhotosForTR(trId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const reqTR = store.get(`${trId}_transformer`);
    const reqLoc = store.get(`${trId}_location`);

    let trPhoto = null;
    let locPhoto = null;
    let done = 0;

    function checkDone() {
      done++;
      if (done === 2) {
        resolve({
          transformerPhoto: trPhoto ? trPhoto.dataUrl : null,
          locationPhoto: locPhoto ? locPhoto.dataUrl : null,
          trTimestamp: trPhoto ? trPhoto.timestamp : null,
          locTimestamp: locPhoto ? locPhoto.timestamp : null
        });
      }
    }

    reqTR.onsuccess = () => {
      trPhoto = reqTR.result;
      checkDone();
    };
    reqTR.onerror = () => checkDone();

    reqLoc.onsuccess = () => {
      locPhoto = reqLoc.result;
      checkDone();
    };
    reqLoc.onerror = () => checkDone();
  });
}

/**
 * ลบรูปภาพออกจาก IndexedDB
 */
async function deletePhotoFromDB(trId, type) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(`${trId}_${type}`);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * นับจำนวนรูปภาพทั้งหมดที่บันทึกไว้ในเครื่อง
 */
async function getTotalPhotosCount() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });
}
