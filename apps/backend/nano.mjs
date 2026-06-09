import { hash } from 'bcryptjs';
const h = await hash('Admin123!', 10);
console.log(h);