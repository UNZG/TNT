function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = JSON.parse(e.postData.contents);
  const sheetName = data.sheet || "log";
  let sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  const payload = data.payload || {};

  // Flatten nested objects thành string nếu cần
  const flat = {};
  for (let key in payload) {
    if (typeof payload[key] === 'object') flat[key] = JSON.stringify(payload[key]);
    else flat[key] = payload[key];
  }

  // Đặt Timestamp ở đầu
  //const timestamp = new Date().toISOString();
  const timestamp = new Date(Date.now() + 7*60*60*1000).toISOString();

  flat["Timestamp"] = timestamp;

  // Sắp xếp keys: Timestamp luôn đầu tiên
  const keys = Object.keys(flat).sort((a, b) => a === "Timestamp" ? -1 : (b === "Timestamp" ? 1 : 0));

  // Tạo header nếu sheet trống
  if (sheet.getLastRow() === 0) sheet.appendRow(keys);

  // Ghi giá trị theo thứ tự keys
  sheet.appendRow(keys.map(k => flat[k]));

  return ContentService.createTextOutput("OK");
}
