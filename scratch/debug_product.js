async function test() {
  try {
    const bRes = await fetch('http://127.0.0.1:3001/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchName: 'DebugBatch-' + Date.now() }),
    });
    const b = await bRes.json();
    console.log('Batch response:', bRes.status, b);

    const dRes = await fetch(`http://127.0.0.1:3001/api/batches/${b.id}/dates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDate: '2026-11-02' }),
    });
    const d = await dRes.json();
    console.log('Date response:', dRes.status, d);

    const pRes = await fetch(`http://127.0.0.1:3001/api/dates/${d.id}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName: 'Debug Product', productCode: 'DBG-' + Date.now() }),
    });
    const p = await pRes.json();
    console.log('Product response:', pRes.status, p);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();

