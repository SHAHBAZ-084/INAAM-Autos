import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { FinancialYearStatus, PrismaClient } from '@prisma/client';
import {
  bootstrapChartOfAccounts,
  fiscalYearLabelForDate,
} from '../src/modules/accounting/accounting.service';
import { getUploadsDir } from '../src/config/paths';
import { ensureDeveloperPassphraseHash } from '../src/modules/settings/identity-access.service';
import { BUSINESS_SETTINGS_ID, ensureBusinessSettings } from '../src/modules/settings/settings.service';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.DEFAULT_ADMIN_USERNAME ?? 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin123';

  const existing = await prisma.user.findUnique({ where: { username } });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName: 'Shop Owner',
      },
    });
    await prisma.$executeRaw`
      UPDATE User SET role = ${'Owner'} WHERE username = ${username}
    `;
    console.log(`Created default user "${username}". Change the password after first login.`);
  } else {
    await prisma.$executeRaw`
      UPDATE User SET role = COALESCE(NULLIF(role, ''), ${'Owner'}) WHERE id = ${existing.id}
    `;
    console.log(`Default user "${username}" already exists — skipping user seed.`);
  }

  const activeYear = await prisma.financialYear.findFirst({
    where: { status: FinancialYearStatus.ACTIVE },
  });

  if (!activeYear) {
    const now = new Date();
    const { label, startDate } = fiscalYearLabelForDate(now);
    await prisma.financialYear.create({
      data: {
        label,
        startDate,
        status: FinancialYearStatus.ACTIVE,
      },
    });
    console.log(`Created active financial year "${label}".`);
  }

  await bootstrapChartOfAccounts();
  console.log('Chart of accounts bootstrapped.');

  await ensureBusinessSettings();
  await ensureDeveloperPassphraseHash();
  console.log('Business settings ensured.');

  const settings = await prisma.businessSettings.findUnique({ where: { id: BUSINESS_SETTINGS_ID } });
  const defaultLogoCandidates = [
    path.resolve(__dirname, '../../frontend/public/logo.jpg'),
    path.resolve(__dirname, '../../frontend/public/logo.png'),
    path.resolve(__dirname, '../assets/default-logo.png'),
  ];
  const source = defaultLogoCandidates.find((candidate) => fs.existsSync(candidate));
  if (settings && source) {
    const uploadsDir = getUploadsDir();
    const ext = path.extname(source).toLowerCase() || '.jpg';
    const filename = ext === '.jpg' || ext === '.jpeg' ? 'logo-default.jpg' : 'logo-default.png';
    const dest = path.join(uploadsDir, filename);
    const relativePath = path.join('uploads', filename);
    const shouldSeedLogo =
      !settings.logoPath ||
      settings.logoPath.includes('logo-default.png') ||
      settings.logoPath.includes('usman');
    if (shouldSeedLogo) {
      fs.copyFileSync(source, dest);
      await prisma.businessSettings.update({
        where: { id: BUSINESS_SETTINGS_ID },
        data: { logoPath: relativePath },
      });
      console.log('Default shop logo seeded.');
    }
  }

  const { ensureDefaultProductCategories } = await import('../src/modules/products/products.service');
  await ensureDefaultProductCategories();
  console.log('Product categories ensured.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
