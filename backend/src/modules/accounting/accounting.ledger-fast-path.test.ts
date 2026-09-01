import { beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType, VoucherType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  activeFinancialYearStartDate,
  voucherDateInActiveYear,
} from '../../test-helpers/financial-year';
import {
  bootstrapChartOfAccounts,
  createAccount,
  createMultiLegVoucherInTx,
  createVoucher,
  ensureRetailSystemAccounts,
  getActiveFinancialYearId,
  listAccounts,
  recomputeLedgerRunningBalancesInTx,
  updateVoucherAmount,
} from './accounting.service';
import { compareLedgerEntries, computeLedgerBalance } from './ledger-utils';

async function accountByName(name: string) {
  const accounts = await listAccounts();
  const account = accounts.find((a) => a.name === name);
  if (!account?.ledger) throw new Error(`Account not found: ${name}`);
  return account;
}

async function ledgerEntryBalancesForYear(ledgerId: number, financialYearId: number) {
  const year = await prisma.financialYear.findUniqueOrThrow({ where: { id: financialYearId } });
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      ledgerId,
      isReversal: false,
      OR: [
        { voucher: { financialYearId, status: 'ACTIVE' } },
        {
          isOpeningBalance: true,
          createdAt: {
            gte: year.startDate,
            ...(year.endDate ? { lte: year.endDate } : {}),
          },
        },
      ],
    },
    include: { voucher: { select: { date: true, number: true } } },
    orderBy: { id: 'asc' },
  });
  entries.sort(compareLedgerEntries);
  return entries.map((e) => ({ id: e.id, balance: Number(e.balance) }));
}

async function openingBalanceForLedger(ledgerId: number, financialYearId: number) {
  const ledger = await prisma.ledger.findUniqueOrThrow({
    where: { id: ledgerId },
    include: { account: true },
  });
  const year = await prisma.financialYear.findUniqueOrThrow({ where: { id: financialYearId } });
  const priorYear = await prisma.financialYear.findFirst({
    where: { startDate: { lt: year.startDate } },
    orderBy: { startDate: 'desc' },
  });
  if (!priorYear) return 0;
  const snapshot = await prisma.financialYearClosingBalance.findUnique({
    where: {
      financialYearId_accountId: {
        financialYearId: priorYear.id,
        accountId: ledger.accountId,
      },
    },
  });
  return snapshot ? Number(snapshot.balance) : 0;
}

async function assertRunningBalancesWalkCorrectly(ledgerId: number, financialYearId: number) {
  const year = await prisma.financialYear.findUniqueOrThrow({ where: { id: financialYearId } });
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      ledgerId,
      isReversal: false,
      OR: [
        { voucher: { financialYearId, status: 'ACTIVE' } },
        {
          isOpeningBalance: true,
          createdAt: {
            gte: year.startDate,
            ...(year.endDate ? { lte: year.endDate } : {}),
          },
        },
      ],
    },
    include: { voucher: { select: { date: true, number: true } } },
    orderBy: { id: 'asc' },
  });
  entries.sort(compareLedgerEntries);

  let running = await openingBalanceForLedger(ledgerId, financialYearId);
  for (const entry of entries) {
    const debit = entry.type === LedgerEntryType.DEBIT ? Number(entry.amount) : 0;
    const credit = entry.type === LedgerEntryType.CREDIT ? Number(entry.amount) : 0;
    running = computeLedgerBalance(running, debit, credit);
    expect(Number(entry.balance)).toBeCloseTo(running, 2);
  }

  const ledger = await prisma.ledger.findUniqueOrThrow({ where: { id: ledgerId } });
  expect(Number(ledger.balance)).toBeCloseTo(running, 2);
}

