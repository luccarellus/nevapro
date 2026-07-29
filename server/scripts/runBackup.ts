import 'dotenv/config';
import { runDatabaseBackup } from '../services/b2BackupStorage';

async function main() {
  console.log('📦 Executando backup manual do banco de dados para a Backblaze B2...\n');

  try {
    const result = await runDatabaseBackup();
    console.log('✅ Backup concluído com sucesso!');
    console.log(`- Bucket: ${result.bucket}`);
    console.log(`- Chave (caminho): ${result.key}`);
    console.log(`- Tamanho comprimido: ${(result.compressedSizeBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Tamanho original: ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Duração: ${(result.durationMs / 1000).toFixed(2)} segundos`);
    console.log(`- Método: ${result.method}`);
    if (result.tableCount > 0) {
      console.log(`- Tabelas incluídas: ${result.tableCount}`);
    }
    console.log(`- Backups antigos expirados removidos: ${result.prunedCount}`);
  } catch (error) {
    console.error('❌ Falha ao realizar o backup:');
    console.error(error);
    process.exitCode = 1;
  }
}

void main();
