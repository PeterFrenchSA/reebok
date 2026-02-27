import { ManageBookingPage } from "@/components/ManageBookingPage";

type Props = {
  searchParams: Promise<{ reference?: string; token?: string; email?: string }>;
};

export default async function BookingManagePage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <ManageBookingPage
      initialReference={params.reference}
      initialToken={params.token}
      initialEmail={params.email}
    />
  );
}
