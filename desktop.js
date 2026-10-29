let peer = null;
let conn = null;

// Sunucuya (PeerJS) baÄŸlan ve rastgele bir ID al
function initPeer() {
  peer = new Peer();
  
  peer.on('open', (id) => {
    document.getElementById('pcStatus').innerText = "HazÄ±r (ID: " + id + ")";
    
    // QR Kod Ãœret
    const qr = qrcode(0, 'M');
    qr.addData(id); // QR iÃ§ine sadece Peer ID'yi gÃ¶mÃ¼yoruz
    qr.make();
    document.getElementById('qrArea').innerHTML = qr.createImgTag(6, 0);
  });

  // Telefon baÄŸlandÄ±ÄŸÄ±nda
  peer.on('connection', (connection) => {
    conn = connection;
    setupConnection();
  });
}

function setupConnection() {
  document.getElementById('qrScreen').style.display = 'none';
  document.getElementById('transferScreen').style.display = 'flex';
  
  // BaÄŸlantÄ± kapandÄ±ÄŸÄ±nda
  conn.on('close', () => {
    alert("BaÄŸlantÄ± kesildi!");
    location.reload();
  });

  conn.on('data', (data) => {
    // Metin mesajÄ± geldiyse
    if (data.type === 'text') {
      addMessage('KarÅŸÄ± Taraf', data.content);
    } 
    // Dosya baÅŸlangÄ±cÄ± geldiyse
    else if (data.type === 'file-start') {
      window.incomingFile = { name: data.name, size: data.size, mime: data.mime, chunks: data.chunks };
      window.receivedChunks = [];
    } 
    // Dosya parÃ§asÄ± geldiyse
    else if (data.type === 'file-chunk') {
      window.receivedChunks.push(data.data);
      
      // Ä°lerleme Ã§ubuÄŸu
      let percent = Math.round((window.receivedChunks.length / window.incomingFile.chunks) * 100);
      let pb = document.getElementById('progressBar');
      pb.style.display = 'block';
      document.getElementById('progressFill').style.width = percent + '%';

      // TÃ¼m parÃ§alar tamamlandÄ±ysa
      if (window.receivedChunks.length === window.incomingFile.chunks) {
        const blob = new Blob(window.receivedChunks, { type: window.incomingFile.mime });
        const url = URL.createObjectURL(blob);
        
        let html = '';
        if (window.incomingFile.mime.startsWith('image/')) {
          html = `<img src="${url}" onclick="window.open('${url}')">`;
        } else {
          html = `<a href="${url}" download="${window.incomingFile.name}">ğŸ“„ ${window.incomingFile.name} (Ä°ndir)</a>`;
        }
        
        addMessage('KarÅŸÄ± Taraf', html, true);
        pb.style.display = 'none';
      }
    }
  });
}

// Metin GÃ¶nderme
function sendMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (text && conn && conn.open) {
    conn.send({ type: 'text', content: text });
    addMessage('Ben', text);
    input.value = '';
  }
}

// Dosya GÃ¶nderme
function handleFileSelect(input) {
  const file = input.files[0];
  if (!file || !conn || !conn.open) return;
  input.value = ''; // SÄ±fÄ±rla

  const CHUNK_SIZE = 16 * 1024; // 16 KB parÃ§alar
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  const reader = new FileReader();
  let offset = 0;
  let chunkIndex = 0;

  // BaÅŸlangÄ±Ã§ bilgisini yolla
  conn.send({
    type: 'file-start',
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    chunks: totalChunks
  });

  // Ã–nizleme iÃ§in URL oluÅŸtur
  const previewUrl = URL.createObjectURL(file);
  let html = '';
  if (file.type.startsWith('image/')) {
    html = `<img src="${previewUrl}" onclick="window.open('${previewUrl}')">`;
  } else {
    html = `<a href="${previewUrl}" download="${file.name}">ğŸ“„ ${file.name} (GÃ¶nderildi)</a>`;
  }
  addMessage('Ben', html, true);

  // ParÃ§alarÄ± oku ve gÃ¶nder
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
    
    // Ä°lerleme Ã§ubuÄŸu
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

// ArayÃ¼ze mesaj ekleme
function addMessage(sender, content, isHtml = false) {
  const chatBox = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'msg ' + (sender === 'Ben' ? 'sent' : 'received');
  if (isHtml) div.innerHTML = content;
  else div.textContent = content;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// BaÅŸlat
initPeer();