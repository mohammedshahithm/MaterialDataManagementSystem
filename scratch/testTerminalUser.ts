import prisma from 'd:/Desktop/MaterialDataManagementSystem/backend/src/config/database';

async function main() {
  const SHARED_TERMINAL_ID = '00000000-0000-0000-0000-000000000001';
  const SHARED_TERMINAL_EMAIL = 'terminal@internal.mdms';
  const SHARED_TERMINAL_NAME = 'Shared Factory Terminal';

  let terminalUser = await prisma.user.findFirst({
    where: {
      OR: [
        { id: SHARED_TERMINAL_ID },
        { email: SHARED_TERMINAL_EMAIL }
      ]
    }
  });

  if (!terminalUser) {
    terminalUser = await prisma.user.create({
      data: {
        id: SHARED_TERMINAL_ID,
        email: SHARED_TERMINAL_EMAIL,
        fullName: SHARED_TERMINAL_NAME,
        role: 'worker'
      }
    });
    console.log('Created Shared Terminal User:', terminalUser);
  } else {
    console.log('Shared Terminal User already exists:', terminalUser);
  }
}

main().catch(console.error);

