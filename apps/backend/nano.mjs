import { hash } from 'bcryptjs';
const h = await hash('Conductor2026!', 10);
console.log(h);