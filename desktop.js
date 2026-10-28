let peer = null;
let conn = null;

// Sunucuya (PeerJS) bağlan ve rastgele bir ID al
function initPeer() {
  peer = new Peer();
  
  peer.on('open', (id) => {
    document.getElementById('pcStatus').innerText = "Hazır (ID: " + id + ")";
    
    // QR Kod Üret
    const qr = qrcode(0, 'M');
    qr.addData(id); // QR içine sadece Peer ID'yi gömüyoruz
    qr.make();
    document.getElementById('qrArea').innerHTML = qr.createImgTag(6, 0);
  });

  // Telefon bağlandığında
  peer.on('connection', (connection) => {
    conn = connection;
    setupConnection();
  });
}

function setupConnection() {
  document.getElementById('qrScreen').style.display = 'none';
  document.getElementById('transferScreen').style.display = 'flex';
  
  // Bağlantı kapandığında
  conn.on('close', () => {
    alert("Bağlantı kesildi!");
    location.reload();
  });

  conn.on('data', (data) => {
    // Metin mesajı geldiyse
    if (data.type === 'text') {
      addMessage('Karşı Taraf', data.content);
    } 
    // Dosya başlangıcı geldiyse
    else if (data.type === 'file-start') {
      window.incomingFile = { name: data.name, size: data.size, mime: data.mime, chunks: data.chunks };
      window.receivedChunks = [];
    } 
    // Dosya parçası geldiyse
    else if (data.type === 'file-chunk') {
      window.receivedChunks.push(data.data);
      
      // İlerleme çubuğu
      let percent = Math.round((window.receivedChunks.length / window.incomingFile.chunks) * 100);
      let pb = document.getElementById('progressBar');
      pb.style.display = 'block';
      document.getElementById('progressFill').style.width = percent + '%';

      // Tüm parçalar tamamlandıysa
      if (window.receivedChunks.length === window.incomingFile.chunks) {
        const blob = new Blob(window.receivedChunks, { type: window.incomingFile.mime });
        const url = URL.createObjectURL(blob);
        
        let html = '';
        if (window.incomingFile.mime.startsWith('image/')) {
          html = `<img src="${url}" onclick="window.open('${url}')">`;
        } else {
          html = `<a href="${url}" download="${window.incomingFile.name}">📄 ${window.incomingFile.name} (İndir)</a>`;
        }
        
        addMessage('Karşı Taraf', html, true);
        pb.style.display = 'none';
      }
    }
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
  input.value = ''; // Sıfırla

  const CHUNK_SIZE = 16 * 1024; // 16 KB parçalar
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  const reader = new FileReader();
  let offset = 0;
  let chunkIndex = 0;

  // Başlangıç bilgisini yolla
  conn.send({
    type: 'file-start',
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    chunks: totalChunks
  });

  // Önizleme için URL oluştur
  const previewUrl = URL.createObjectURL(file);
  let html = '';
  if (file.type.startsWith('image/')) {
    html = `<img src="${previewUrl}" onclick="window.open('${previewUrl}')">`;
  } else {
    html = `<a href="${previewUrl}" download="${file.name}">📄 ${file.name} (Gönderildi)</a>`;
  }
  addMessage('Ben', html, true);

  // Parçaları oku ve gönder
  function readNextChunk() {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    reader.readAsArrayBuffer(slice);
  }

  reader.onload = (e) => {
    if (!conn || !conn.open) return;
    conn.send({
      type: 'file-chunk',
      index: chunkIndex,
      data: e.target.result
    });
    
    offset += CHUNK_SIZE;
    chunkIndex++;
    
    // İlerleme çubuğu
    let pb = document.getElementById('progressBar');
    pb.style.display = 'block';
    document.getElementById('progressFill').style.width = Math.round((chunkIndex / totalChunks) * 100) + '%';

    if (offset < file.size) {
      readNextChunk();
    } else {
      pb.style.display = 'none'; // Bitti
    }
  };

  readNextChunk();
}

// Arayüze mesaj ekleme
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
initPeer();