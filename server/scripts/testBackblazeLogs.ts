import 'dotenv/config';
import { verifyB2LogStorage } from '../services/b2LogStorage';

try {
  const result = await verifyB2LogStorage();
  console.log(`Conexão Backblaze verificada no bucket "${result.bucket}".`);
  console.log(`Prefixo de logs disponível em "${result.markerKey}".`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Falha ao verificar a Backblaze: ${message}`);
  process.exitCode = 1;
}