describe('ledger running balance fast path', () => {
  let userId: number;
  let financialYearId: number;
  let cashId: number;
  let cashLedgerId: number;
  let expenseId: number;
  let salesId: number;
  let voucherDate: string;
  let yearStartDate: string;

  beforeAll(async () => {
    voucherDate = await voucherDateInActiveYear();
    yearStartDate = await activeFinancialYearStartDate();
    financialYearId = await getActiveFinancialYearId(prisma);
    await bootstrapChartOfAccounts();

    const user = await prisma.user.findFirst();
    if (!user) throw new Error('Seed admin user first');
    userId = user.id;

    const cash = await accountByName('Cash in Hand');
    cashId = cash.id;
    cashLedgerId = cash.ledger!.id;

    const expenseCat = await prisma.accountCategory.findFirst({ where: { name: 'Expenses' } });
    let expenseCatId: number;
    if (!expenseCat) {
      const createdCat = await prisma.accountCategory.create({ data: { name: 'Expenses' } });
      expenseCatId = createdCat.id;
    } else {
      expenseCatId = expenseCat.id;
    }

    let expense = await prisma.account.findFirst({
      where: { categoryId: expenseCatId, isActive: true, name: { contains: 'Electricity' } },
    });
    if (!expense) {
      expense = await createAccount({
        categoryId: expenseCatId,
        name: 'Electricity Expense',
        code: 'EXP-FP-ELEC',
        type: 'EXPENSE',
      });
    }
    expenseId = expense.id;

    const retailAccounts = await prisma.$transaction(async (tx) => ensureRetailSystemAccounts(tx));
    salesId = retailAccounts.saleRevenue.id;
  });

  it('ascending same-day postings match full recompute balances exactly', async () => {
    const amounts = [100, 250, 75];
    const refs = amounts.map((_, i) => `FP-ASC-${Date.now()}-${i}`);

    for (let i = 0; i < amounts.length; i++) {
      await createVoucher({
        type: 'PAYMENT',
        debitAccountId: expenseId,
        creditAccountId: cashId,
        amount: amounts[i]!,
        date: voucherDate,
        description: `Fast path ascending ${i}`,
        reference: refs[i]!,
        createdById: userId,
      });
    }

    const beforeRecompute = await ledgerEntryBalancesForYear(cashLedgerId, financialYearId);

    await prisma.$transaction(async (tx) => {
      await recomputeLedgerRunningBalancesInTx(tx, cashLedgerId, financialYearId);
    });

    const afterRecompute = await ledgerEntryBalancesForYear(cashLedgerId, financialYearId);

    expect(afterRecompute).toEqual(beforeRecompute);
    await assertRunningBalancesWalkCorrectly(cashLedgerId, financialYearId);
  });

  it('backdated posting falls back to full recompute and updates downstream entries', async () => {
    const laterRef = `FP-LATE-${Date.now()}`;
    const earlyRef = `FP-EARLY-${Date.now()}`;

    const laterVoucher = await createVoucher({
      type: 'RECEIPT',
      debitAccountId: cashId,
      creditAccountId: salesId,
      amount: 500,
      date: voucherDate,
      description: 'Later dated receipt',
      reference: laterRef,
      createdById: userId,
    });

    const laterEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { voucherId: laterVoucher.id, ledgerId: cashLedgerId, isReversal: false },
    });
    const balanceAfterLater = Number(laterEntry.balance);

    await createVoucher({
      type: 'RECEIPT',
      debitAccountId: cashId,
      creditAccountId: salesId,
      amount: 200,
      date: yearStartDate,
      description: 'Backdated receipt',
      reference: earlyRef,
      createdById: userId,
    });

    const laterEntryAfterBackdate = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: laterEntry.id },
    });
    expect(Number(laterEntryAfterBackdate.balance)).toBeCloseTo(balanceAfterLater + 200, 2);

    await assertRunningBalancesWalkCorrectly(cashLedgerId, financialYearId);
  });

  it('multi-leg voucher with two legs on the same ledger chains running balances', async () => {
    const sourceRef = `FP-MULTI-LEG-${Date.now()}`;
    const chainCat = await prisma.accountCategory.create({ data: { name: `Chain Test ${Date.now()}` } });
    const chainAccount = await createAccount({
      categoryId: chainCat.id,
      name: 'Chain Test Cash',
      code: `CHN-${Date.now()}`,
      type: 'ASSET',
    });
    const chainLedgerId = chainAccount.ledger!.id;
    const cashBefore = 0;

    await prisma.$transaction(async (tx) => {
      await createMultiLegVoucherInTx(tx, {
        type: VoucherType.ADJUSTMENT,
        amount: 50,
        date: voucherDate,
        description: 'Two debits on one ledger',
        sourceType: 'ADJUSTMENT',
        sourceRef,
        createdById: userId,
        legs: [
          { accountId: chainAccount.id, type: LedgerEntryType.DEBIT, amount: 30 },
          { accountId: chainAccount.id, type: LedgerEntryType.DEBIT, amount: 20 },
          { accountId: salesId, type: LedgerEntryType.CREDIT, amount: 50 },
        ],
      });
    });

    const voucher = await prisma.voucher.findFirstOrThrow({
      where: { sourceType: 'ADJUSTMENT', sourceRef },
    });
    const chainEntries = await prisma.ledgerEntry.findMany({
      where: { voucherId: voucher.id, ledgerId: chainLedgerId, isReversal: false },
      orderBy: { id: 'asc' },
    });
    expect(chainEntries).toHaveLength(2);

    expect(Number(chainEntries[0]!.balance)).toBeCloseTo(cashBefore + 30, 2);
    expect(Number(chainEntries[1]!.balance)).toBeCloseTo(cashBefore + 50, 2);
    expect(Number(chainEntries[1]!.balance) - Number(chainEntries[0]!.balance)).toBeCloseTo(20, 2);

    await assertRunningBalancesWalkCorrectly(chainLedgerId, financialYearId);
  });

  it('updateVoucherAmount on a non-latest entry cascades to later entries via full recompute', async () => {
    const earlyRef = `FP-UPD-EARLY-${Date.now()}`;
    const lateRef = `FP-UPD-LATE-${Date.now()}`;

    const earlyVoucher = await createVoucher({
      type: 'RECEIPT',
      debitAccountId: cashId,
      creditAccountId: salesId,
      amount: 100,
      date: yearStartDate,
      description: 'Early receipt for update test',
      reference: earlyRef,
      createdById: userId,
    });

    const lateVoucher = await createVoucher({
      type: 'RECEIPT',
      debitAccountId: cashId,
      creditAccountId: salesId,
      amount: 50,
      date: voucherDate,
      description: 'Late receipt for update test',
      reference: lateRef,
      createdById: userId,
    });

    const lateEntryBefore = await prisma.ledgerEntry.findFirstOrThrow({
      where: { voucherId: lateVoucher.id, ledgerId: cashLedgerId, isReversal: false },
    });
    const lateBalanceBefore = Number(lateEntryBefore.balance);

    await updateVoucherAmount(earlyVoucher.id, 200, userId);

    const lateEntryAfter = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: lateEntryBefore.id },
    });
    expect(Number(lateEntryAfter.balance)).toBeCloseTo(lateBalanceBefore + 100, 2);

    await assertRunningBalancesWalkCorrectly(cashLedgerId, financialYearId);
  });
});
