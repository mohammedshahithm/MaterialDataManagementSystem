import prisma from 'd:/Desktop/MaterialDataManagementSystem/backend/src/config/database';

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, role: true }
  });
  console.log('Existing users in DB:', JSON.stringify(users, null, 2));
}

main().catch(console.error);

