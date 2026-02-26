import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const feeConfig = await prisma.feeConfig.create({
    data: {
      monthlyMemberSubscription: 100,
      memberNightRate: 50,
      dependentWithMemberNightRate: 25,
      dependentWithoutMemberNightRate: 50,
      guestOfMemberNightRate: 50,
      guestOfDependentNightRate: 25,
      mereFamilyNightRate: 200,
      externalAdultNightRate: 400,
      externalChildNightRate: 200,
      overdueReminderEnabled: true
    }
  });

  await prisma.seasonalRate.createMany({
    data: [
      {
        feeConfigId: feeConfig.id,
        name: "Peak Summer",
        startMonth: 12,
        startDay: 1,
        endMonth: 1,
        endDay: 15,
        priority: 100,
        externalAdultNightRate: 500,
        externalChildNightRate: 250,
        enabled: true
      }
    ]
  });

  await prisma.room.createMany({
    data: [
      { code: "MAIN-01", name: "Main Bedroom", capacity: 2 },
      { code: "FAM-02", name: "Family Room", capacity: 4 },
      { code: "TWIN-03", name: "Twin Room", capacity: 2 },
      { code: "BUNK-04", name: "Bunk Room", capacity: 4 }
    ],
    skipDuplicates: true
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@sandeney.co.za" },
    update: {},
    create: {
      email: "admin@sandeney.co.za",
      name: "Sandeney Admin",
      role: UserRole.SUPER_ADMIN,
      isActive: true
    }
  });

  await prisma.subscription.upsert({
    where: { userId: superAdmin.id },
    update: {},
    create: {
      userId: superAdmin.id,
      monthlyAmount: 100,
      reminderEnabled: true
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
