import { PrismaClient, UserRole } from "@prisma/client";
import { SAMPLE_ADMIN, SAMPLE_MEMBER } from "../src/lib/default-users";
import { BOOKING_POLICY_ID, DEFAULT_PET_NOTICE } from "../src/lib/booking-policy";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function ensureUserWithStarterPassword({
  email,
  name,
  role,
  starterPassword
}: {
  email: string;
  name: string;
  role: UserRole;
  starterPassword: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true }
  });

  if (!existing) {
    return prisma.user.create({
      data: {
        email,
        name,
        role,
        isActive: true,
        passwordHash: hashPassword(starterPassword)
      }
    });
  }

  if (!existing.passwordHash) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: hashPassword(starterPassword)
      }
    });
  }

  return prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
}

async function main() {
  await prisma.bookingPolicy.upsert({
    where: { id: BOOKING_POLICY_ID },
    update: {},
    create: { id: BOOKING_POLICY_ID, petNotice: DEFAULT_PET_NOTICE }
  });

  let feeConfig = await prisma.feeConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" }
  });

  if (!feeConfig) {
    feeConfig = await prisma.feeConfig.create({
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
  }

  const peakSummer = await prisma.seasonalRate.findFirst({
    where: { feeConfigId: feeConfig.id, name: "Peak Summer" }
  });

  if (!peakSummer) {
    await prisma.seasonalRate.create({
      data: {
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
    });
  }

  await prisma.room.createMany({
    data: [
      { code: "MAIN-01", name: "Main Bedroom", capacity: 2 },
      { code: "FAM-02", name: "Family Room", capacity: 4 },
      { code: "TWIN-03", name: "Twin Room", capacity: 2 },
      { code: "BUNK-04", name: "Bunk Room", capacity: 4 }
    ],
    skipDuplicates: true
  });

  const superAdmin = await ensureUserWithStarterPassword({
    email: SAMPLE_ADMIN.email,
    name: SAMPLE_ADMIN.name,
    role: UserRole.SUPER_ADMIN,
    starterPassword: SAMPLE_ADMIN.password
  });

  const member = await ensureUserWithStarterPassword({
    email: SAMPLE_MEMBER.email,
    name: SAMPLE_MEMBER.name,
    role: UserRole.FAMILY_MEMBER,
    starterPassword: SAMPLE_MEMBER.password
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

  await prisma.subscription.upsert({
    where: { userId: member.id },
    update: {},
    create: {
      userId: member.id,
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
