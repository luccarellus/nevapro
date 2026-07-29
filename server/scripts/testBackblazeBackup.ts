import 'dotenv/config';
import { verifyB2BackupStorage } from '../services/b2BackupStorage';

async function main() {
  console.log('🔍 Verificando conexão e permissões do Backblaze B2 para backups...\n');

  try {
    const result = await verifyB2BackupStorage();
    console.log(`✅ Conexão Backblaze B2 verificada com sucesso!`);
    console.log(`- Bucket: "${result.bucket}"`);
    console.log(`- Teste de gravação e deleção efetuado em: "${result.testKey}"`);
    console.log(`- Retenção configurada: ${result.retentionDays} dias`);
  } catch (error) {
    console.error('❌ Falha na verificação da Backblaze B2 para backups:');
    console.error(error);
    process.exitCode = 1;
  }
}

void main();
