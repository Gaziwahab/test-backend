const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const filePath = path.join(__dirname, 'test_results.csv');
    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);

    const FormData = global.FormData || (await import('formdata-node')).FormData;
    // Try to use global FormData, otherwise fallback to formdata-node
    const form = new FormData();
    // If using formdata-node, append accepts Blob or stream differently; try simple approach
    form.append('file', stream, 'test_results.csv');

    const fetchFn = global.fetch || (await import('node-fetch')).default;
    const res = await fetchFn('http://localhost:5000/api/students/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders ? form.getHeaders() : {}
    });

    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
  } catch (err) {
    console.error('Upload test error:', err);
  }
})();
