export async function loadBackup(file) {
  const zip = await JSZip.loadAsync(file);
  const jsonEntry = zip.file('backup.json');
  if (!jsonEntry) throw new Error('Not a valid Monomori backup — backup.json not found in ZIP.');
  const jsonText = await jsonEntry.async('text');
  const backupData = JSON.parse(jsonText);
  return { backupData, zip };
}

// filePath is an absolute Android path like /data/user/0/com.monomori/files/images/abc123.jpg
// The ZIP stores images flat under images/
export async function getImageUrl(zip, filePath) {
  if (!filePath || !zip) return null;
  const filename = filePath.split('/').pop();
  const entry = zip.file(`images/${filename}`);
  if (!entry) return null;
  try {
    const blob = await entry.async('blob');
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
