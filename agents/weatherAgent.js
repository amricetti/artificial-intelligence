const https = require('https');

// Coordenadas de Curitiba - PR (Guabirotuba: -25.4610, -49.2550)
const LAT = process.env.LATITUDE || '-25.4610';
const LON = process.env.LONGITUDE || '-49.2550';

/**
 * Retorna o objeto Date da próxima terça-feira
 */
function getProximaTercaObj() {
  const agora = new Date();
  const diaSemana = agora.getDay(); // 0 = Domingo, 2 = Terça
  let diasAteTerca = (2 - diaSemana + 7) % 7;
  
  // Se hoje for terça-feira após as 20h, projeta para a próxima terça
  if (diasAteTerca === 0 && agora.getHours() >= 20) {
    diasAteTerca = 7;
  }

  const proximaTerca = new Date(agora);
  proximaTerca.setDate(agora.getDate() + diasAteTerca);
  return proximaTerca;
}

/**
 * Retorna a data no formato "DD/MM/YY (terça-feira)"
 */
function getProximaTercaFormatada() {
  const t = getProximaTercaObj();
  const dia = String(t.getDate()).padStart(2, '0');
  const mes = String(t.getMonth() + 1).padStart(2, '0');
  const ano = String(t.getFullYear()).slice(-2);
  return `${dia}/${mes}/${ano} (terça-feira)`;
}

function getProximaTercaISO() {
  const t = getProximaTercaObj();
  const dia = String(t.getDate()).padStart(2, '0');
  const mes = String(t.getMonth() + 1).padStart(2, '0');
  const ano = t.getFullYear();
  return `${ano}-${mes}-${dia}`;
}

/**
 * Previsão do tempo para Curitiba na próxima terça-feira às 19:30
 */
async function obterPrevisaoProximaTerca() {
  const dataISO = getProximaTercaISO();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m,precipitation_probability,weathercode&timezone=America%2FSao_Paulo`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const times = json.hourly.time;
          
          const index = times.findIndex(t => t.startsWith(`${dataISO}T19:00`));

          if (index !== -1) {
            const temp = Math.round(json.hourly.temperature_2m[index]);
            const chuvaProb = json.hourly.precipitation_probability[index] || 0;

            let icone = '🌤️';
            let condicao = 'Tempo Firme';

            if (chuvaProb > 50) {
              icone = '🌧️';
              condicao = 'Chuva Provável';
            } else if (chuvaProb > 25) {
              icone = '⛅';
              condicao = 'Possibilidade de Chuva Fina';
            }

            resolve(`${icone} ${temp}°C, ${condicao} (${chuvaProb}% chance de chuva)`);
          } else {
            resolve(`🌤️ 20°C, Sem previsão de chuva forte`);
          }
        } catch (e) {
          resolve(`🌤️ Clima favorável para o jogo`);
        }
      });
    }).on('error', () => {
      resolve(`🌤️ Clima favorável para o jogo`);
    });
  });
}

module.exports = {
  obterPrevisaoProximaTerca,
  getProximaTercaFormatada,
  getProximaTercaObj
};
