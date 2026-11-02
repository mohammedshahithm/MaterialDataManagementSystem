async function testUpload() {
  const productId = 'f3cf8ef0-795a-4f2d-97e8-124f6a6fad27';
  
  // Create sample 100x100 PNG using raw buffer or valid PNG
  // 1x1 PNG:
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(pngBase64, 'base64');
  
  const formData = new FormData();
  const blob = new Blob([pngBuffer], { type: 'image/png' });
  formData.append('file', blob, 'micro1.png');
  formData.append('category', 'microstructure');
  formData.append('slotIndex', '0');

  console.log('Sending upload request...');
  const res = await fetch(`http://127.0.0.1:3001/api/products/${productId}/files/upload`, {
    method: 'POST',
    body: formData,
  });
  console.log('Upload status:', res.status);
  const data = await res.json();
  console.log('Upload response:', data);
}

testUpload();

