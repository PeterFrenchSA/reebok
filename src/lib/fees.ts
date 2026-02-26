import type { FeeConfig, SeasonalRate } from "@prisma/client";

export type FeeInput = {
  source: "INTERNAL" | "EXTERNAL_PUBLIC";
  startDate: Date;
  nights: number;
  counts: {
    member: number;
    dependentWithMember: number;
    dependentWithoutMember: number;
    guestOfMember: number;
    guestOfDependent: number;
    mereFamily: number;
    visitorAdult: number;
    visitorChildUnder6: number;
  };
};

export type FeeBreakdown = {
  lineItems: Array<{ label: string; amount: number }>;
  total: number;
  currency: string;
  effectiveRateName?: string;
};

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

function isDateInSeason(date: Date, rate: SeasonalRate): boolean {
  const monthDay = date.getMonth() + 1 + date.getDate() / 100;
  const seasonStart = rate.startMonth + rate.startDay / 100;
  const seasonEnd = rate.endMonth + rate.endDay / 100;

  if (seasonStart <= seasonEnd) {
    return monthDay >= seasonStart && monthDay <= seasonEnd;
  }

  // Wraps year-end (e.g. Nov -> Jan).
  return monthDay >= seasonStart || monthDay <= seasonEnd;
}

function pickSeasonalRate(date: Date, seasonalRates: SeasonalRate[]): SeasonalRate | undefined {
  return seasonalRates
    .filter((rate) => rate.enabled && isDateInSeason(date, rate))
    .sort((a, b) => b.priority - a.priority)[0];
}

export function calculateBookingFees(
  input: FeeInput,
  feeConfig: FeeConfig,
  seasonalRates: SeasonalRate[] = []
): FeeBreakdown {
  const nights = Math.max(1, input.nights);
  const items: Array<{ label: string; amount: number }> = [];

  if (input.source === "INTERNAL") {
    items.push(
      {
        label: "Members",
        amount: asNumber(feeConfig.memberNightRate) * input.counts.member * nights
      },
      {
        label: "Dependents (with member)",
        amount:
          asNumber(feeConfig.dependentWithMemberNightRate) *
          input.counts.dependentWithMember *
          nights
      },
      {
        label: "Dependents (without member)",
        amount:
          asNumber(feeConfig.dependentWithoutMemberNightRate) *
          input.counts.dependentWithoutMember *
          nights
      },
      {
        label: "Guests of member",
        amount: asNumber(feeConfig.guestOfMemberNightRate) * input.counts.guestOfMember * nights
      },
      {
        label: "Guests of dependent",
        amount:
          asNumber(feeConfig.guestOfDependentNightRate) * input.counts.guestOfDependent * nights
      },
      {
        label: "Mere family",
        amount: asNumber(feeConfig.mereFamilyNightRate) * input.counts.mereFamily * nights
      }
    );
  } else {
    const activeSeason = pickSeasonalRate(input.startDate, seasonalRates);
    const adultRate = activeSeason
      ? asNumber(activeSeason.externalAdultNightRate)
      : asNumber(feeConfig.externalAdultNightRate);
    const childRate = activeSeason
      ? asNumber(activeSeason.externalChildNightRate)
      : asNumber(feeConfig.externalChildNightRate);

    items.push(
      {
        label: "External visitors (adult)",
        amount: adultRate * input.counts.visitorAdult * nights
      },
      {
        label: "External visitors (child under 6)",
        amount: childRate * input.counts.visitorChildUnder6 * nights
      }
    );

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const minWholeHouse = asNumber(feeConfig.externalWholeHouseMinRate);

    if (minWholeHouse > 0 && subtotal < minWholeHouse) {
      items.push({
        label: "Whole-house minimum adjustment",
        amount: minWholeHouse - subtotal
      });
    }

    return {
      lineItems: items,
      total: items.reduce((sum, item) => sum + item.amount, 0),
      currency: feeConfig.currency,
      effectiveRateName: activeSeason?.name
    };
  }

  return {
    lineItems: items,
    total: items.reduce((sum, item) => sum + item.amount, 0),
    currency: feeConfig.currency
  };
}

export function buildSubscriptionCoverage(periodStart: Date, monthsCovered: number): {
  periodStart: Date;
  periodEnd: Date;
} {
  const start = new Date(periodStart);
  const end = new Date(start);
  end.setMonth(end.getMonth() + monthsCovered);
  end.setDate(end.getDate() - 1);

  return { periodStart: start, periodEnd: end };
}
