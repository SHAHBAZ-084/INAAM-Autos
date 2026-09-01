const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'frontend', 'public', 'logo.jpg');
  const fallback = path.join(root, 'frontend', 'public', 'logo.png');
  const logoSource = fs.existsSync(source) ? source : fallback;
  if (!fs.existsSync(logoSource)) throw new Error('frontend/public/logo.jpg missing');

  const uploadsDir = path.join(root, 'backend', 'prisma', 'data', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const ext = path.extname(logoSource).toLowerCase();
  const filename = ext === '.jpg' || ext === '.jpeg' ? 'logo-default.jpg' : 'logo-default.png';
  const dest = path.join(uploadsDir, filename);
  fs.copyFileSync(logoSource, dest);

  const prisma = new PrismaClient();
  await prisma.businessSettings.update({
    where: { id: 1 },
    data: { logoPath: path.join('uploads', filename) },
  });
  console.log('Updated shop logo at', dest);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
