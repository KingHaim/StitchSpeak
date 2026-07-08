import { runRecoveryDrill } from '../services/recoveryDrill.js';

const result = await runRecoveryDrill();
console.log(JSON.stringify({ status: 'ok', ...result }));
