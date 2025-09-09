const btn = document.getElementById('search');
btn?.addEventListener('click', async () => {
  const kw = document.getElementById('kw').value.trim();
  const out = document.getElementById('results');
  if (!kw) { out.textContent = 'キーワードを入力してください。'; return; }
  out.textContent = '検索中…';
  try {
    const url = `https://kokkai.ndl.go.jp/api/speech?recordPacking=json&maximumRecords=3&any=${encodeURIComponent(kw)}`;
    const res = await fetch(url);
    const data = await res.json();
    const list = (data?.["@graph"]?.[0]?.speechRecord) || [];
    if (list.length === 0) { out.textContent = '最近の該当発言が見つかりませんでした。'; return; }
    out.innerHTML = list.map(rec => {
      const s = rec.speech || {};
      const m = rec.meeting || {};
      const who = s.speaker || s.speakerRole || '発言者';
      const date = m.date || '';
      const mtg = m.name || '';
      const text = (s.speech || '').replace(/\s+/g,' ').slice(0,160) + '…';
      const link = s.speechURL || '#';
      return `
        <div style="margin:10px 0;padding:10px;border:1px dashed #2a2f47;border-radius:10px">
          <div><strong>${who}</strong>｜${mtg}（${date}）</div>
          <div style="margin-top:6px">${text}</div>
          <a href="${link}" target="_blank" rel="noopener">全文を読む</a>
        </div>
      `;
    }).join('');
  } catch (e) {
    out.textContent = '取得に失敗しました。時間をおいて再度お試しください。';
  }
});
