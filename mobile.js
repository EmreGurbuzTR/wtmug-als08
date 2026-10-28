let peer = null;
let conn = null;
let qrScannerActive = true;

// Sayfa yüklendiğinde kamerayı ve QR tarayıcıyı başlat
async function initScanner() {
  const status = document.getElementById('mobileStatus');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = document.getElementById('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', true);
    video.play();
    requestAnimationFrame(tick);
    status.innerText = "QR Kod Aranıyor...";
  } catch (err) {
    status.innerText = "Kamera Hatası: " + err.message;
    status.style.color = "var(--danger)";
  }
}

// QR Tarama Döngüsü
function tick() {
  if (!qrScannerActive) return;
  
  const video = document.getElementById('video');
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
      // QR bulundu!
      qrScannerActive = false;
      document.getElementById('mobileStatus').innerText = "Bağlanılıyor...";
      connectToDesktop(code.data); // QR içindeki Peer ID
      return;
    }
  }
  requestAnimationFrame(tick);
}

// Bilgisayara Bağlan
function connectToDesktop(peerId) {
  peer = new Peer();
  
  peer.on('open', () => {
    conn = peer.connect(peerId);
    
    conn.on('open', () => {
      // Bağlantı başarılı, ekranı değiştir
      document.getElementById('scannerScreen').style.display = 'none';
      document.getElementById('transferScreen').style.display = 'flex';
      // Kamerayı kapat
      const video = document.getElementById('video');
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
      }
    });

    conn.on('data', (data) => {
      if (data.type === 'text') {
        addMessage('Karşı Taraf', data.content);
      } 
      else if (data.type === 'file-start') {
        window.incomingFile = { name: data.name, size: data.size, mime: data.mime, chunks: data.chunks };
        window.receivedChunks = [];
      } 
      else if (data.type === 'file-chunk') {
        window.receivedChunks.push(data.data);
        
        let percent = Math.round((window.receivedChunks.length / window.incomingFile.chunks) * 100);
        let pb = document.getElementById('progressBar');
        pb.style.display = 'block';
        document.getElementById('progressFill').style.width = percent + '%';

        if (window.receivedChunks.length === window.incomingFile.chunks) {
          const blob = new Blob(window.receivedChunks, { type: window.incomingFile.mime });
          const url = URL.createObjectURL(blob);
          
          let html = '';
          if (window.incomingFile.mime.startsWith('image/')) {
            html = `<img src="${url}">`;
          } else {
            html = `<a href="${url}" download="${window.incomingFile.name}">📄 ${window.incomingFile.name} (İndir)</a>`;
          }
          addMessage('Karşı Taraf', html, true);
          pb.style.display = 'none';
        }
      }
    });
  });
}

// Metin Gönderme
function sendMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (text && conn && conn.open) {
    conn.send({ type: 'text', content: text });
    addMessage('Ben', text);
    input.value = '';
  }
}

// Dosya Gönderme
function handleFileSelect(input) {
  const file = input.files[0];
  if (!file || !conn || !conn.open) return;
  input.value = '';

  const CHUNK_SIZE = 16 * 1024;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  const reader = new FileReader();
  let offset = 0;
  let chunkIndex = 0;

  conn.send({
    type: 'file-start',
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    chunks: totalChunks
  });

  const previewUrl = URL.createObjectURL(file);
  let html = '';
  if (file.type.startsWith('image/')) {
    html = `<img src="${previewUrl}">`;
  } else {
    html = `<a href="${previewUrl}" download="${file.name}">📄 ${file.name} (Gönderildi)</a>`;
  }
  addMessage('Ben', html, true);

  function readNextChunk() {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    reader.readAsArrayBuffer(slice);
  }

  reader.onload = (e) => {
    if (!conn || !conn.open) return;
    conn.send({ type: 'file-chunk', index: chunkIndex, data: e.target.result });
    
    offset += CHUNK_SIZE;
    chunkIndex++;
    
    let pb = document.getElementById('progressBar');
    pb.style.display = 'block';
    document.getElementById('progressFill').style.width = Math.round((chunkIndex / totalChunks) * 100) + '%';

    if (offset < file.size) {
      readNextChunk();
    } else {
      pb.style.display = 'none';
    }
  };

  readNextChunk();
}

function addMessage(sender, content, isHtml = false) {
  const chatBox = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'msg ' + (sender === 'Ben' ? 'sent' : 'received');
  if (isHtml) div.innerHTML = content;
  else div.textContent = content;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Başlat
initScanner();