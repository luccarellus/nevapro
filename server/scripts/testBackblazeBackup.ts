import 'dotenv/config';
import { listB2Backups, verifyB2BackupStorage } from '../services/b2BackupStorage';

async function main() {
  console.log('🔍 Verificando conexão e permissões do Backblaze B2 para backups...\n');

  try {
    const result = await verifyB2BackupStorage();
    console.log(`✅ Conexão Backblaze B2 verificada com sucesso!`);
    console.log(`- Bucket: "${result.bucket}"`);
    console.log(`- Teste de gravação e deleção efetuado em: "${result.testKey}"`);
    console.log(`- Retenção configurada: ${result.retentionDays} dias`);

    const files = await listB2Backups();
    console.log(`\n📋 Arquivos encontrados na pasta de backups do B2 (${files.length}):`);
    files.forEach((f) => {
      console.log(`  - [${f.lastModified.toISOString()}] ${f.key} (${(f.sizeBytes / 1024).toFixed(2)} KB)`);
    });
  } catch (error) {
    console.error('❌ Falha na verificação da Backblaze B2 para backups:');
    console.error(error);
    process.exitCode = 1;
  }
}

void main();
