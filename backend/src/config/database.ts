import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

export default prisma;
