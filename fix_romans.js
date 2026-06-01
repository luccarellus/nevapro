import fs from 'fs';
import path from 'path';

const filesToFix = [
  path.join(process.cwd(), 'src', 'data', 'cidades_escolas.json'),
  path.join(process.cwd(), 'src', 'data', 'schools.json')
];

// Regex para encontrar numerais romanos com a primeira letra maiúscula e o resto minúsculo.
// Exemplos que ele pega: " Ii", " Iii", " Iv", " Vi", " Vii", " Viii", " Ix", " Xi", " Xii", " Xiv", " Xv"
// O \b garante que é uma palavra isolada, mas também consideramos o espaço antes.
const romanRegex = /\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii|Xiii|Xiv|Xv|Xvi|Xvii|Xviii|Xix|Xx)\b/g;

function fixRomanNumerals(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(romanRegex, (match) => match.toUpperCase());
}

for (const filePath of filesToFix) {
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      
      // Como é JSON, vamos fazer o parse para garantir que não alteramos chaves, apenas os valores das escolas.
      let json = JSON.parse(data);
      let changedCount = 0;

      // Iterar dependendo da estrutura do JSON (pode ser array direto ou objeto)
      if (Array.isArray(json)) {
        json = json.map(item => {
          let modified = false;
          // Verifica se existe a chave 'school'
          if (item.school) {
            const fixed = fixRomanNumerals(item.school);
            if (fixed !== item.school) {
              item.school = fixed;
              modified = true;
            }
          }
          // Verifica se existe a chave 'name' (caso schools.json use name em vez de school)
          if (item.name) {
            const fixed = fixRomanNumerals(item.name);
            if (fixed !== item.name) {
              item.name = fixed;
              modified = true;
            }
          }
          if (modified) changedCount++;
          return item;
        });
      }

      // Salva de volta
      if (changedCount > 0) {
        fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
        console.log(`✅ Corrigido: ${changedCount} escolas em ${path.basename(filePath)}`);
      } else {
        console.log(`👍 Nenhuma correção necessária em ${path.basename(filePath)}`);
      }

    } catch (err) {
      console.error(`❌ Erro ao processar ${path.basename(filePath)}:`, err.message);
    }
  } else {
    console.warn(`⚠️ Arquivo não encontrado: ${filePath}`);
  }
}
