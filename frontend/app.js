const fileInput = document.getElementById('fileInput');
const runButton = document.getElementById('runButton');
const status = document.getElementById('status');

function log(message) {
  status.textContent += `${message}\n`;
}

async function loadConfig() {
  const response = await fetch('config.json');
  if (!response.ok) {
    throw new Error('config.json が取得できませんでした');
  }
  return response.json();
}

runButton.addEventListener('click', async () => {
  status.textContent = '';

  const file = fileInput.files?.[0];
  if (!file) {
    log('PNGファイルを選択してください。');
    return;
  }

  try {
    const { functionUrl } = await loadConfig();

    log('1) 署名付きURLを取得中...');
    const presignResponse = await fetch(`${functionUrl}presign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentType: file.type })
    });
    if (!presignResponse.ok) {
      throw new Error(`presign failed: ${await presignResponse.text()}`);
    }
    const { uploadUrl, key } = await presignResponse.json();

    log(`2) S3へアップロード中: ${key}`);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: file
    });
    if (!uploadResponse.ok) {
      throw new Error(`upload failed: ${uploadResponse.status}`);
    }

    log('3) Lambdaでサムネ生成中...');
    const thumbnailResponse = await fetch(`${functionUrl}thumbnail`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (!thumbnailResponse.ok) {
      throw new Error(`thumbnail failed: ${await thumbnailResponse.text()}`);
    }

    const result = await thumbnailResponse.json();
    log(`完了: ${JSON.stringify(result, null, 2)}`);
  } catch (error) {
    log(`エラー: ${error.message}`);
  }
});
